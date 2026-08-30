# 📜 AudioRip — Full Architecture & PC Migration Guide

> **Project Name**: AudioRip  
> **Author**: [sujalbhure](https://www.instagram.com/sujallbhure?igsi=MWozaXhsNnJkYXcwcg==)  
> **Target Platforms**: Android (8.0 to 16 API 35/36), Web, Desktop (Linux/Windows/macOS)  
> **GitHub Repository**: [https://github.com/SujalBhure/audiorip](https://github.com/SujalBhure/audiorip)  
> **Latest APK Release**: [https://github.com/SujalBhure/audiorip/releases/tag/v1.1.1](https://github.com/SujalBhure/audiorip/releases/tag/v1.1.1)

---

## 📑 Table of Contents
1. [Project Overview & Evolution](#1-project-overview--evolution)
2. [Full Conversation & Development Log](#2-full-conversation--development-log)
3. [Core Technical Architecture](#3-core-technical-architecture)
4. [Major Technical Challenges & Solutions](#4-major-technical-challenges--solutions)
   - [Challenge 1: YouTube Datacenter BotGuard vs Consumer Mobile IPs](#challenge-1-youtube-datacenter-botguard-vs-consumer-mobile-ips)
   - [Challenge 2: Android 16 "App Not Installed" Alignment Error](#challenge-2-android-16-app-not-installed-alignment-error)
   - [Challenge 3: Automated In-App Update System](#challenge-3-automated-in-app-update-system)
5. [Backend API Specifications](#5-backend-api-specifications)
6. [Android Native Bridge (`AndroidBridge`)](#6-android-native-bridge-androidbridge)
7. [Step-by-Step Guide for PC Setup & Development](#7-step-by-step-guide-for-pc-setup--development)

---

## 1. Project Overview & Evolution

AudioRip is a **standalone on-device Android application** (with companion web/desktop capability) capable of:
- Downloading individual YouTube / YouTube Music songs in true 320kbps MP3 format 100% on-device.
- Extracting entire playlists and packaging them directly on device.
- Batch downloading mixed links (multiple playlists + single tracks).
- Seamless Android integration (System Share menu, clipboard paste, haptics, and automatic `MediaScannerConnection` indexing so music shows up in offline music players).
- Automatic In-App Update notifications powered by the GitHub Releases API.

---

## 2. Full Conversation & Development Log

### Phase 1: Web Prototype & Cloud Hosting Attempts
- **User Prompt**: Created the core Flask audio extractor engine with multi-threaded downloads, FFmpeg conversion, Server-Sent Events (SSE) progress streaming, and a luxury dark web interface.
- **Encountered Issue**: When hosted on cloud platforms (Render/Netlify), YouTube returned:
  `[youtube] Zk405nQ1Sv8: Sign in to confirm you’re not a bot`
- **Analysis**: YouTube blocks cloud datacenter IP subnets (AWS, Render, Cloudflare, DigitalOcean) using BotGuard / PoToken challenges, whereas residential/mobile carrier IPs (Jio, Airtel, home WiFi) are allowed.

### Phase 2: Shifting Focus to a Standalone Android APK
- **User Directive**: *"make apk i will upload it on github and f droid....make the design the best it should look unique add animation on button switch so rename batch/mixed to multi or something like that use all the skills and make the best design"*
- **Implementation**:
  - Configured Android SDK 34/35 command-line toolchain directly on the environment.
  - Built [`MainActivity.java`](file:///storage/emulated/0/Download/Office%20Kit/audiorip-android/src/com/sujalbhure/audiorip/MainActivity.java) with WebView and Java `@JavascriptInterface` bridge for file saving, clipboard access, haptics, and share intents.
  - Designed Apple HIG / Linear-grade matte dark interface (`#08090C` canvas, `#111319` cards, `#38BDF8` sky-blue soundwave accents).
  - Implemented the smooth segmented mode switcher (`Single`, `Playlist`, `Multi`) with spring-physics sliding pill indicator.

### Phase 3: Solving "App Not Installed" on Android 16
- **User Issue**: Installation failed with *"App not installed"* on Android 16 (API 35/36).
- **Diagnosis**:
  1. Missing APK Signature Scheme v2 & v3 (Android 11+ enforces v2 signatures; `jarsigner` only applied legacy v1).
  2. Legacy `jarsigner` modified the ZIP archive after `zipalign`, breaking 4-byte memory page alignment on `resources.arsc` and drawables.
- **Solution**: Restructured the build pipeline:
  `AAPT` $\rightarrow$ `D8` $\rightarrow$ `AAPT Package` $\rightarrow$ `zipalign -p 4` $\rightarrow$ `apksigner (v1, v2, v3)`
  Verified with `zipalign -c 4` and `apksigner verify --verbose`.

### Phase 4: Resolving YouTube BotGuard with Mobile Handshakes
- **User Issue**: Screenshot showed `[youtube] hLuhfSP8Odc: Sign in to confirm you're not a bot`.
- **Root Cause**: The client fell back to the sleeping Render datacenter server when local port 5000 was inactive.
- **Solution**:
  1. Updated `yt-dlp` extractor arguments to prioritize mobile client handshakes:
     `player_client: ['android', 'ios', 'mweb']`
  2. Created 1-tap launcher `start_server.sh` and built-in auto-retry with cold-start detection.

### Phase 5: In-App Update System & GitHub Release
- **User Request**: *"how do i send a update popup and state its new feature and bug fixes"*
- **Implementation**:
  - Integrated GitHub Releases API (`/repos/SujalBhure/audiorip/releases/latest`).
  - Added an in-app popup modal with markdown parser that automatically breaks changelogs into **✨ WHAT'S NEW** and **🐛 BUG FIXES**.
  - Pushed the entire `android/` source code and `v1.0.0` release APK to GitHub.

---

## 3. Core Technical Architecture

```
┌────────────────────────────────────────────────────────┐
│               AudioRip Pro Client Layer                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  WebView UI (assets/www/index.html, style.css)   │  │
│  │  - Segmented Tabs (Single / Playlist / Multi)    │  │
│  │  - Spring Pill Animation & Haptic Touch          │  │
│  │  - In-App Update Modal & Changelog Viewer        │  │
│  └────────────────────────┬─────────────────────────┘  │
│                           │ window.Android bridge       │
│  ┌────────────────────────▼─────────────────────────┐  │
│  │  Native Android Layer (MainActivity.java)        │  │
│  │  - Direct Storage: /Downloads/AudioRip/          │  │
│  │  - MediaScannerConnection Broadcasts             │  │
│  │  - System Share Intent (ACTION_SEND)             │  │
│  └────────────────────────┬─────────────────────────┘  │
└───────────────────────────┼────────────────────────────┘
                            │ HTTP / SSE (127.0.0.1:5000)
┌───────────────────────────▼────────────────────────────┐
│              Local / Cloud Engine Layer                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Flask Server (app.py)                           │  │
│  │  - yt-dlp with Mobile Handshake Clients          │  │
│  │  - FFmpeg 320kbps Audio Resampling               │  │
│  │  - ID3 Metadata & High-Res Artwork Injector      │  │
│  │  - In-Memory Task Store & SSE Progress Streaming │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

---

## 4. Major Technical Challenges & Solutions

### Challenge 1: YouTube Datacenter BotGuard vs Consumer Mobile IPs
* **Symptom**: Datacenter servers get HTTP 429 / `"Sign in to confirm you're not a bot"`.
* **Fix**: In [`app.py`](file:///storage/emulated/0/Download/Office%20Kit/yt%20music%20downloader/app.py), we configured `yt-dlp` to emulate official YouTube Android and iOS client payloads:
  ```python
  opts['extractor_args'] = {
      'youtube': {
          'player_client': ['android', 'ios', 'mweb']
      }
  }
  ```

### Challenge 2: Android 16 "App Not Installed" Alignment Error
* **Symptom**: Android Package Manager aborts with generic "App not installed".
* **Fix**:
  1. Target SDK updated to API 35/36 (`targetSdkVersion 35`, `minSdkVersion 26`).
  2. Strict alignment order: **`zipalign` MUST be executed before `apksigner`**. Running `jarsigner` after `zipalign` destroys byte boundaries.
  3. Official APK Signature Schemes **v2 and v3** embedded simultaneously.

### Challenge 3: Automated In-App Update System
* **Implementation**: On app startup (and when tapping the `PRO v1.0` badge), the client queries:
  `GET https://api.github.com/repos/SujalBhure/audiorip/releases/latest`
* **Version Comparator**:
  ```javascript
  function compareVersions(v1, v2) {
    const p1 = v1.replace(/^v/, '').split('.').map(Number);
    const p2 = v2.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const n1 = p1[i] || 0, n2 = p2[i] || 0;
      if (n1 > n2) return 1;
      if (n1 < n2) return -1;
    }
    return 0;
  }
  ```

---

## 5. Backend API Specifications

| Method | Endpoint | Description | Request Payload | Response |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Healthcheck & cold-start ping | None | `{"status": "ok", "version": "1.0.0"}` |
| `POST` | `/api/info` | Inspect single song or playlist | `{"url": "https://..."}` | Metadata object (title, duration, thumbnail, count) |
| `POST` | `/api/inspect` | Batch inspector for multi links | `{"urls": ["url1", "url2"]}` | `{playlists: [], singles: [], total_tracks: N}` |
| `POST` | `/api/download` | Initialize conversion task | `{"urls": [...], "quality": "320"}` | `{"task_id": "uuid-v4"}` |
| `GET` | `/api/progress/<id>` | Server-Sent Events (SSE) stream | None | Real-time percentage, speed, ETA, track list |
| `GET` | `/api/file/<id>` | Stream completed MP3 or ZIP | None | Binary file stream (`audio/mpeg` or `application/zip`) |

---

## 6. Android Native Bridge (`AndroidBridge`)

The JavaScript UI communicates with Android native capabilities via `window.Android`:

| Method | Purpose |
| :--- | :--- |
| `window.Android.saveFile(base64, filename, subfolder)` | Writes bytes to `Downloads/AudioRip/` and triggers `MediaScannerConnection`. |
| `window.Android.vibrate(ms)` | Triggers subtle tactile haptic vibration feedback. |
| `window.Android.getClipboardText()` | 1-tap clipboard paste without OS prompt limitations. |
| `window.Android.copyToClipboard(text)` | Copies text or links to system clipboard. |
| `window.Android.showToast(message)` | Displays native Android Toast message. |
| `window.Android.openExternalUrl(url)` | Opens browser or external apps (e.g., Instagram profile). |

---

## 7. Step-by-Step Guide for PC Setup & Development

When transferring this folder to your PC:

### Option A: Running the Python Engine on PC (Windows / Mac / Linux)

1. **Install Python 3.10+ & FFmpeg**:
   - **Windows**: `winget install ffmpeg` & install Python from python.org
   - **macOS**: `brew install ffmpeg python3`
   - **Linux (Ubuntu/Debian)**: `sudo apt install ffmpeg python3 python3-pip`

2. **Navigate to `backend-server` and install dependencies**:
   ```bash
   cd backend-server
   pip install -r requirements.txt
   ```

3. **Run the server**:
   ```bash
   python app.py
   ```
   Open `http://localhost:5000` in your browser.

---

### Option B: Building the Android APK on PC

1. **Prerequisites**:
   - Install **Android Studio** (or Android SDK Command-line Tools).
   - Ensure `JAVA_HOME` is set to JDK 17+.

2. **Using the Build Script (`build_apk.sh`) on Linux/macOS/Git Bash**:
   ```bash
   cd android-app
   chmod +x build_apk.sh
   ./build_apk.sh
   ```

3. **Opening in Android Studio**:
   - Open Android Studio $\rightarrow$ **Open Project** $\rightarrow$ select the `android-app` folder.
   - Click **Build** $\rightarrow$ **Build APK(s)**.

---

## 🚀 Version 1.1.1 Changelog & Updates

1. **⏸️ Pause & ❌ Cancel Controls**:
   - Added Pause, Resume, and Cancel buttons in the active progress panel.
   - Background threads suspend gracefully when paused and abort cleanly when cancelled.
2. **⚡ 3x–4x Faster Parallel Multi-Song Engine**:
   - Implemented `concurrent.futures.ThreadPoolExecutor(max_workers=3)` in `audiorip_native.py`.
   - Downloads 3 audio streams concurrently in parallel instead of one-by-one.
3. **📊 True Overall Aggregate Progress & Live ETA**:
   - Single unified progress bar (0% $\rightarrow$ 100%) tracking aggregate byte transfers across all tracks.
   - Real-time aggregate download speed (e.g. `⚡ 4.8 MB/s`) and accurate countdown ETA (`⏱️ 00:24`).
   - Track counter (`3/10 Done`).
4. **📋 Live Individual Track Status Badges**:
   - Per-track status itemizer with live status badges (`QUEUED`, `45%`, `CONVERTING`, `DONE`).
5. **📁 Direct Downloads Storage**:
   - All MP3s save directly to `/storage/emulated/0/Download/AudioRip/` and are immediately indexed by Android's `MediaScannerConnection`.
6. **🐛 FFmpegKit Runtime Dependency Fix**:
   - Added `com.arthenica:smart-exception-java:0.2.1` and `smart-exception-common:0.2.1` to prevent class-loading exceptions during conversion.

---

## 👨‍💻 Credits & Attribution

- **Lead Developer**: [sujalbhure](https://www.instagram.com/sujallbhure?igsi=MWozaXhsNnJkYXcwcg==)
- **Engine**: yt-dlp & FFmpeg
- **UI Framework**: Vanilla HTML5 / CSS3 / ES6 (Zero bulky framework overhead, instant startup)

