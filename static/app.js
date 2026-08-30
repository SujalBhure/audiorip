/* ═══════════════════════════════════════════════════════════════════════════
   AudioRip // Client-Side Engine & Controller
═══════════════════════════════════════════════════════════════════════════ */

'use strict';

const state = {
  activeTab: 'single',
  singleInfo: null,
  playlistInfo: null,
  multiStructure: null,
  currentTaskId: null,
  es: null,
  hasAutoDownloaded: false,
  debounceTimerSingle: null,
  debounceTimerPlaylist: null,
};

const $ = id => document.getElementById(id);

// ── Tab Management ─────────────────────────────────────────────────────────
function switchTab(name) {
  state.activeTab = name;
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === name);
    tab.setAttribute('aria-selected', tab.dataset.tab === name ? 'true' : 'false');
  });
  document.querySelectorAll('.viewport').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${name}`);
  });
  clearErrors();
}

// ── Quality Chips ──────────────────────────────────────────────────────────
function setupChips(containerId, hiddenInputId) {
  const container = $(containerId);
  if (!container) return;
  const hidden = $(hiddenInputId);
  container.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      hidden.value = chip.dataset.quality;
    });
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function showError(msg, targetId) {
  const shelf = $(targetId);
  if (!shelf) return;
  shelf.innerHTML = `<div class="error-message">${escHtml(msg)}</div>`;
}

function clearErrors() {
  ['error-single', 'error-playlist', 'error-multi'].forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = '';
  });
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function isValidUrl(str) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\/.+$/i.test(str.trim());
}

const API_BASE = window.location.hostname.includes('netlify')
  ? 'https://audiorip-backend.onrender.com'
  : '';

// Warm up backend on load
if (API_BASE) {
  fetch(`${API_BASE}/api/health`).catch(() => {});
}

async function apiFetch(path, options = {}, retries = 2) {
  const url = `${API_BASE}${path}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if ((res.status === 502 || res.status === 504) && attempt < retries) {
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 3000));
      } else {
        throw err;
      }
    }
  }
}

// ── API Interactions ───────────────────────────────────────────────────────
async function fetchInfo(url) {
  const res = await apiFetch('/api/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.trim() }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to inspect link.');
  return json;
}

async function inspectMulti(urls) {
  const res = await apiFetch('/api/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to inspect multi-links.');
  return json;
}

async function startTask(urls, quality) {
  const res = await apiFetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls, quality }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to initialize engine.');
  return json.task_id;
}

// ── Single Track Auto-Fetch ────────────────────────────────────────────────
async function autoFetchSingle() {
  const url = $('single-url').value.trim();
  if (!url || !isValidUrl(url)) {
    $('single-preview').innerHTML = '';
    $('single-download-btn').style.display = 'none';
    return;
  }

  clearErrors();
  const spinner = $('single-spinner');
  if (spinner) spinner.style.display = 'flex';

  try {
    const info = await fetchInfo(url);
    state.singleInfo = info;
    renderSinglePreview(info);
    $('single-download-btn').style.display = 'flex';
  } catch (err) {
    showError(err.message, 'error-single');
    $('single-preview').innerHTML = '';
    $('single-download-btn').style.display = 'none';
  } finally {
    if (spinner) spinner.style.display = 'none';
  }
}

function renderSinglePreview(info) {
  const thumb = info.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop&q=60';
  $('single-preview').innerHTML = `
    <div class="preview-card">
      <img class="preview-thumb" src="${escHtml(thumb)}" alt="Art" onerror="this.style.display='none'" />
      <div class="preview-info">
        <div class="preview-name">${escHtml(info.title)}</div>
        <div class="preview-meta">${escHtml(info.uploader || '')} &nbsp;·&nbsp; ${escHtml(info.duration || 'Track')}</div>
      </div>
    </div>`;
}

