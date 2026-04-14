# 📚 MasinisAlert — Ringkasan Materi Belajar

> Proyek: MasinisAlert — Sistem Pengingat Stasiun untuk Masinis KRL
> Rute: Manggarai → Sudirman → Karet → Tanah Abang → Duri → Angke → Kampung Bandan

---

## 1. STRUKTUR FOLDER PROYEK

```
MasinisAlert/
├── index.html        ← Struktur halaman (HTML only, no inline CSS/JS)
├── css/
│   └── style.css     ← Semua styling
└── js/
    └── main.js       ← Semua logic, data, audio, GPS
```

**Kenapa dipisah?**
- **Separation of Concerns** — setiap file punya 1 tanggung jawab
- Lebih mudah di-debug: bug tampilan → buka CSS, bug logic → buka JS
- Lebih mudah di-scale: bisa tambah `js/audio.js`, `js/map.js`, dll
- Standar industri yang dipakai di semua framework (React, Vue, dll)

---

## 2. HTML — Struktur & Semantic

### Konsep Penting

**`<meta name="viewport">`** — penting untuk tablet masinis:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
```
- `user-scalable=no` → cegah masinis tidak sengaja zoom
- Ini fondasi dari **Responsive Web Design (RWD)**

**`<canvas>`** — elemen untuk menggambar dengan JavaScript:
```html
<canvas id="mapCanvas"></canvas>
```
Canvas tidak punya konten sendiri, semua digambar via JS (`ctx.fillRect`, `ctx.arc`, dll)

**Link eksternal CSS & JS:**
```html
<link rel="stylesheet" href="css/style.css">  <!-- di <head> -->
<script src="js/main.js"></script>             <!-- sebelum </body>, bukan di <head> -->
```
Kenapa JS di bawah? Supaya HTML sudah di-render dulu sebelum JS jalan. Kalau JS di `<head>`, DOM belum ada dan `getElementById()` bakal return `null`.

---

## 3. CSS — Styling & Layout

### CSS Custom Properties (Variables)
```css
:root {
  --rail-accent:  #e94560;
  --rail-buzzer:  #ff3300;
}

/* Penggunaan */
.alert-box { border-color: var(--rail-accent); }
```
**Manfaat:** ganti 1 baris di `:root` = update warna seluruh aplikasi. Inilah cikal-bakal **Design Token** yang dipakai di sistem desain perusahaan.

### CSS Grid — Layout Utama
```css
.main {
  display: grid;
  grid-template-columns: 1fr 300px;  /* peta fleksibel, panel kanan 300px fix */
}
```
- `1fr` = "1 fraction" dari ruang yang tersisa
- Untuk layout kompleks, Grid > Flexbox

### CSS Flexbox — Layout Komponen
```css
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
```
Flexbox bagus untuk 1 dimensi (baris atau kolom).

### CSS Animations
```css
@keyframes pulseBuzzer {
  0%, 100% { border-color: var(--rail-buzzer); }
  50%       { border-color: transparent; }
}

.buzzer-alert {
  animation: pulseBuzzer 0.4s ease-in-out infinite;
}
```
**Cara kerja:** `@keyframes` mendefinisikan "checkpoint" animasi. Browser interpolasi otomatis antar step.

### Media Query — Responsive Design
```css
@media (max-width: 640px) {
  .main { grid-template-columns: 1fr; }  /* tablet/HP: satu kolom */
}
```
Ini krusial untuk aplikasi di tablet masinis.

---

## 4. JAVASCRIPT — Logic Utama

### Data Modeling
```javascript
const STATIONS = [
  { name: "Karet", lat: -6.1979, lng: 106.8163, radius: 300 },
  // ...
];
```
Setiap stasiun adalah **Object** dengan properti yang konsisten. Ini mirip row dalam database — tapi di client-side.

### Geofencing — Inti Sistem
**Geofencing** = deteksi apakah posisi GPS masuk ke dalam zona virtual (lingkaran di sekitar stasiun).

**Formula Haversine** — menghitung jarak antara 2 titik koordinat di bola bumi:
```javascript
function distM(a, b) {
  const R    = 6371000;                              // radius bumi (meter)
  const dLat = (b.lat - a.lat) * Math.PI / 180;    // delta lintang dalam radian
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x    = Math.sin(dLat/2)**2
    + Math.cos(a.lat*Math.PI/180) * Math.cos(b.lat*Math.PI/180)
    * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}
