/**
 * MasinisAlert — main.js
 * Rute: Manggarai > Sudirman > Karet > Tanah Abang > Duri > Angke > Kampung Bandan
 *
 * BUZZER KERAS hanya aktif di dua segmen:
 *   1. Sudirman  → Karet
 *   2. Tanah Abang → Karet
 *
 * Logika buzzer: ketika kereta sedang dalam perjalanan menuju Karet
 *   dari arah Sudirman atau Tanah Abang, alarm berbunyi lebih keras & lebih sering.
 */

// ============================================================
// DATA RUTE & STASIUN
// ============================================================

const STATIONS = [
  { name: "Manggarai",      lat: -6.2138, lng: 106.8506, radius: 350 },
  { name: "Sudirman",       lat: -6.2008, lng: 106.8229, radius: 350 },
  { name: "Karet",          lat: -6.1979, lng: 106.8163, radius: 300 },
  { name: "Tanah Abang",    lat: -6.1877, lng: 106.8134, radius: 350 },
  { name: "Duri",           lat: -6.1710, lng: 106.7971, radius: 350 },
  { name: "Angke",          lat: -6.1598, lng: 106.7844, radius: 350 },
  { name: "Kampung Bandan", lat: -6.1407, lng: 106.7964, radius: 400 },
];

const ROUTE = STATIONS.map(s => ({ lat: s.lat, lng: s.lng }));

// Segmen yang wajib buzzer keras (indeks stasiun TUJUAN)
// Karet = index 2
// Buzzer aktif ketika kereta bergerak dari Sudirman (idx 1) -> Karet (idx 2)
//                                  atau Tanah Abang (idx 3) -> Karet (idx 2)
const BUZZER_DEST_IDX = 2;                // Karet
const BUZZER_SRC_IDXS = new Set([1, 3]); // Sudirman, Tanah Abang

// ============================================================
// STATE
// ============================================================
let trainPos    = { lat: ROUTE[0].lat, lng: ROUTE[0].lng };
let simRunning  = false;
let simT        = 0;
let simInterval = null;
let simSpeed    = 1;
let lastAlertKey   = null;
let alarmLoop      = null;
let gpsWatchId     = null;
let useGPS         = false;
let simKmh         = 0;
let passedStations = new Set();
let audioCtx       = null;

// ============================================================
// AUDIO ENGINE
// ============================================================

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

/**
 * playTone — engine dasar Web Audio API
 * @param {number[]} freqs   - array frekuensi (Hz), diputar berurutan
 * @param {number}   dur     - total durasi (detik)
 * @param {number}   vol     - volume 0–1
 * @param {string}   type    - oscillator type: sine, square, sawtooth, triangle
 */
function playTone(freqs, dur, vol, type = 'square') {
  try {
    const ctx  = getAudioCtx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(vol || 0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.connect(gain);
      const t0 = ctx.currentTime + (i * dur / freqs.length);
      osc.frequency.setValueAtTime(f, t0);
      osc.start(i === 0 ? ctx.currentTime : t0);
      osc.stop(ctx.currentTime + dur + 0.05);
    });
  } catch (e) {
    console.warn('Audio error:', e);
  }
}

/** Peringatan biasa — mendekati stasiun normal */
function playWarning() {
  playTone([880, 660, 880], 0.5, 0.35, 'sine');
}

/** Alarm biasa — tiba di stasiun normal */
function playAlarm() {
  playTone([1200, 800, 1200, 600], 0.8, 0.6, 'sine');
}

/**
 * BUZZER KERAS — hanya untuk segmen Sudirman→Karet / Tanah Abang→Karet
 * Suara square wave keras, frekuensi tinggi, seperti buzzer industri.
 */
function playBuzzer() {
  playTone([1800, 900, 1800, 900, 2200], 1.0, 0.9, 'square');
}

// ============================================================
// DETEKSI BUZZER ZONE
// ============================================================

