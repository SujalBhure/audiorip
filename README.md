# 🎵 AudioRip — High-Speed Audio & Video Downloader

AudioRip is a high-speed, 100% on-device native Android application designed to download videos (4K UHD, 1080p Full HD, 720p HD) and convert audio (320kbps, 192kbps, 128kbps MP3) from YouTube, YouTube Music, podcasts, and playlists with zero cloud dependencies or external servers.

---

## ✨ Features

- **📱 100% On-Device Engine**: Native mobile app powered by embedded Chaquopy (Python 3.11), yt-dlp, and FFmpegKit GPL. No external servers or APIs required.
- **🎬 Video & Audio Formats**: Choose between Audio (MP3) and Video (MP4) with custom quality presets (4K UHD 2160p, 1080p Full HD, 720p HD, and 320kbps MP3).
- **⚡ Parallel Multi-Track Downloads**: Concurrent multi-stream downloading with up to 3 simultaneous workers.
- **📑 Full Playlist & Batch Support**: Seamlessly extract entire YouTube playlists, YouTube Mixes, and multi-link batches.
- **⏱️ Real-Time Live ETA & Speed**: Rolling moving-average byte rate tracking and live countdown timer (`MM:SS`).
- **⏸️ Pause, Resume & Cancel**: Safe background task suspension and instant cancellation (with auto-hiding controls upon completion).
- **📁 Direct Storage**: Automatically saves media directly to `/storage/emulated/0/Download/AudioRip/` and triggers Android `MediaScannerConnection` so videos and music appear in your gallery and music apps immediately.
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
- **Direct APK Download**: [AudioRip.apk (v1.1.4)](https://github.com/SujalBhure/audiorip/releases/download/v1.1.4/AudioRip.apk)

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
