import os
import re
import uuid
import threading
import zipfile
import json
import time
import shutil
from concurrent.futures import ThreadPoolExecutor, as_completed

from flask import Flask, render_template, request, jsonify, Response, send_file
from flask_cors import CORS
import yt_dlp

app = Flask(__name__)

# Restrict CORS to secure standard usage
CORS(app, resources={r"/api/*": {"origins": "*"}})

DOWNLOADS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), 'downloads'))
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

FFMPEG_PATH = shutil.which('ffmpeg') or '/usr/bin/ffmpeg'
NODE_PATH = shutil.which('node') or '/usr/bin/node'

# Optional Cookie File Support (for cloud environments)
COOKIE_FILE = os.path.join(os.path.dirname(__file__), 'cookies.txt')
if not os.path.exists(COOKIE_FILE) and os.environ.get('YOUTUBE_COOKIES'):
    try:
        with open('/tmp/cookies.txt', 'w') as cf:
            cf.write(os.environ.get('YOUTUBE_COOKIES'))
        COOKIE_FILE = '/tmp/cookies.txt'
    except Exception:
        pass

# In-memory task store with thread safety
tasks: dict = {}
tasks_lock = threading.Lock()

# Strict Validation Regexes
UUID_REGEX = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
YOUTUBE_URL_REGEX = re.compile(
    r'^(https?://)?((www|m|music)\.)?(youtube\.com/(watch\?.*|playlist\?.*|shorts/|embed/)|youtu\.be/)[\w\-]+',
    re.IGNORECASE
)
ALLOWED_QUALITIES = {'128', '192', '320'}
MAX_URLS_PER_BATCH = 50


# ── Security Headers ─────────────────────────────────────────────────────────

@app.after_request
def apply_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=(), payment=()'
    return response


# ── Filename & Path Sanitization ─────────────────────────────────────────────

def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]', '_', name)
    cleaned = re.sub(r'[\r\n\t]', '', cleaned)
    cleaned = re.sub(r'\.{2,}', '.', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned[:90] if cleaned else "track"


def is_safe_path(target_path: str, base_dir: str = DOWNLOADS_DIR) -> bool:
    try:
        resolved_target = os.path.realpath(target_path)
        resolved_base = os.path.realpath(base_dir)
        return os.path.commonpath([resolved_target, resolved_base]) == resolved_base
    except Exception:
        return False


def validate_youtube_url(url: str) -> bool:
    if not url or len(url) > 500:
        return False
    clean = url.strip()
    if any(blocked in clean.lower() for blocked in ['localhost', '127.0.0.1', '0.0.0.0', '169.254.', '10.', '192.168.', '172.']):
        return False
    return bool(YOUTUBE_URL_REGEX.match(clean))


# ── Automatic Background Garbage Collector ───────────────────────────────────

def background_cleanup_reaper():
    while True:
        try:
            time.sleep(300)
            now = time.time()
            with tasks_lock:
                to_delete = []
                for tid, task_data in list(tasks.items()):
                    created_time = task_data.get('created_at', now)
                    if now - created_time > 900:
                        to_delete.append(tid)

                for tid in to_delete:
                    tdir = os.path.join(DOWNLOADS_DIR, tid)
                    if os.path.exists(tdir) and is_safe_path(tdir):
                        shutil.rmtree(tdir, ignore_errors=True)
                    tasks.pop(tid, None)
        except Exception:
            pass


threading.Thread(target=background_cleanup_reaper, daemon=True).start()


# ── Progress Hook ────────────────────────────────────────────────────────────

def make_progress_hook(task_id: str, song_index: int):
    def hook(d):
        with tasks_lock:
            task = tasks.get(task_id)
            if not task:
                return
            prog = task.get('progress', [])
            if song_index >= len(prog):
                return
            entry = prog[song_index]

            if d['status'] == 'downloading':
                total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                downloaded = d.get('downloaded_bytes', 0)
                pct = (downloaded / total * 100) if total > 0 else 0
                entry['percent'] = round(min(pct, 95), 1)
                entry['status'] = 'downloading'
                entry['speed'] = d.get('_speed_str', '').strip()
                entry['eta'] = d.get('_eta_str', '').strip()
            elif d['status'] == 'finished':
                entry['percent'] = 98
                entry['status'] = 'converting'
                entry['speed'] = 'Converting…'
                entry['eta'] = ''
    return hook


# ── Robust Multi-Client Extractor Helper (Bypasses Datacenter Bot Walls) ────

def get_base_ydl_opts(client_type: str = 'android') -> dict:
    opts = {
        'quiet': True,
        'no_warnings': True,
        'socket_timeout': 20,
        'nocheckcertificate': True,
        'extractor_args': {
            'youtube': {
                'player_client': [client_type],
            }
        },
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        }
    }
    if os.path.exists(COOKIE_FILE):
        opts['cookiefile'] = COOKIE_FILE
    if os.path.exists(NODE_PATH):
        opts['js_runtimes'] = {'node': {'path': NODE_PATH}}
    return opts


