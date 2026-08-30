"""On-device AudioRip yt-dlp helpers called from the Android Java bridge.

This module downloads the original audio stream directly on the device using
mobile client emulation to bypass bot challenges. Android's embedded FFmpegKit
library performs the 320kbps MP3 conversion natively.
"""

import json
import os
import re
from pathlib import Path

import yt_dlp


def _duration(seconds):
    if not seconds:
        return "Ready"
    try:
        seconds = int(seconds)
        return f"{seconds // 60}:{seconds % 60:02d}"
    except Exception:
        return "Ready"


def _safe_name(value):
    value = re.sub(r'[\\/:*?"<>|]', "_", value or "audio")
    return value[:120].strip() or "audio"


def _opts(flat=True):
    return {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist" if flat else False,
        "noplaylist": False,
        "socket_timeout": 20,
        "retries": 3,
        "extractor_retries": 3,
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "ios", "mweb"]
            }
        },
    }


def inspect(url):
    """Return clean, JSON metadata for a single track or playlist URL."""
    with yt_dlp.YoutubeDL(_opts()) as ydl:
        info = ydl.extract_info(url, download=False)
    
    entries = [entry for entry in (info.get("entries") or []) if entry]
    is_playlist = bool(entries)
    
    # Extract thumbnail
    thumb = info.get("thumbnail") or ""
    if not thumb and entries:
        thumb = entries[0].get("thumbnail") or ""

    return json.dumps({
        "type": "playlist" if is_playlist else "single",
        "title": info.get("title") or (entries[0].get("title") if entries else "Track"),
        "uploader": info.get("uploader") or info.get("channel") or info.get("artist") or "YouTube Music",
        "duration": _duration(info.get("duration")),
        "thumbnail": thumb,
        "count": len(entries) if is_playlist else 1,
        "url": url
    })


def inspect_many(urls_json):
    """Inspect multiple URLs (playlists and singles)."""
    urls = json.loads(urls_json) if isinstance(urls_json, str) else urls_json
    playlists, singles, errors = [], [], []
    total = 0
    for url in urls:
        url = str(url).strip()
        if not url:
            continue
        try:
            data = json.loads(inspect(url))
            if data["type"] == "playlist":
                playlists.append(data)
                total += data["count"]
            else:
                singles.append(data)
                total += 1
        except Exception as e:
            errors.append({"url": url, "error": str(e)[:120]})
            
    return json.dumps({
        "playlists": playlists,
        "singles": singles,
        "errors": errors,
        "total_tracks": total,
        "urls": urls
    })


def download(urls_json, output_dir, progress_cb=None):
    """Download best available audio streams and return local file paths."""
    urls = json.loads(urls_json) if isinstance(urls_json, str) else urls_json
    outdir = Path(output_dir)
    outdir.mkdir(parents=True, exist_ok=True)
    template = str(outdir / "%(title).120B-%(id)s.%(ext)s")

    def _progress_hook(d):
        if progress_cb and d.get("status") == "downloading":
            try:
                p_str = d.get("_percent_str", "").replace("%", "").strip()
                percent = float(p_str) if p_str else 0.0
                progress_cb(f"Downloading stream: {percent:.0f}%", int(percent))
            except Exception:
                pass

    options = {
        "quiet": True,
        "no_warnings": True,
        "format": "bestaudio/best",
        "noplaylist": False,
        "outtmpl": template,
        "socket_timeout": 30,
        "retries": 3,
        "fragment_retries": 3,
        "concurrent_fragment_downloads": 2,
        "overwrites": True,
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "ios", "mweb"]
            }
        },
        "progress_hooks": [_progress_hook] if progress_cb else []
    }
    
    results = []
    errors = []
    with yt_dlp.YoutubeDL(options) as ydl:
        for url in urls:
            url = str(url).strip()
            if not url:
                continue
            try:
                info = ydl.extract_info(url, download=True)
                entries = info.get("entries") or [info]
                for entry in entries:
                    if not entry:
                        continue
                    path = ydl.prepare_filename(entry)
                    if os.path.exists(path):
                        results.append({
                            "path": path,
                            "title": _safe_name(entry.get("title")),
                            "id": entry.get("id") or "audio"
                        })
            except Exception as exc:
                errors.append(str(exc)[:240])

    if not results:
        raise RuntimeError(errors[0] if errors else "No audio stream could be downloaded from the provided links.")

    return json.dumps({"files": results, "errors": errors})

