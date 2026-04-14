# MasinisAlert 🚆

Sistem Pengingat Stasiun Kereta API dengan tracking GPS real-time dan simulasi rute Gambir-Cikampek.

## ✨ Fitur Utama

- 📍 **GPS Live Tracking** - Tracking real-time menggunakan GPS perangkat
- 🚂 **Simulasi Rute** - Simulasi perjalanan kereta Gambir → Cikampek (6 stasiun)
- ⚠️ **Smart Alert System** - Alert otomatis saat mendekati/tiba di stasiun
- 🔊 **Audio Notification** - Warning dan alarm dengan Web Audio API
- 🗺️ **Peta Interaktif** - Visualisasi rute dan posisi kereta real-time
- 📊 **Monitoring Panel** - Koordinat, kecepatan, dan status kereta
- 📱 **Responsive Design** - Berfungsi baik di desktop & mobile

## 🚀 Quick Start

### Opsi 1: Langsung Buka File
```bash
git clone https://github.com/Sannn274/MasinisAlert.git
cd MasinisAlert
# Buka index.html di browser
```

### Opsi 2: Download ZIP
1. Klik **Code** → **Download ZIP**
2. Extract folder
3. Buka `index.html` di browser

## 📖 Cara Pakai

### Mode Simulasi
1. Klik tombol **▶ Mulai**
2. Kereta akan bergerak otomatis dari Gambir ke Cikampek
3. Gunakan slider untuk manual control posisi
4. Ubah kecepatan simulasi dengan tombol `−` dan `+`

### Mode GPS Live
1. Klik tombol **📍 Gunakan GPS Perangkat (Live)**
2. Allow akses GPS ketika diminta browser
3. Posisi kereta akan mengikuti lokasi real-time Anda

### Alert & Notification
- **Zona Warning (3x radius):** Alert kuning, warning sound
- **Zona Stasiun (radius):** Alert merah, alarm sound + modal popup
- **Status Update:** Real-time display koordinat & kecepatan

## 🏗️ Struktur Folder

```
MasinisAlert/
├── index.html       # Struktur HTML
├── style.css        # Styling & tema
├── script.js        # Logika aplikasi & event handlers
├── README.md        # Dokumentasi (file ini)
└── LICENSE          # MIT License
```

## 💻 Tech Stack

- **HTML5** - Canvas API untuk rendering peta
- **CSS3** - Flexbox, Grid, CSS Variables, Animasi
- **JavaScript (Vanilla)** - Tanpa framework/library
- **Web APIs:**
  - Canvas API (drawing)
  - Geolocation API (GPS)
  - Web Audio API (sound)

## 📍 Stasiun yang Tersedia

| No | Nama Stasiun | Latitude | Longitude | Radius |
|----|---|---|---|---|
| 1 | Gambir | -6.1762 | 106.8308 | 400m |
| 2 | Jatinegara | -6.2126 | 106.8693 | 450m |
| 3 | Bekasi | -6.2384 | 106.9822 | 500m |
| 4 | Cikarang | -6.2562 | 107.1435 | 500m |
| 5 | Karawang | -6.3218 | 107.3386 | 550m |
| 6 | Cikampek | -6.4025 | 107.4595 | 600m |

## 🎨 Tema Warna

Menggunakan tema **Rail-inspired dark theme**:

```css
--rail-dark: #1a1a2e      /* Background */
--rail-mid: #16213e       /* Panel */
--rail-accent: #e94560    /* Red/Primary */
--rail-yellow: #f5a623    /* Warning */
--rail-green: #27ae60     /* Success */
```

## 📱 Responsive Design

- **Desktop:** Grid layout 2 kolom (map + info panel)
- **Mobile:** Stack layout, peta di atas info panel
- Breakpoint: `max-width: 640px`

## 🔊 Audio System

- **Warning Tone:** 880Hz, 660Hz, 880Hz (0.5s)
- **Alarm Tone:** 1200Hz, 800Hz, 1200Hz, 600Hz (0.8s)
- Loop otomatis hingga dismiss

## ⚙️ Kalkulasi Jarak

Menggunakan **Haversine Formula** untuk menghitung jarak geodetis:
```
Distance = 2R × atan2(√x, ��(1-x))
dimana:
  R = 6371000 meter (radius bumi)
  x = sin²(Δlat/2) + cos(lat1) × cos(lat2) × sin²(Δlng/2)
```

## 🐛 Known Issues

- GPS tracking accuracy tergantung sinyal perangkat
- Audio notification perlu user interaction pertama kali
- Canvas resolution scaled dengan ukuran window

## 🚀 Future Features

- [ ] Multiple route selection
- [ ] Offline mode dengan caching
- [ ] Schedule database integration
- [ ] Passenger boarding alerts
- [ ] Mobile app version (React Native)
- [ ] Real-time API integration

## 📄 License

MIT © 2026 Sannn274

Lihat [LICENSE](./LICENSE) untuk detail lengkap.

---

**Dibuat dengan ❤️ untuk belajar Web Development**

Perlu bantuan? Buka [Issues](https://github.com/Sannn274/MasinisAlert/issues)