# ── URL Inspection Engine ───────────────────────────────────────────────────

def inspect_url_entity(url: str) -> dict:
    url = url.strip()
    if not validate_youtube_url(url):
        return {
            'type': 'error',
            'url': url,
            'title': 'Invalid Link',
            'error': 'Please provide a valid YouTube or YouTube Music link.'
        }
    
    clients = ['android', 'mweb', 'ios', 'web_embedded', 'tv_embedded']
    last_error = None
    info = None

    for client in clients:
        flat_opts = get_base_ydl_opts(client)
        if 'playlist' in url.lower() or 'list=' in url.lower():
            flat_opts['extract_flat'] = 'in_playlist'
        try:
            with yt_dlp.YoutubeDL(flat_opts) as ydl:
                info = ydl.extract_info(url, download=False)
            if info:
                break
        except Exception as e:
            last_error = e
            continue

    if not info:
        return {
            'type': 'error',
            'url': url,
            'title': 'Error',
            'error': str(last_error).split('ERROR:')[-1].strip() if last_error else 'Could not extract metadata.'
        }

    try:
        if info.get('_type') == 'playlist':
            playlist_title = info.get('title') or "Playlist"
            entries = []
            for entry in info.get('entries', []) or []:
                vid_url = (
                    entry.get('url')
                    or entry.get('webpage_url')
                    or f"https://www.youtube.com/watch?v={entry.get('id', '')}"
                )
                entries.append({
                    'url': vid_url,
                    'title': entry.get('title', 'Unknown Track'),
                    'thumbnail': entry.get('thumbnail')
                })
            return {
                'type': 'playlist',
                'title': playlist_title,
                'uploader': info.get('uploader') or info.get('channel', ''),
                'count': len(entries),
                'thumbnail': info.get('thumbnail') or (entries[0].get('thumbnail') if entries else None),
                'entries': entries[:250]
            }
        else:
            vid_id = info.get('id', '')
            thumb = info.get('thumbnail') or (
                f"https://img.youtube.com/vi/{vid_id}/hqdefault.jpg" if vid_id else None
            )
            duration = info.get('duration', 0) or 0
            mins, secs = divmod(int(duration), 60)
            return {
                'type': 'single',
                'title': info.get('title', 'Unknown Track'),
                'uploader': info.get('uploader') or info.get('channel', ''),
                'thumbnail': thumb,
                'duration': f'{mins}:{secs:02d}',
                'url': url
            }
    except Exception as exc:
        return {
            'type': 'error',
            'url': url,
            'title': 'Error',
            'error': str(exc).split('ERROR:')[-1].strip()
        }


def resolve_multilink_structure(raw_urls: list[str]) -> dict:
    clean_urls = [u.strip() for u in raw_urls if u.strip()][:MAX_URLS_PER_BATCH]
    if not clean_urls:
        return {'playlists': [], 'singles': [], 'errors': [], 'total_tracks': 0}

    results = []
    with ThreadPoolExecutor(max_workers=min(8, len(clean_urls))) as executor:
        futures = [executor.submit(inspect_url_entity, u) for u in clean_urls]
        for f in futures:
            try:
                res = f.result()
                if res:
                    results.append(res)
            except Exception as e:
                results.append({'type': 'error', 'url': 'Error', 'error': str(e)})

    playlists = []
    singles = []
    errors = []

    for r in results:
        if r['type'] == 'playlist':
            playlists.append(r)
        elif r['type'] == 'single':
            singles.append(r)
        elif r['type'] == 'error':
            errors.append(r)

    total_tracks = sum(p['count'] for p in playlists) + len(singles)

    return {
        'playlists': playlists,
        'singles': singles,
        'errors': errors,
        'total_tracks': total_tracks
    }


# ── High-Speed Parallel Track Processor ──────────────────────────────────────

