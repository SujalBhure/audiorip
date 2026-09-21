# 🎵 AudioRip — High-Speed Audio Extraction & 320kbps MP3 Converter

AudioRip is a high-speed, local audio extraction tool and native Android application designed to convert music, podcasts, and playlists from YouTube and YouTube Music into pristine, high-bitrate MP3 files (320kbps, 192kbps, 128kbps) with zero cloud dependencies.

---

## ✨ Features

- **📱 100% On-Device Android App**: Native mobile app powered by embedded Chaquopy (Python 3.11), yt-dlp, and FFmpegKit GPL. No external servers required.
- **⚡ Parallel Multi-Song Engine**: Concurrent multi-stream downloads with up to 3 simultaneous workers.
- **📑 Full Playlist & Batch Support**: Seamlessly extract entire YouTube playlists, YouTube Mixes, and multi-link batches.
- **⏱️ Real-Time Live ETA & Speed**: Accurate rolling moving-average byte rate tracking and live countdown timer (`MM:SS`).
- **⏸️ Pause, Resume & Cancel**: Safe background task suspension and instant cancellation.
- **📁 Direct Storage**: Automatically saves converted MP3s directly to `/storage/emulated/0/Download/AudioRip/` and triggers Android `MediaScannerConnection` so songs appear in your music player immediately.
- **🌐 Companion Web Server**: Optional lightweight Flask companion backend for desktop and self-hosting.

---

## 📁 Repository Structure

```text
audiorip/
├── android/                   # Native Android application source
│   ├── assets/www/            # Offline embedded WebView UI (HTML, CSS, JS)
│   ├── python/                # On-device Chaquopy extraction engine (audiorip_native.py)
│   ├── res/                   # Android icons, themes, and XML resources
│   ├── src/                   # Native Java bridge & FFmpeg conversion pipeline (MainActivity.java)
│   └── build.gradle           # Android application build configuration
├── app.py                     # Optional companion Flask web server
├── build.gradle               # Root project Gradle configuration
├── settings.gradle            # Gradle module settings
├── requirements.txt           # Python dependencies for the companion web server
├── templates/ & static/       # Web interface assets for companion server
└── Dockerfile                 # Container specification for companion server
```

---

## 🚀 Getting Started

### 📱 Android App (Recommended)
Download the latest pre-compiled signed APK directly from GitHub Releases:
- **Latest Release**: [https://github.com/SujalBhure/audiorip/releases/latest](https://github.com/SujalBhure/audiorip/releases/latest)

#### Building from Source:
Requirements: Android SDK (API 35+), JDK 17+, Python 3.11.
```bash
# Build the release APK
gradle assembleRelease
```
The compiled APK will be located at `android/build/outputs/apk/release/app-release.apk`.

---

### 💻 Companion Web Server (Optional)
```bash
pip install -r requirements.txt
python app.py
```
Open [http://localhost:5000](http://localhost:5000) in your browser.

---

## 👤 Author
- **Developer**: [sujalbhure](https://www.instagram.com/sujallbhure?igsi=MWozaXhsNnJkYXcwcg==)
- **GitHub**: [https://github.com/SujalBhure/audiorip](https://github.com/SujalBhure/audiorip)