```
Kenapa perlu Haversine dan bukan Pythagoras biasa? Karena bumi itu *melengkung* — di jarak pendek memang mirip, tapi tetap lebih akurat pakai ini.

**Logika Geofence:**
```javascript
STATIONS.forEach(s => {
  const d = distM(trainPos, s);
  if (d < s.radius)         inStation   = s;  // sudah di dalam
  else if (d < s.radius*3)  nearStation = s;  // mendekati
});
```

### Buzzer Zone Logic
```javascript
const BUZZER_DEST_IDX  = 2;               // Karet = indeks ke-2
const BUZZER_SRC_IDXS  = new Set([1, 3]); // dari Sudirman (1) atau Tanah Abang (3)

function isInBuzzerZone() {
  const n      = ROUTE.length - 1;
  const seg    = simT * n;          // posisi float di dalam array segmen
  const srcIdx = Math.floor(seg);   // indeks stasiun asal
  const dstIdx = srcIdx + 1;        // indeks stasiun tujuan
  return dstIdx === BUZZER_DEST_IDX && BUZZER_SRC_IDXS.has(srcIdx);
}
```
**Analoginya:** bayangkan rute seperti garis. `simT` adalah posisi 0–1 di garis itu. Kalau `simT = 0.2`, kereta ada di 20% perjalanan. `Math.floor(0.2 * 6) = 1` artinya sedang di segmen antara stasiun ke-1 dan ke-2 (Sudirman→Karet).

### Web Audio API — Sistem Buzzer
Browser punya engine audio bawaan tanpa perlu library eksternal:

```javascript
function playTone(freqs, dur, vol, type = 'square') {
  const ctx  = new AudioContext();
  const gain = ctx.createGain();           // kontrol volume
  gain.connect(ctx.destination);           // sambung ke speaker
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur); // fade out

  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();    // generator gelombang
    osc.type = type;                       // 'sine' = halus, 'square' = kasar/buzzer
    osc.connect(gain);
    osc.frequency.setValueAtTime(f, ...);
    osc.start(); osc.stop(ctx.currentTime + dur);
  });
}
```

**Perbedaan bunyi:**

| Fungsi | Frekuensi | Type | Volume | Interval |
|---|---|---|---|---|
| `playWarning()` | 880, 660 Hz | sine | 0.35 | 3 detik |
| `playAlarm()` | 1200, 800 Hz | sine | 0.6 | 2.2 detik |
| `playBuzzer()` | 1800, 900, 2200 Hz | **square** | **0.9** | **0.8 detik** |

Square wave menghasilkan bunyi lebih harsh/kasar dibanding sine — itulah kenapa terdengar seperti buzzer industri.

### Geolocation API — GPS Live
```javascript
navigator.geolocation.watchPosition(
  (pos) => {
    trainPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    simKmh   = pos.coords.speed ? pos.coords.speed * 3.6 : 0;  // m/s ke km/h
    updateUI();
  },
  (err) => console.error(err),
  { enableHighAccuracy: true, maximumAge: 1000 }
);
```
- `watchPosition` vs `getCurrentPosition`: watch terus update setiap posisi berubah
- `enableHighAccuracy: true` → pakai GPS chip, bukan WiFi/cell tower

### Canvas API — Menggambar Peta
```javascript
const canvas = document.getElementById('mapCanvas');
const ctx    = canvas.getContext('2d');

