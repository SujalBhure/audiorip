# 🎵 AudioRip Pro — High-Fidelity Audio Extractor & Android App

<p align="center">
  <img src="android/res/mipmap-xxhdpi/ic_launcher.png" width="96" height="96" alt="AudioRip Logo" />
</p>

<p align="center">
  <b>High-fidelity 320kbps YouTube & Music audio engine for Android & Desktop.</b>
</p>

<p align="center">
  <a href="https://github.com/SujalBhure/audiorip-backend/releases/latest"><img src="https://img.shields.io/github/v/release/SujalBhure/audiorip-backend?style=for-the-badge&color=38BDF8&label=Latest%20APK" alt="Latest Release" /></a>
  <a href="https://github.com/SujalBhure/audiorip-backend/releases"><img src="https://img.shields.io/badge/Android-8.0%20--%2016%20(API%2035%2F36)-10B981?style=for-the-badge&logo=android" alt="Android Support" /></a>
  <a href="https://www.instagram.com/sujallbhure?igsi=MWozaXhsNnJkYXcwcg=="><img src="https://img.shields.io/badge/Author-@sujalbhure-E1306C?style=for-the-badge&logo=instagram" alt="Instagram" /></a>
</p>

---

## 📱 Download Android App

Download the official signed and page-aligned APK directly:
👉 **[Download AudioRip.apk (v1.0.0)](releases/AudioRip.apk)**

* **Package**: `com.sujalbhure.audiorip`
* **Target Android**: Android 16 (API 35/36), Android 15, 14, 13, 12, 11, 10, 9, 8.0
* **Signing Scheme**: Official APK Signature Schemes v2 & v3 (Verified)
* **Alignment**: Verified 4-byte Page Aligned (`zipalign`)

---

## ✨ Features

- 🎧 **Single Track Mode**: Instant auto-fetch on link paste, live track card preview, and direct 320kbps MP3 conversion.
- 📑 **Playlist Mode**: Extract full albums and playlists into neatly structured ZIP archives.
- 🗂️ **Multi Mode**: Multi-link batch inspector with interactive tree view for mixed singles & playlists.
- ⚡ **Spring Motion Tab Switcher**: Apple HIG / Linear-grade matte dark aesthetic with tactile haptic feedback.
- 🔔 **In-App Update System**: Automated release checks that notify you with a pop-up changelog (✨ What's New & 🐛 Bug Fixes) whenever a new update is released.
- 🎵 **System Media Indexing**: Automatically registers newly downloaded tracks with Android's `MediaScannerConnection` so they show up in your music player immediately.
- 🔗 **Share Intent Integration**: Tap "Share" on any YouTube video and select **AudioRip** to load and convert instantly.

---

## 📂 Repository Structure

```
audiorip-backend/
├── android/                   # Standalone Android APK Source Code
│   ├── AndroidManifest.xml   # Android 16 manifest with permissions & intents
│   ├── src/                  # Native Java AndroidBridge & WebView activity
│   ├── res/                  # Multi-density soundwave launcher icons & styles
│   ├── assets/www/           # Offline high-performance Web UI
│   └── build_apk.sh          # AAPT + D8 + zipalign + apksigner build pipeline
├── releases/
│   └── AudioRip.apk          # Official release binary
├── app.py                     # Multi-threaded audio conversion engine
├── requirements.txt           # Python dependencies
├── static/ & templates/       # Web client
└── start_server.sh            # 1-tap local engine launcher
```

---

## 🛠️ Building the Android APK from Source

```bash
cd android
chmod +x build_apk.sh
./build_apk.sh
```
The compiled, aligned, and signed APK will be output to `android/AudioRip.apk`.

---

## 👨‍💻 Author & Credits

Created with ❤️ by **[sujalbhure](https://www.instagram.com/sujallbhure?igsi=MWozaXhsNnJkYXcwcg==)**.