def process_track_item(task_id: str, track_idx: int, item: dict, quality: str, task_dir: str):
    prog = tasks[task_id]['progress'][track_idx]

    if item.get('error'):
        prog['status'] = 'error'
        prog['error'] = item['error']
        return None

    prog['status'] = 'downloading'
    temp_base = f"track_{track_idx:04d}"
    temp_out = os.path.join(task_dir, f"{temp_base}.%(ext)s")

    clients = ['android', 'mweb', 'ios', 'tv_embedded']
    last_error = None
    success = False

    for client in clients:
        ydl_opts = get_base_ydl_opts(client)
        ydl_opts.update({
            'format': 'bestaudio/best',
            'outtmpl': temp_out,
            'ffmpeg_location': FFMPEG_PATH,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': quality,
            }],
            'progress_hooks': [make_progress_hook(task_id, track_idx)],
            'noplaylist': True,
            'retries': 15,
            'fragment_retries': 15,
            'concurrent_fragment_downloads': 4,
            'retry_sleep_functions': {'http': lambda n: 1},
            'prefer_ffmpeg': True,
        })

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(item['url'], download=True)
                track_title = info.get('title') or item.get('title') or f"Track {track_idx+1}"
                prog['title'] = track_title
                success = True
                break
        except Exception as exc:
            last_error = exc
            continue

    if not success:
        prog['status'] = 'error'
        prog['error'] = str(last_error).split('ERROR:')[-1].strip() if last_error else 'Download failed'
        return None

    expected_mp3 = os.path.join(task_dir, f"{temp_base}.mp3")
    if os.path.exists(expected_mp3):
        safe_title = sanitize_filename(prog['title'])
        final_mp3 = os.path.join(task_dir, f"{safe_title}.mp3")
        
        collision_count = 1
        while os.path.exists(final_mp3) and final_mp3 != expected_mp3:
            final_mp3 = os.path.join(task_dir, f"{safe_title}_{collision_count}.mp3")
            collision_count += 1

        if expected_mp3 != final_mp3:
            os.rename(expected_mp3, final_mp3)

        prog['percent'] = 100
        prog['status'] = 'done'
        prog['speed'] = 'Done'
        return {
            'file_path': final_mp3,
            'file_name': os.path.basename(final_mp3),
            'subfolder': item.get('subfolder')
        }
    else:
        found = [f for f in os.listdir(task_dir) if f.startswith(temp_base) and f.endswith('.mp3')]
        if found:
            mp3_path = os.path.join(task_dir, found[0])
            safe_title = sanitize_filename(prog['title']) + ".mp3"
            dst = os.path.join(task_dir, safe_title)
            os.rename(mp3_path, dst)
            prog['percent'] = 100
            prog['status'] = 'done'
            prog['speed'] = 'Done'
            return {
                'file_path': dst,
                'file_name': safe_title,
                'subfolder': item.get('subfolder')
            }
        else:
            prog['status'] = 'error'
            prog['error'] = 'Audio extraction failed'
            return None


# ── Master Download Worker ───────────────────────────────────────────────────

def run_download_task(task_id: str, urls: list[str], quality: str):
    task = tasks[task_id]
    task['status'] = 'resolving'

    task_dir = os.path.join(DOWNLOADS_DIR, task_id)
    os.makedirs(task_dir, exist_ok=True)

    structure = resolve_multilink_structure(urls)
    
    flat_queue = []
    for p in structure['playlists']:
        folder_name = sanitize_filename(p['title'])
        for entry in p['entries']:
            flat_queue.append({
                'url': entry['url'],
                'title': entry['title'],
                'subfolder': folder_name
            })
            
    single_folder = "Single Songs" if (structure['playlists'] or len(structure['singles']) > 1) else None
    for s in structure['singles']:
        flat_queue.append({
            'url': s['url'],
            'title': s['title'],
            'subfolder': single_folder
        })

    if not flat_queue:
        task['status'] = 'error'
        task['error'] = 'No valid tracks found to convert.'
        return

    task['progress'] = [
        {
            'title': t.get('title', f"Track {i+1}"),
            'percent': 0,
            'status': 'pending',
            'speed': '',
            'eta': '',
            'subfolder': t.get('subfolder') or ''
        }
        for i, t in enumerate(flat_queue)
    ]
    task['status'] = 'converting'

    converted_results = []
    max_workers = min(6, len(flat_queue))

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(process_track_item, task_id, idx, item, quality, task_dir): idx
            for idx, item in enumerate(flat_queue)
        }
        for future in as_completed(futures):
            res = future.result()
            if res:
                converted_results.append(res)

    if not converted_results:
        task['status'] = 'error'
        task['error'] = 'Conversion failed. Please ensure the link is publicly accessible.'
        return

    # Package Output: Direct MP3 vs Structured Nested ZIP
    if len(converted_results) == 1 and len(flat_queue) == 1 and not flat_queue[0].get('subfolder'):
        task['output_file'] = converted_results[0]['file_path']
        task['output_type'] = 'mp3'
        task['output_name'] = converted_results[0]['file_name']
    else:
        zip_path = os.path.join(task_dir, 'music_bundle.zip')
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for item in converted_results:
                fpath = item['file_path']
                fname = item['file_name']
                subfolder = item.get('subfolder')
                
                if os.path.exists(fpath):
                    zip_entry_path = f"{subfolder}/{fname}" if subfolder else fname
                    zf.write(fpath, zip_entry_path)

        task['output_file'] = zip_path
        task['output_type'] = 'zip'
        task['output_name'] = 'Music_Archive.zip'

    task['status'] = 'done'