// Normalisasi koordinat GPS ke pixel canvas
function xy(lat, lng) {
  return [
    mx*W + ((lng-minLng)/(maxLng-minLng)) * W*(1-2*mx),  // X (longitude → horizontal)
    H - (my*H + ((lat-minLat)/(maxLat-minLat)) * H*(1-2*my)) // Y (latitude → vertikal, dibalik)
  ];
}
```
Kenapa Y dibalik? Karena di Canvas Y=0 ada di atas, tapi latitude makin besar ke atas. Jadi perlu di-negate.

### Interpolasi Linear Posisi Kereta
```javascript
function lerpPos(a, b, t) {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}
```
`lerp` = linear interpolation. Kalau `t=0` → posisi A, `t=1` → posisi B, `t=0.5` → tepat di tengah.

---

## 5. KONSEP PENTING UNTUK LOMBA

### Kenapa Ini Inovatif?
1. **Zero-dependency** — tidak butuh library tambahan. Murni HTML/CSS/JS native.
2. **Offline-capable** — setelah diload, tidak butuh internet (kecuali fitur GPS).
3. **Android-ready** — bisa di-wrap jadi APK pakai **WebView** (Android native) atau **Capacitor.js**.
4. **Real GPS** — bukan simulasi saja, sudah ada integrasi `navigator.geolocation` untuk live tracking.

### Cara Jadikan Aplikasi Android
Ada 3 opsi untuk mengubah web ini ke APK:

**Opsi 1: Capacitor (Recommended)**
```bash
npm install @capacitor/core @capacitor/cli
npx cap init MasinisAlert com.masinisalert.app
npx cap add android
npx cap copy
npx cap open android   # buka di Android Studio
```

**Opsi 2: WebView Native (Java/Kotlin)**
Buat Activity yang load URL lokal:
```java
WebView webView = findViewById(R.id.webView);
webView.getSettings().setJavaScriptEnabled(true);
webView.getSettings().setGeolocationEnabled(true);
webView.loadUrl("file:///android_asset/index.html");
```

**Opsi 3: PWA (Progressive Web App)**
Tambahkan `manifest.json` dan Service Worker agar bisa di-install langsung dari browser Chrome di tablet.

---

## 6. KONSEP PEMROGRAMAN YANG DIGUNAKAN

| Konsep | Contoh di Proyek |
|---|---|
| **DOM Manipulation** | `getElementById`, `innerHTML`, `classList.add/remove` |
| **Event Listeners** | `addEventListener('click', ...)` |
| **setInterval / clearInterval** | Loop simulasi & alarm |
| **Haversine Formula** | Hitung jarak GPS |
| **Linear Interpolation** | Posisi kereta antar stasiun |
| **Web Audio API** | Buzzer & alarm suara |
| **Geolocation API** | GPS live tracking |
| **Canvas 2D API** | Rendering peta |
| **CSS Custom Properties** | Theming konsisten |
| **CSS Grid & Flexbox** | Layout responsif |
| **CSS Animations** | Visual feedback alarm |
| **Set data structure** | `passedStations`, `BUZZER_SRC_IDXS` |
| **Closures** | State `lastAlertKey`, `alarmLoop` |

---

## 7. TIPS PRESENTASI LOMBA

- Tekankan **problem yang dipecahkan**: masinis manusia bisa kelelahan dan lupa stasiun → sistem otomatis.
- Highlight **buzzer zone**: bukan sekadar alarm biasa, ada *risk assessment* — segmen tertentu lebih berisiko.
- Tunjukkan **GPS live mode**: ini yang bikin beda dari sistem dummy.
- Sebut **cost-effective**: tidak butuh hardware khusus, cukup tablet yang sudah dimiliki masinis.
- Future roadmap yang bisa ditambah: integrasi jadwal KRL real-time, notifikasi sinyal bahaya, komunikasi antar masinis.

---

*Dokumen ini dibuat sebagai bahan belajar untuk proyek MasinisAlert — Lomba Inovasi Masinis.*