/**
 * Cek apakah posisi kereta sedang di segmen menuju Karet
 * dari Sudirman atau Tanah Abang.
 *
 * Logika: kita hitung segmen rute mana yang paling dekat dengan trainPos,
 * lalu cek apakah ujung segmen itu adalah Karet & asal-nya ada di BUZZER_SRC_IDXS.
 */
function isInBuzzerZone() {
  const n = ROUTE.length - 1;
  const seg = simT * n;
  const srcIdx = Math.min(Math.floor(seg), n - 1);
  const dstIdx = srcIdx + 1;
  return dstIdx === BUZZER_DEST_IDX && BUZZER_SRC_IDXS.has(srcIdx);
}

// ============================================================
// GEO UTILITIES
// ============================================================

function distM(a, b) {
  const R    = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x    = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function lerpPos(a, b, t) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

function getSimPos(t) {
  const n   = ROUTE.length - 1;
  const seg = t * n;
  const i   = Math.min(Math.floor(seg), n - 1);
  return lerpPos(ROUTE[i], ROUTE[i + 1], seg - i);
}

// ============================================================
// LOG
// ============================================================

function addLog(msg, type = '') {
  const panel = document.getElementById('logPanel');
  const t     = new Date().toTimeString().slice(0, 8);
  const el    = document.createElement('div');
  el.className  = 'log-line ' + type;
  el.textContent = '[' + t + ']  ' + msg;
  panel.insertBefore(el, panel.firstChild);
  while (panel.children.length > 40) panel.removeChild(panel.lastChild);
}

// ============================================================
// RENDER STASIUN
// ============================================================

function renderStations() {
  const list  = document.getElementById('stationList');
  list.innerHTML = '';

  STATIONS.forEach((s, idx) => {
    const d        = distM(trainPos, s);
    const isIn     = d < s.radius;
    const isNear   = !isIn && d < s.radius * 3;
    const isPassed = passedStations.has(s.name) && !isIn;

    // Cek apakah ini adalah Karet di saat sedang di buzzer zone
    const isBuzzerDest = (idx === BUZZER_DEST_IDX) && isInBuzzerZone() && (isNear || !isPassed);

    let cls   = '';
    let badge = '';

    if (isIn)          { cls = 'arrived'; badge = '<span class="st-badge badge-in">Di Sini</span>'; }
    else if (isBuzzerDest) { cls = 'buzzer'; badge = '<span class="st-badge badge-buzzer">⚠ BUZZER</span>'; }
    else if (isNear)   { cls = 'near';    badge = '<span class="st-badge badge-near">Dekat</span>'; }
    else if (isPassed) { cls = 'passed'; }

    const distTxt = d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km';

    const el = document.createElement('div');
    el.className = 'station-item ' + cls;
    el.innerHTML =
      '<div class="st-dot"></div>' +
      '<span class="st-name">' + s.name + '</span>' +
      badge +
      '<span class="st-dist">' + distTxt + '</span>';
    list.appendChild(el);
  });
}

// ============================================================
// GEOFENCE + ALERT LOGIC
// ============================================================

function checkGeofence() {
  let inStation   = null;
  let nearStation = null;

  STATIONS.forEach(s => {
    const d = distM(trainPos, s);
    if (d < s.radius)                         inStation   = s;
    else if (d < s.radius * 3 && !nearStation) nearStation = s;
  });

  const alertBox  = document.getElementById('alertBox');
  const statusVal = document.getElementById('statusVal');
  const buzzerBanner = document.getElementById('buzzerBanner');
  const modalBox  = document.querySelector('.modal-box');

  const inBuzzer  = isInBuzzerZone();

  // Update buzzer banner
  if (inBuzzer && simRunning) {
    buzzerBanner.classList.add('show');
    document.getElementById('gpsDot').className = 'status-dot alarm';
  } else {
    buzzerBanner.classList.remove('show');
  }

  if (inStation) {
    const key = inStation.name + '_in';
    if (lastAlertKey !== key) {
      lastAlertKey = key;
      passedStations.add(inStation.name);

      alertBox.className = 'alert-box danger';
      document.getElementById('alertIcon').textContent = '🚨';
      document.getElementById('alertText').innerHTML =
        '<strong>TIBA: ' + inStation.name.toUpperCase() + '</strong>' +
        'Kereta memasuki area stasiun. Siapkan pemberhentian!';

      statusVal.textContent    = 'Tiba';
      statusVal.style.color    = 'var(--rail-green)';

      if (alarmLoop) clearInterval(alarmLoop);

      // Kalau di buzzer zone → pakai buzzer keras
      if (inBuzzer) {
        playBuzzer();
        alarmLoop = setInterval(playBuzzer, 800);  // interval lebih cepat
        alertBox.className = 'alert-box buzzer-alert';
        document.getElementById('alertIcon').textContent = '🔴';
        document.getElementById('alertText').innerHTML =
          '<strong>⚠ BUZZER — TIBA: ' + inStation.name.toUpperCase() + '</strong>' +
          'Segmen kritis! Perhatian penuh diperlukan.';
        modalBox.classList.add('buzzer-modal');
      } else {
        playAlarm();
        alarmLoop = setInterval(playAlarm, 2200);
        modalBox.classList.remove('buzzer-modal');
      }

      document.getElementById('modalTitle').textContent = 'TIBA DI ' + inStation.name.toUpperCase();
      document.getElementById('modalSub').textContent   =
        'Kereta memasuki area Stasiun ' + inStation.name + '. Lakukan pemberhentian sesuai jadwal.';
      document.getElementById('modalOverlay').classList.add('show');

      if (!inBuzzer) {
        document.getElementById('gpsDot').className = 'status-dot warn';
      }
      addLog('ALARM — Tiba di ' + inStation.name + (inBuzzer ? ' [BUZZER ZONE]' : ''), inBuzzer ? 'buzz' : 'err');
    }

  } else if (nearStation) {
    const key = nearStation.name + '_near';
    if (lastAlertKey !== key) {
      lastAlertKey = key;

      const isBuzzerNear = nearStation.name === STATIONS[BUZZER_DEST_IDX].name && inBuzzer;

      if (isBuzzerNear) {
        // Mendekati Karet dari arah berbahaya
        alertBox.className = 'alert-box buzzer-alert';
        document.getElementById('alertIcon').textContent = '🔴';
        document.getElementById('alertText').innerHTML =
          '<strong>⚠ BUZZER — Mendekati ' + nearStation.name + '</strong>' +
          'Segmen kritis Sudirman/Tanah Abang → Karet. Waspada penuh!';
        statusVal.textContent = 'BUZZER AKTIF';
        statusVal.style.color = 'var(--rail-buzzer)';
        if (alarmLoop) clearInterval(alarmLoop);
        playBuzzer();
        alarmLoop = setInterval(playBuzzer, 1200);
        addLog('BUZZER — Mendekati ' + nearStation.name + ' [ZONA KRITIS]', 'buzz');
      } else {
        alertBox.className = 'alert-box warning';
        document.getElementById('alertIcon').textContent = '⚠️';
        document.getElementById('alertText').innerHTML =
          '<strong>Mendekati ' + nearStation.name + '</strong>' +
          'Persiapkan perlambatan kereta.';
        statusVal.textContent = 'Mendekati';
        statusVal.style.color = 'var(--rail-yellow)';
        if (alarmLoop) clearInterval(alarmLoop);
        playWarning();
        alarmLoop = setInterval(playWarning, 3000);
        if (!inBuzzer) document.getElementById('gpsDot').className = 'status-dot active';
        addLog('PERINGATAN — Mendekati ' + nearStation.name, 'warn');
      }
    }

  } else {
    if (lastAlertKey) {
      lastAlertKey = null;
      alertBox.className = 'alert-box';
      if (alarmLoop) { clearInterval(alarmLoop); alarmLoop = null; }
      if (!inBuzzer) {
        statusVal.textContent = 'Berjalan';
        statusVal.style.color = 'var(--rail-text)';
        document.getElementById('gpsDot').className = 'status-dot active';
      }
    }
  }
}

// ============================================================
// UPDATE UI
// ============================================================

function updateUI() {
  document.getElementById('latVal').textContent   = trainPos.lat.toFixed(5);
  document.getElementById('lngVal').textContent   = trainPos.lng.toFixed(5);
  document.getElementById('spdVal').textContent   = Math.round(simKmh) + ' km/h';
  document.getElementById('speedVal').textContent = Math.round(simKmh);
  document.getElementById('coordOverlay').textContent =
    trainPos.lat.toFixed(4) + ', ' + trainPos.lng.toFixed(4);
  renderStations();
  checkGeofence();
  drawMap();
}

// ============================================================
// CANVAS MAP
// ============================================================

function drawMap() {
  const canvas = document.getElementById('mapCanvas');
  const ctx    = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  const W = canvas.width, H = canvas.height;
  if (!W || !H) return;

  const lats = ROUTE.map(p => p.lat);
  const lngs = ROUTE.map(p => p.lng);
  const pad  = 0.008;
  const minLat = Math.min(...lats) - pad, maxLat = Math.max(...lats) + pad;
  const minLng = Math.min(...lngs) - pad, maxLng = Math.max(...lngs) + pad;

  function xy(lat, lng) {
    const mx = 0.08, my = 0.1;
    return [
      mx * W + ((lng - minLng) / (maxLng - minLng)) * W * (1 - 2 * mx),
      H - (my * H + ((lat - minLat) / (maxLat - minLat)) * H * (1 - 2 * my))
    ];
  }

  // Background
  ctx.fillStyle = '#0a121c';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    ctx.beginPath(); ctx.moveTo(W * i / 8, 0); ctx.lineTo(W * i / 8, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, H * i / 8); ctx.lineTo(W, H * i / 8); ctx.stroke();
  }

  // Gambar BUZZER ZONE dengan warna berbeda
  // Segmen Sudirman(1)->Karet(2)
  const buzzerSegments = [[1, 2], [3, 2]];
  buzzerSegments.forEach(([from, to]) => {
    const [x1, y1] = xy(ROUTE[from].lat, ROUTE[from].lng);
    const [x2, y2] = xy(ROUTE[to].lat,   ROUTE[to].lng);
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = 'rgba(255,51,0,0.4)';
    ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = '#ff3300';
    ctx.lineWidth = 2.5; ctx.stroke();
  });

  // Track utama (glow)
  ctx.beginPath();
  ROUTE.forEach((p, i) => {
    const [x, y] = xy(p.lat, p.lng);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(233,69,96,0.2)';
  ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();

  // Track utama (garis)
  ctx.beginPath();
  ROUTE.forEach((p, i) => {
    const [x, y] = xy(p.lat, p.lng);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#e94560';
  ctx.lineWidth = 2.5; ctx.stroke();

  // Stasiun
  STATIONS.forEach((s, idx) => {
    const d      = distM(trainPos, s);
    const isIn   = d < s.radius;
    const isNear = !isIn && d < s.radius * 3;
    const isBzr  = (idx === BUZZER_DEST_IDX) || [...BUZZER_SRC_IDXS].includes(idx);
    const [x, y] = xy(s.lat, s.lng);
    const rPx    = Math.max(20, s.radius / 20000 * W);

    // Zona radius
    ctx.beginPath(); ctx.arc(x, y, rPx, 0, Math.PI * 2);
    if (isIn)        ctx.fillStyle = 'rgba(39,174,96,0.12)';
    else if (isBzr && isNear) ctx.fillStyle = 'rgba(255,51,0,0.12)';
    else if (isNear) ctx.fillStyle = 'rgba(245,166,35,0.1)';
    else             ctx.fillStyle = 'rgba(233,69,96,0.05)';
    ctx.fill();

    ctx.strokeStyle = isIn ? 'rgba(39,174,96,0.6)'
      : (isBzr && isNear) ? 'rgba(255,51,0,0.7)'
      : isNear ? 'rgba(245,166,35,0.5)'
      : 'rgba(233,69,96,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash(isIn ? [] : [3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Titik stasiun
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#0a121c'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = isIn ? '#27ae60'
      : (isBzr && isNear) ? '#ff3300'
      : isNear ? '#f5a623'
      : '#e94560';
    ctx.fill();

    // Label
    const lw = ctx.measureText(s.name).width + 10;
    ctx.fillStyle = 'rgba(10,18,28,0.85)';
    ctx.fillRect(x + 10, y - 11, lw, 18);
    ctx.font      = '11px monospace';
    ctx.fillStyle = isIn ? '#27ae60'
      : (isBzr && isNear) ? '#ff5533'
      : isNear ? '#f5a623'
      : '#eaf3de';
    ctx.fillText(s.name, x + 15, y + 2);
  });

  // Posisi kereta (ikon)
  const [tx, ty] = xy(trainPos.lat, trainPos.lng);
  ctx.beginPath(); ctx.arc(tx, ty, 22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(245,166,35,0.15)'; ctx.fill();
  ctx.beginPath(); ctx.arc(tx, ty, 11, 0, Math.PI * 2);
  ctx.fillStyle = '#f5a623'; ctx.fill();
  ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
}

// ============================================================
// SIMULASI
// ============================================================

document.getElementById('startBtn').addEventListener('click', () => {
  if (simRunning) return;
  simRunning = true;
  useGPS     = false;

  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled  = false;
  document.getElementById('gpsDot').className  = 'status-dot active';
  document.getElementById('gpsLabel').textContent  = 'Simulasi';
  document.getElementById('statusVal').textContent = 'Berjalan';
  addLog('Simulasi rute dimulai — Manggarai ke Kampung Bandan', 'ok');
  addLog('⚠ Buzzer aktif di segmen: Sudirman→Karet & Tanah Abang→Karet', 'buzz');

  simInterval = setInterval(() => {
    simT = Math.min(simT + 0.002 * simSpeed, 1);
    document.getElementById('trainSlider').value = Math.round(simT * 100);
    document.getElementById('simPct').textContent = Math.round(simT * 100) + '%';
    simKmh  = 55 + Math.sin(simT * Math.PI * 5) * 25;
    trainPos = getSimPos(simT);
    updateUI();

    if (simT >= 1) {
      clearInterval(simInterval);
      simRunning = false;
      document.getElementById('startBtn').disabled = false;
      document.getElementById('gpsLabel').textContent = 'Selesai';
      document.getElementById('buzzerBanner').classList.remove('show');
      addLog('Rute selesai — tiba di Kampung Bandan', 'ok');
    }
  }, 100);
});

document.getElementById('stopBtn').addEventListener('click', () => {
  simRunning = false;
  if (simInterval) clearInterval(simInterval);
  if (alarmLoop)   { clearInterval(alarmLoop); alarmLoop = null; }
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled  = true;
  document.getElementById('gpsDot').className  = 'status-dot';
  document.getElementById('gpsLabel').textContent  = 'GPS Off';
  document.getElementById('alertBox').className    = 'alert-box';
  document.getElementById('statusVal').textContent = 'Standby';
  document.getElementById('statusVal').style.color = 'var(--rail-muted)';
  document.getElementById('buzzerBanner').classList.remove('show');
  lastAlertKey = null;
  addLog('Simulasi dihentikan');
});

document.getElementById('resetBtn').addEventListener('click', () => {
  simRunning = false;
  if (simInterval) clearInterval(simInterval);
  if (alarmLoop)   { clearInterval(alarmLoop); alarmLoop = null; }
  simT = 0; simKmh = 0;
  passedStations.clear();
  lastAlertKey = null;
  trainPos = { lat: ROUTE[0].lat, lng: ROUTE[0].lng };

  document.getElementById('trainSlider').value     = 0;
  document.getElementById('simPct').textContent    = '0%';
  document.getElementById('startBtn').disabled     = false;
  document.getElementById('stopBtn').disabled      = true;
  document.getElementById('gpsDot').className      = 'status-dot';
  document.getElementById('gpsLabel').textContent  = 'GPS Off';
  document.getElementById('alertBox').className    = 'alert-box';
  document.getElementById('statusVal').textContent = 'Standby';
  document.getElementById('statusVal').style.color = 'var(--rail-muted)';
  document.getElementById('buzzerBanner').classList.remove('show');
  addLog('Reset — kembali ke Manggarai');
  updateUI();
});

// Slider manual
document.getElementById('trainSlider').addEventListener('input', function () {
  simT    = this.value / 100;
  document.getElementById('simPct').textContent = this.value + '%';
  simKmh  = 55 + Math.sin(simT * Math.PI * 5) * 25;
  trainPos = getSimPos(simT);
  updateUI();
});

// Kecepatan simulasi
document.getElementById('fasterBtn').addEventListener('click', () => {
  simSpeed = Math.min(simSpeed + 1, 8);
  document.getElementById('simSpeedLabel').textContent = simSpeed + '×';
});
document.getElementById('slowerBtn').addEventListener('click', () => {
  simSpeed = Math.max(simSpeed - 1, 1);
  document.getElementById('simSpeedLabel').textContent = simSpeed + '×';
});

// GPS Live
document.getElementById('gpsBtn').addEventListener('click', () => {
  if (useGPS) {
    if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
    useGPS = false;
    document.getElementById('gpsBtn').textContent = '📍 Gunakan GPS Perangkat (Live)';
    document.getElementById('gpsBtn').classList.remove('active');
    addLog('GPS perangkat dimatikan');
    return;
  }
  if (!navigator.geolocation) {
    addLog('GPS tidak tersedia di perangkat ini', 'warn');
    return;
  }
  useGPS = true;
  document.getElementById('gpsBtn').textContent = '🔴 GPS Aktif — Tap untuk matikan';
  document.getElementById('gpsBtn').classList.add('active');
  document.getElementById('gpsDot').className   = 'status-dot active';
  document.getElementById('gpsLabel').textContent = 'GPS Live';
  addLog('GPS perangkat diaktifkan', 'info');

  gpsWatchId = navigator.geolocation.watchPosition(
    pos => {
      trainPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      simKmh   = pos.coords.speed ? pos.coords.speed * 3.6 : 0;
      updateUI();
    },
    err => addLog('GPS error: ' + err.message, 'warn'),
    { enableHighAccuracy: true, maximumAge: 1000 }
  );
});

// Modal close
document.getElementById('modalClose').addEventListener('click', () => {
  document.getElementById('modalOverlay').classList.remove('show');
  if (alarmLoop) { clearInterval(alarmLoop); alarmLoop = null; }
});

// Clock
setInterval(() => {
  document.getElementById('clockDisplay').textContent =
    new Date().toTimeString().slice(0, 8);
}, 1000);

// Resize
window.addEventListener('resize', drawMap);

// Init
updateUI();
addLog('MasinisAlert siap digunakan', 'ok');
addLog('Rute: Manggarai → Sudirman → Karet → Tanah Abang → Duri → Angke → Kampung Bandan', 'info');
addLog('⚠ BUZZER ZONE: Sudirman→Karet & Tanah Abang→Karet', 'buzz');