async function handleSingleConvert() {
  const url = $('single-url').value.trim();
  if (!url) return;
  const quality = $('single-quality').value;
  clearErrors();

  const btn = $('single-download-btn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Converting…';

  try {
    const taskId = await startTask([url], quality);
    $('single-download-btn').style.display = 'none';
    streamProgress(taskId);
  } catch (err) {
    showError(err.message, 'error-single');
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Convert';
  }
}

// ── Playlist Auto-Fetch ────────────────────────────────────────────────────
async function autoFetchPlaylist() {
  const url = $('playlist-url').value.trim();
  if (!url || !isValidUrl(url)) {
    $('playlist-preview').innerHTML = '';
    $('playlist-download-btn').style.display = 'none';
    return;
  }

  clearErrors();
  const spinner = $('playlist-spinner');
  if (spinner) spinner.style.display = 'flex';

  try {
    const info = await fetchInfo(url);
    state.playlistInfo = info;
    renderPlaylistPreview(info);
    $('playlist-download-btn').style.display = 'flex';
  } catch (err) {
    showError(err.message, 'error-playlist');
    $('playlist-preview').innerHTML = '';
    $('playlist-download-btn').style.display = 'none';
  } finally {
    if (spinner) spinner.style.display = 'none';
  }
}

function renderPlaylistPreview(info) {
  const thumb = info.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop&q=60';
  $('playlist-preview').innerHTML = `
    <div class="preview-card">
      <img class="preview-thumb" src="${escHtml(thumb)}" alt="Art" onerror="this.style.display='none'" />
      <div class="preview-info">
        <div class="preview-name">${escHtml(info.title)}</div>
        <div class="preview-meta">${escHtml(info.uploader || 'Playlist')} &nbsp;·&nbsp; ${info.count} Songs</div>
      </div>
    </div>`;
}

async function handlePlaylistConvert() {
  const url = $('playlist-url').value.trim();
  if (!url) return;
  const quality = $('playlist-quality').value;
  clearErrors();

  const btn = $('playlist-download-btn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Converting All…';

  try {
    const taskId = await startTask([url], quality);
    $('playlist-download-btn').style.display = 'none';
    streamProgress(taskId);
  } catch (err) {
    showError(err.message, 'error-playlist');
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Convert All';
  }
}

// ── Multi / Mixed Batch Handlers (Manual Fetch Only) ───────────────────────
function updateMultiCount() {
  const lines = $('multi-urls').value.split('\n').map(l => l.trim()).filter(Boolean);
  const countEl = $('multi-link-count');
  if (countEl) {
    countEl.textContent = `${lines.length} link${lines.length !== 1 ? 's' : ''}`;
  }
}

async function handleMultiInspect() {
  const raw = $('multi-urls').value.trim();
  if (!raw) {
    showError('Please paste at least one link.', 'error-multi');
    return;
  }

  const urls = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (urls.length === 0) {
    showError('No valid links found.', 'error-multi');
    return;
  }

  clearErrors();
  const btn = $('multi-fetch-btn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Inspecting…';

  try {
    const data = await inspectMulti(urls);
    state.multiStructure = data;
    renderMultiPreview(data);
    
    if (data.total_tracks > 0) {
      const convertBtn = $('multi-download-btn');
      convertBtn.style.display = 'flex';
      convertBtn.querySelector('span').textContent = `Convert All (${data.total_tracks} Tracks)`;
    } else {
      $('multi-download-btn').style.display = 'none';
      showError('No downloadable tracks found in provided links.', 'error-multi');
    }
  } catch (err) {
    showError(err.message, 'error-multi');
    $('multi-preview').innerHTML = '';
    $('multi-download-btn').style.display = 'none';
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Fetch & Inspect';
  }
}

function renderMultiPreview(data) {
  let html = '<div class="multi-group">';

  // 1. Playlists breakdown
  if (data.playlists && data.playlists.length > 0) {
    data.playlists.forEach((p, idx) => {
      const tracksHtml = (p.entries || []).slice(0, 15).map((e, i) => `
        <div class="group-item">${i + 1}. ${escHtml(e.title)}</div>
      `).join('');

      html += `
        <div class="group-panel">
          <div class="group-header">
            <span>📁 ${escHtml(p.title)}</span>
            <span class="group-badge">${p.count} tracks</span>
          </div>
          <div class="group-body">${tracksHtml}</div>
        </div>`;
    });
  }

  // 2. Standalone singles breakdown
  if (data.singles && data.singles.length > 0) {
    const singlesHtml = data.singles.map((s, i) => `
      <div class="group-item">${i + 1}. ${escHtml(s.title)} (${escHtml(s.duration || 'Track')})</div>
    `).join('');

    html += `
      <div class="group-panel">
        <div class="group-header">
          <span>🎵 Single Songs</span>
          <span class="group-badge">${data.singles.length} songs</span>
        </div>
        <div class="group-body">${singlesHtml}</div>
      </div>`;
  }

  html += '</div>';
  $('multi-preview').innerHTML = html;
}

async function handleMultiConvert() {
  const raw = $('multi-urls').value.trim();
  if (!raw) return;
  const urls = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const quality = $('multi-quality').value;
  clearErrors();

  const btn = $('multi-download-btn');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Converting All…';

  try {
    const taskId = await startTask(urls, quality);
    $('multi-download-btn').style.display = 'none';
    streamProgress(taskId);
  } catch (err) {
    showError(err.message, 'error-multi');
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Convert All';
  }
}

// ── Real-time SSE Progress & Auto-Downloader ───────────────────────────────
function streamProgress(taskId) {
  state.currentTaskId = taskId;
  state.hasAutoDownloaded = false;

  if (state.es) { state.es.close(); state.es = null; }

  const stage = $('progress-stage');
  stage.innerHTML = `
    <div class="progress-deck">
      <div class="progress-header">
        <span class="progress-title">Conversion Progress</span>
        <span class="progress-stat" id="progress-stat">Initializing…</span>
      </div>
      <div class="overall-track">
        <div id="overall-bar" class="overall-bar"></div>
      </div>
      <div id="track-feed" class="track-feed"></div>
    </div>`;

  stage.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const es = new EventSource(`/api/progress/${taskId}`);
  state.es = es;

  es.onmessage = e => {
    try {
      const data = JSON.parse(e.data);
      updateProgressUI(data, taskId);
      if (data.status === 'done' || data.status === 'error') {
        es.close();
        state.es = null;
      }
    } catch (err) {
      console.error(err);
    }
  };

  es.onerror = () => {
    es.close();
    state.es = null;
  };
}

function triggerAutoDownload(fileUrl, filename) {
  if (state.hasAutoDownloaded) return;
  state.hasAutoDownloaded = true;

  const link = document.createElement('a');
  link.href = fileUrl;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function updateProgressUI(data, taskId) {
  const feed = $('track-feed');
  if (!feed) return;

  const progress = data.progress || [];
  const total = progress.length;
  const done = progress.filter(p => p.status === 'done').length;

  const statEl = $('progress-stat');
  if (statEl) {
    statEl.textContent = total > 1 ? `${done} / ${total} Converted` : (data.status === 'done' ? 'Completed' : 'Converting');
  }

  const overallBar = $('overall-bar');
  if (overallBar && total > 0) {
    const pct = Math.round((done / total) * 100);
    overallBar.style.width = `${data.status === 'done' ? 100 : pct}%`;
  }

  // Populate progress rows
  while (feed.children.length < total) {
    const row = document.createElement('div');
    row.className = 'feed-row';
    row.innerHTML = `
      <div class="feed-head">
        <span class="feed-title">Track ${feed.children.length + 1}</span>
        <span class="feed-status active">Queued</span>
      </div>
      <div class="feed-bar-track">
        <div class="feed-bar-fill" style="width:0%"></div>
      </div>`;
    feed.appendChild(row);
  }

  progress.forEach((p, i) => {
    const row = feed.children[i];
    if (!row) return;

    const isDone = p.status === 'done';
    const isErr = p.status === 'error';
    const isWorking = p.status === 'downloading' || p.status === 'converting';

    const titlePrefix = p.subfolder ? `[${p.subfolder}] ` : '';
    row.querySelector('.feed-title').textContent = titlePrefix + (p.title || `Track ${i + 1}`);

    const statusBadge = row.querySelector('.feed-status');
    statusBadge.className = `feed-status ${isDone ? 'done' : isErr ? 'error' : 'active'}`;
    statusBadge.textContent = isDone ? 'Done' : isErr ? 'Error' : (p.status === 'converting' ? 'Converting…' : 'Downloading…');

    const fill = row.querySelector('.feed-bar-fill');
    fill.style.width = `${p.percent || 0}%`;
    fill.className = `feed-bar-fill ${isDone ? 'done' : ''}`;
  });

  // Finished State: Automatic Download Trigger
  if (data.status === 'done' && !$('download-ready-card')) {
    const fileUrl = `/api/file/${taskId}`;
    const filename = data.output_name || (data.output_type === 'zip' ? 'Music_Archive.zip' : 'music.mp3');

    triggerAutoDownload(fileUrl, filename);

    const stage = $('progress-stage');
    const readyCard = document.createElement('div');
    readyCard.id = 'download-ready-card';
    readyCard.className = 'download-ready';
    readyCard.innerHTML = `
      <div class="ready-msg">Conversion Complete! Download Started</div>
      <a href="${fileUrl}" download="${filename}" class="direct-save-btn">
        <span>Save ${data.output_type === 'zip' ? 'ZIP Folder' : 'MP3 File'}</span>
      </a>`;
    stage.querySelector('.progress-deck').appendChild(readyCard);

    setTimeout(() => {
      fetch(`/api/cleanup/${taskId}`, { method: 'DELETE' }).catch(() => {});
    }, 120000);
  }

  // Error Card
  if (data.status === 'error' && data.error && !feed.querySelector('.error-message')) {
    const stage = $('progress-stage');
    const errDiv = document.createElement('div');
    errDiv.innerHTML = `<div class="error-message" style="margin-top:12px;">${escHtml(data.error)}</div>`;
    stage.querySelector('.progress-deck').appendChild(errDiv);
  }
}

// ── Initialization ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Mode tabs
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Quality chips
  setupChips('single-chips', 'single-quality');
  setupChips('playlist-chips', 'playlist-quality');
  setupChips('multi-chips', 'multi-quality');

  // Single tab auto-fetch on paste and input debounce
  const singleInput = $('single-url');
  singleInput.addEventListener('paste', () => setTimeout(autoFetchSingle, 50));
  singleInput.addEventListener('input', () => {
    clearTimeout(state.debounceTimerSingle);
    state.debounceTimerSingle = setTimeout(autoFetchSingle, 500);
  });
  $('single-download-btn').addEventListener('click', handleSingleConvert);

  // Playlist tab auto-fetch on paste and input debounce
  const playlistInput = $('playlist-url');
  playlistInput.addEventListener('paste', () => setTimeout(autoFetchPlaylist, 50));
  playlistInput.addEventListener('input', () => {
    clearTimeout(state.debounceTimerPlaylist);
    state.debounceTimerPlaylist = setTimeout(autoFetchPlaylist, 500);
  });
  $('playlist-download-btn').addEventListener('click', handlePlaylistConvert);

  // Multi tab manual fetch only
  $('multi-urls').addEventListener('input', updateMultiCount);
  $('multi-fetch-btn').addEventListener('click', handleMultiInspect);
  $('multi-download-btn').addEventListener('click', handleMultiConvert);
});
