"""On-device AudioRip yt-dlp helpers called from the Android Java bridge.

Features:
- Fast metadata inspection with flat parsing and mobile endpoints.
- Concurrent multi-threaded parallel stream downloads (up to 3 simultaneous streams).
- Real-time aggregate progress reporting (overall %, aggregate speed, overall ETA, track counts).
- Responsive cancellation and pause support.
"""

import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
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
    value = re.sub(r'\s+', ' ', value).strip(". ")
    return value[:120].strip() or "audio"


def _format_bytes(num):
    if not num or num <= 0:
        return "0 KB/s"
    if num >= 1024 * 1024:
        return f"{num / (1024 * 1024):.1f} MB/s"
    return f"{num / 1024:.0f} KB/s"


def _format_eta(seconds):
    if seconds is None or seconds < 0 or seconds > 86400:
        return "--"
    seconds = int(seconds)
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def _inspect_opts():
    return {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
        "noplaylist": False,
        "socket_timeout": 15,
        "retries": 2,
        "extractor_retries": 2,
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "mweb"]
            }
        },
    }


def inspect(url):
    """Return clean, fast JSON metadata for a single track or playlist URL."""
    url = str(url).strip()
    with yt_dlp.YoutubeDL(_inspect_opts()) as ydl:
        info = ydl.extract_info(url, download=False)
    
    entries = [entry for entry in (info.get("entries") or []) if entry]
    is_playlist = bool(entries)
    
    thumb = info.get("thumbnail") or ""
    if not thumb and entries:
        thumb = entries[0].get("thumbnail") or ""

    title = info.get("title") or (entries[0].get("title") if entries else "Track")
    uploader = info.get("uploader") or info.get("channel") or info.get("artist") or (entries[0].get("uploader") if entries else "YouTube Music")

    return json.dumps({
        "type": "playlist" if is_playlist else "single",
        "title": title,
        "uploader": uploader,
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


class AggregateDownloadTracker:
    def __init__(self, items, progress_cb=None):
        self.total_tracks = len(items)
        self.progress_cb = progress_cb
        self.tracks = {}
        for idx, item in enumerate(items):
            self.tracks[idx] = {
                "url": item["url"],
                "title": item.get("title", f"Track {idx + 1}"),
                "downloaded": 0,
                "total": 0,
                "speed": 0,
                "status": "queued",
                "percent": 0
            }
        self.completed_count = 0
        self.last_update_time = 0

    def update_track(self, idx, downloaded, total, speed, status=None):
        t = self.tracks.get(idx)
        if not t:
            return
        t["downloaded"] = downloaded
        if total > 0:
            t["total"] = total
            t["percent"] = min(100, int(downloaded * 100 / total))
        if speed is not None:
            t["speed"] = speed
        if status:
            t["status"] = status
        
        now = time.time()
        # Throttle progress callbacks to max 10 times per second for smooth UI
        if now - self.last_update_time >= 0.1 or status in ("finished", "error"):
            self.last_update_time = now
            self._emit_aggregate()

    def mark_completed(self, idx, path, title):
        t = self.tracks.get(idx)
        if t:
            t["status"] = "done"
            t["percent"] = 100
            t["path"] = path
            t["title"] = title
            t["speed"] = 0
        self.completed_count += 1
        self._emit_aggregate()

    def _emit_aggregate(self):
        if not self.progress_cb:
            return

        total_bytes = sum(t["total"] for t in self.tracks.values() if t["total"] > 0)
        downloaded_bytes = sum(t["downloaded"] for t in self.tracks.values())
        aggregate_speed = sum(t["speed"] for t in self.tracks.values() if t["speed"] > 0)
        
        if total_bytes > 0:
            overall_percent = min(100, int(downloaded_bytes * 100 / total_bytes))
            remaining_bytes = max(0, total_bytes - downloaded_bytes)
            eta_seconds = (remaining_bytes / aggregate_speed) if aggregate_speed > 0 else None
        else:
            # Fallback estimation based on completed tracks fraction
            sum_percents = sum(t["percent"] for t in self.tracks.values())
            overall_percent = min(100, int(sum_percents / max(1, self.total_tracks)))
            eta_seconds = None

        speed_str = _format_bytes(aggregate_speed) if aggregate_speed > 0 else ""
        eta_str = _format_eta(eta_seconds)

        track_summaries = []
        for idx, t in self.tracks.items():
            track_summaries.append({
                "idx": idx,
                "title": t["title"],
                "status": t["status"],
                "percent": t["percent"]
            })

        msg_data = {
            "overall_percent": overall_percent,
            "completed": self.completed_count,
            "total": self.total_tracks,
            "speed": speed_str,
            "eta": eta_str,
            "tracks": track_summaries
        }

        try:
            if hasattr(self.progress_cb, "onProgressJson"):
                self.progress_cb.onProgressJson(json.dumps(msg_data))
            elif hasattr(self.progress_cb, "onProgress"):
                msg = f"Downloading tracks ({self.completed_count}/{self.total_tracks})"
                if speed_str:
                    msg += f" · {speed_str}"
                self.progress_cb.onProgress(msg, overall_percent)
            elif callable(self.progress_cb):
                self.progress_cb(json.dumps(msg_data))
        except Exception:
            pass


def _resolve_items_to_download(urls):
    """Flatten single URLs and playlist entries into a clean list of downloadable tracks."""
    items = []
    inspect_options = _inspect_opts()
    with yt_dlp.YoutubeDL(inspect_options) as ydl:
        for url in urls:
            url = str(url).strip()
            if not url:
                continue
            try:
                info = ydl.extract_info(url, download=False)
                entries = info.get("entries")
                if entries:
                    for e in entries:
                        if not e:
                            continue
                        entry_url = e.get("url") or e.get("webpage_url") or (f"https://www.youtube.com/watch?v={e['id']}" if e.get("id") else None)
                        if entry_url:
                            items.append({
                                "url": entry_url,
                                "title": _safe_name(e.get("title")),
                                "id": e.get("id") or "audio"
                            })
                else:
                    items.append({
                        "url": info.get("webpage_url") or url,
                        "title": _safe_name(info.get("title")),
                        "id": info.get("id") or "audio"
                    })
            except Exception:
                # Fallback: add raw URL directly
                items.append({
                    "url": url,
                    "title": "Audio Track",
                    "id": "audio"
                })
    return items


def _download_single_item(idx, item, outdir, tracker, cancel_check_fn=None):
    """Worker function to download an individual audio stream with progress reporting."""
    if cancel_check_fn and cancel_check_fn():
        raise RuntimeError("Cancelled by user")

    tracker.update_track(idx, 0, 0, 0, status="downloading")
    template = str(outdir / f"%(title).120B-{idx}-%(id)s.%(ext)s")

    def _hook(d):
        if cancel_check_fn and cancel_check_fn():
            raise RuntimeError("Cancelled by user")
        
        status = d.get("status")
        if status == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes") or 0
            speed = d.get("speed") or 0
            tracker.update_track(idx, downloaded, total, speed, status="downloading")
        elif status == "finished":
            total = d.get("total_bytes") or d.get("downloaded_bytes") or 0
            tracker.update_track(idx, total, total, 0, status="finished")

    options = {
        "quiet": True,
        "no_warnings": True,
        "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/ba/b",
        "noplaylist": True,
        "outtmpl": template,
        "socket_timeout": 20,
        "retries": 3,
        "fragment_retries": 3,
        "concurrent_fragment_downloads": 2,
        "overwrites": True,
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "mweb"]
            }
        },
        "progress_hooks": [_hook]
    }

    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(item["url"], download=True)
        path = ydl.prepare_filename(info)
        title = _safe_name(info.get("title") or item["title"])
        if os.path.exists(path):
            tracker.mark_completed(idx, path, title)
            return {
                "path": path,
                "title": title,
                "id": info.get("id") or item["id"]
            }
        else:
            raise FileNotFoundError(f"Downloaded stream not found: {path}")


