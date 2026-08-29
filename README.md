# 🎵 TuneGrab – YouTube Music Downloader

Download any song, playlist, or batch of YouTube / YT Music links as high-quality MP3 files.

## Features

- **Single Song** – Paste one YouTube or YT Music link, preview it, then download as MP3
- **Playlist** – Paste a playlist URL, see all songs, download the full playlist as a ZIP
- **Multiple Links** – Paste any number of links (one per line) and download them all at once
- **Live Progress** – Real-time per-song progress bars with speed and ETA
- **Quality Choice** – 128 / 192 / 320 kbps MP3

---

## Requirements

| Requirement | Install |
|---|---|
| Python 3.10+ | https://python.org/downloads |
| ffmpeg | See below |

### Installing ffmpeg (required for MP3 conversion)

**Windows (recommended — winget):**
```powershell
winget install ffmpeg
```

**Windows (manual):**
1. Download from https://ffmpeg.org/download.html (get the "essentials" build)
2. Extract and copy `ffmpeg.exe`, `ffprobe.exe` to a folder (e.g. `C:\ffmpeg\bin`)
3. Add that folder to your system PATH

Verify: `ffmpeg -version` should print version info.

---

## Setup & Run

```powershell
# 1. Install Python packages
python -m pip install flask flask-cors yt-dlp

# 2. Start the server
python app.py
```

Then open http://localhost:5000 in your browser.

---

## Project Structure

```
New folder/
├── app.py              # Flask backend
├── requirements.txt    # Dependencies
├── templates/
│   └── index.html      # Main UI
├── static/
│   ├── style.css       # Styling
│   └── app.js          # Frontend logic
└── downloads/          # Temporary files (auto-cleaned)
```

---

> **Note:** This tool is intended for personal use only. Respect copyright and YouTube's Terms of Service.