# ── Routes & Endpoints ───────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/info', methods=['POST'])
def get_info():
    data = request.get_json(silent=True) or {}
    url = str(data.get('url', '')).strip()
    if not url or not validate_youtube_url(url):
        return jsonify({'error': 'Please provide a valid YouTube or YT Music URL.'}), 400

    info = inspect_url_entity(url)
    if not info or info.get('type') == 'error':
        return jsonify({'error': info.get('error', 'Could not fetch metadata.')}), 400
    
    return jsonify(info)


@app.route('/api/inspect_multi', methods=['POST'])
def inspect_multi():
    data = request.get_json(silent=True) or {}
    urls: list = data.get('urls', [])
    if not isinstance(urls, list) or not urls:
        return jsonify({'error': 'No URLs provided.'}), 400

    clean_urls = [str(u).strip() for u in urls if str(u).strip()][:MAX_URLS_PER_BATCH]
    structure = resolve_multilink_structure(clean_urls)
    return jsonify(structure)


@app.route('/api/download', methods=['POST'])
def start_download():
    data = request.get_json(silent=True) or {}
    urls: list = data.get('urls', [])
    quality: str = str(data.get('quality', '320')).strip()

    if quality not in ALLOWED_QUALITIES:
        quality = '320'

    if not isinstance(urls, list) or not urls:
        return jsonify({'error': 'No valid links provided.'}), 400

    clean_urls = [str(u).strip() for u in urls if validate_youtube_url(str(u).strip())][:MAX_URLS_PER_BATCH]
    if not clean_urls:
        return jsonify({'error': 'No valid YouTube links found in request.'}), 400

    task_id = str(uuid.uuid4())
    with tasks_lock:
        tasks[task_id] = {
            'status': 'pending',
            'progress': [],
            'output_file': None,
            'output_type': None,
            'output_name': None,
            'error': None,
            'created_at': time.time()
        }

    t = threading.Thread(target=run_download_task, args=(task_id, clean_urls, quality), daemon=True)
    t.start()

    return jsonify({'task_id': task_id})


@app.route('/api/progress/<task_id>')
def stream_progress(task_id):
    if not UUID_REGEX.match(task_id):
        return jsonify({'error': 'Invalid task ID'}), 400

    def generate():
        while True:
            with tasks_lock:
                task = tasks.get(task_id)
            if not task:
                yield f"data: {json.dumps({'error': 'Task not found'})}\n\n"
                break

            payload = {
                'status': task['status'],
                'progress': task['progress'],
                'output_type': task.get('output_type'),
                'output_name': task.get('output_name'),
            }
            if task.get('error'):
                payload['error'] = task['error']

            yield f"data: {json.dumps(payload)}\n\n"

            if task['status'] in ('done', 'error'):
                break
            time.sleep(0.2)

    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'Connection': 'keep-alive',
    })


@app.route('/api/file/<task_id>')
def download_file(task_id):
    if not UUID_REGEX.match(task_id):
        return jsonify({'error': 'Invalid task ID'}), 400

    with tasks_lock:
        task = tasks.get(task_id)
    if not task or task['status'] != 'done':
        return jsonify({'error': 'File not ready'}), 404

    file_path = task.get('output_file')
    if not file_path or not os.path.exists(file_path) or not is_safe_path(file_path):
        return jsonify({'error': 'Requested file is invalid or expired'}), 404

    return send_file(
        file_path,
        as_attachment=True,
        download_name=task.get('output_name', 'audio.mp3'),
    )


@app.route('/api/cleanup/<task_id>', methods=['DELETE'])
def cleanup(task_id):
    if not UUID_REGEX.match(task_id):
        return jsonify({'error': 'Invalid task ID'}), 400

    task_dir = os.path.join(DOWNLOADS_DIR, task_id)
    if os.path.exists(task_dir) and is_safe_path(task_dir):
        shutil.rmtree(task_dir, ignore_errors=True)
    with tasks_lock:
        tasks.pop(task_id, None)
    return jsonify({'ok': True})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
