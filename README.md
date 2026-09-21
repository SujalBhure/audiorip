# 🎵 AudioRip — High-Speed Audio Extraction & 320kbps MP3 Converter

AudioRip is a high-speed, 100% on-device native Android application designed to convert music, podcasts, and playlists from YouTube and YouTube Music into pristine, high-bitrate MP3 files (320kbps, 192kbps, 128kbps) with zero cloud dependencies or external servers.

---

## ✨ Features

- **📱 100% On-Device Engine**: Native mobile app powered by embedded Chaquopy (Python 3.11), yt-dlp, and FFmpegKit GPL. No external servers or APIs required.
- **⚡ Parallel Multi-Song Downloads**: Concurrent multi-stream downloading with up to 3 simultaneous workers.
- **📑 Full Playlist & Batch Support**: Seamlessly extract entire YouTube playlists, YouTube Mixes, and multi-link batches.
- **⏱️ Real-Time Live ETA & Speed**: Rolling moving-average byte rate tracking and live countdown timer (`MM:SS`).
- **⏸️ Pause, Resume & Cancel**: Safe background task suspension and instant cancellation.
- **📁 Direct Storage**: Automatically saves converted MP3s directly to `/storage/emulated/0/Download/AudioRip/` and triggers Android `MediaScannerConnection` so songs appear in your favorite music player immediately.
- **🎨 Modern Dark UI**: Sleek, edge-to-edge dark theme with dynamic micro-animations, real-time itemized progress badges, and haptic feedback.

---

## 📁 Repository Structure

```text
audiorip/
├── android/                   # Complete Native Android application
│   ├── assets/www/            # Offline embedded UI (HTML, CSS, JS)
│   ├── python/                # On-device Chaquopy extraction engine (audiorip_native.py)
│   ├── res/                   # Android icons, themes, and XML resources
│   ├── src/                   # Native Java bridge & FFmpeg conversion pipeline (MainActivity.java)
│   ├── release.keystore       # Application signing certificate
│   └── build.gradle           # Android application build configuration
├── build.gradle               # Root project Gradle configuration
├── settings.gradle            # Gradle module settings
└── .gitignore                 # Git ignore rules
```

---

## 🚀 Getting Started

### 📱 Install APK (Recommended)
Download the latest pre-compiled signed APK directly from GitHub Releases:
- **Latest Release**: [https://github.com/SujalBhure/audiorip/releases/latest](https://github.com/SujalBhure/audiorip/releases/latest)
- **Direct APK Download**: [AudioRip.apk (v1.1.3)](https://github.com/SujalBhure/audiorip/releases/download/v1.1.3/AudioRip.apk)

### 🛠️ Building from Source
Requirements: Android SDK (API 35+), JDK 17+, Python 3.11.
```bash
# Build the signed release APK
gradle assembleRelease
```
The compiled APK will be output to:
`android/build/outputs/apk/release/app-release.apk`

---

## 👤 Author
- **Developer**: [sujalbhure](https://www.instagram.com/sujallbhure?igsi=MWozaXhsNnJkYXcwcg==)
- **GitHub**: [https://github.com/SujalBhure/audiorip](https://github.com/SujalBhure/audiorip)