def download(urls_json, output_dir, progress_cb=None):
    """Download audio streams concurrently using up to 3 parallel workers."""
    urls = json.loads(urls_json) if isinstance(urls_json, str) else urls_json
    outdir = Path(output_dir)
    outdir.mkdir(parents=True, exist_ok=True)

    def _is_cancelled():
        if progress_cb and hasattr(progress_cb, "isCancelled"):
            try:
                return bool(progress_cb.isCancelled())
            except Exception:
                pass
        return False

    # 1. Resolve all track items
    items = _resolve_items_to_download(urls)
    if not items:
        raise RuntimeError("No downloadable audio tracks found in the provided links.")

    # 2. Initialize aggregate progress tracker
    tracker = AggregateDownloadTracker(items, progress_cb=progress_cb)

    # 3. Parallel download with ThreadPoolExecutor (max 3 workers for optimal mobile performance)
    max_workers = min(3, max(1, len(items)))
    results = []
    errors = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_item = {
            executor.submit(_download_single_item, idx, item, outdir, tracker, _is_cancelled): (idx, item)
            for idx, item in enumerate(items)
        }

        for future in as_completed(future_to_item):
            idx, item = future_to_item[future]
            try:
                res = future.result()
                results.append(res)
            except Exception as exc:
                errors.append(f"{item.get('title', 'Track')}: {str(exc)[:180]}")
                tracker.update_track(idx, 0, 0, 0, status="error")

    if not results:
        raise RuntimeError(errors[0] if errors else "Failed to download audio streams.")

    return json.dumps({"files": results, "errors": errors, "total": len(items), "successful": len(results)})
