# 📦 AudioRip — Complete Project Backup & PC Transfer Kit

This directory contains the entire source code, build scripts, binaries, assets, and documentation for **AudioRip**, organized and ready to be transferred to your PC.

---

## 📁 Directory Structure

| Folder / File | Description |
| :--- | :--- |
| **`CONVERSATION_AND_ARCHITECTURE.md`** | 📜 Complete chronological conversation history, architecture diagram, bug fixes log, API specifications, and PC guide. |
| **`android-app/`** | 📱 Complete Android Native App project source code (`AndroidManifest.xml`, `MainActivity.java`, `res/`, `assets/www/`, `build_apk.sh`, and keystore). |
| **`backend-server/`** | 🐍 Full multi-threaded Python Flask backend engine with FFmpeg integration, SSE streaming, Dockerfile, and web UI. |
| **`binaries/`** | 📦 Pre-built, 4-byte page-aligned, and v2/v3 signed `AudioRip.apk` ready for installation. |
| **`assets/`** | 🎨 High-res icons (`192px`, `144px`, `96px`) and screenshots. |

---

## 🚀 Quick PC Start

### 1. Run Python Backend on PC:
```bash
cd backend-server
pip install -r requirements.txt
python app.py
```
Open `http://localhost:5000` in your browser.

### 2. Build Android APK on PC:
```bash
cd android-app
./build_apk.sh
```

---

**Author**: [sujalbhure](https://www.instagram.com/sujallbhure?igsi=MWozaXhsNnJkYXcwcg==)  
**GitHub**: [https://github.com/SujalBhure/audiorip](https://github.com/SujalBhure/audiorip)
