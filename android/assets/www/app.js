// AudioRip Pro Mobile Client
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const modeTabs = document.getElementById('modeTabs');
  const tabIndicator = document.getElementById('tabIndicator');
  const tabSingle = document.getElementById('tabSingle');
  const tabPlaylist = document.getElementById('tabPlaylist');
  const tabMulti = document.getElementById('tabMulti');
  
  const singlePanel = document.getElementById('singlePanel');
  const multiPanel = document.getElementById('multiPanel');
  const urlInput = document.getElementById('urlInput');
  const pasteBtn = document.getElementById('pasteBtn');
  const clearBtn = document.getElementById('clearBtn');
  
  const multiInput = document.getElementById('multiInput');
  const multiPasteBtn = document.getElementById('multiPasteBtn');
  const inspectBtn = document.getElementById('inspectBtn');
  
  const qualitySelector = document.getElementById('qualitySelector');
  const previewCard = document.getElementById('previewCard');
  const previewSpinner = document.getElementById('previewSpinner');
  const previewContent = document.getElementById('previewContent');
  const previewThumb = document.getElementById('previewThumb');
  const previewTitle = document.getElementById('previewTitle');
  const previewAuthor = document.getElementById('previewAuthor');
  const previewDuration = document.getElementById('previewDuration');
  const previewTrackCount = document.getElementById('previewTrackCount');
  const previewTypePill = document.getElementById('previewTypePill');
  const multiTreeWrap = document.getElementById('multiTreeWrap');
  
  const downloadBtn = document.getElementById('downloadBtn');
  const btnText = document.getElementById('btnText');
  const progressPanel = document.getElementById('progressPanel');
  const statusLabel = document.getElementById('statusLabel');
  const percentageLabel = document.getElementById('percentageLabel');
  const progressBarFill = document.getElementById('progressBarFill');
  const speedLabel = document.getElementById('speedLabel');
  const etaLabel = document.getElementById('etaLabel');
  const tracklistProgress = document.getElementById('tracklistProgress');
  const creatorLink = document.getElementById('creatorLink');

  // App State
  let currentMode = 'single';
  let selectedQuality = '320';
  let activeEntity = null;
  let debounceTimer = null;
  let activeEventSource = null;
  let apiBase = 'https://audiorip-backend.onrender.com';

  // Native Android Bridge Helper
  const isAndroid = () => typeof window.Android !== 'undefined';
  const triggerHaptic = (ms = 40) => {
    if (isAndroid() && window.Android.vibrate) {
      window.Android.vibrate(ms);
    } else if (navigator.vibrate) {
      navigator.vibrate(ms);
    }
  };
  const showNotification = (msg) => {
    if (isAndroid() && window.Android.showToast) {
      window.Android.showToast(msg);
    }
  };

  // ── Auto-Detect Backend (Local Termux vs Cloud Render) ─────────────────────
  async function initBackend() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch('http://127.0.0.1:5000/api/health', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        apiBase = 'http://127.0.0.1:5000';
        console.log('⚡ Connected to local high-speed engine:', apiBase);
        return;
      }
    } catch (e) {
      // Local engine not running, fall back to cloud backend
    }

    // Default to cloud backend or relative if hosted directly
    if (window.location.protocol.startsWith('http') && !window.location.hostname.includes('netlify')) {
      apiBase = '';
    } else {
      apiBase = 'https://audiorip-backend.onrender.com';
    }
    console.log('🌐 Connected to backend:', apiBase);

    // Warm up cloud instance on page open
    fetch(`${apiBase}/api/health`).catch(() => {});
  }
  initBackend();

  // ── Robust Fetch with Auto-Retry for Cloud Cold Starts ───────────────────
  async function robustFetch(path, options = {}, retries = 2) {
    const url = `${apiBase}${path}`;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, options);
        if (res.status === 502 || res.status === 504) {
          if (attempt < retries) {
            updateLoadingMessage('Waking up cloud engine (free tier cold-start)...');
            await new Promise((r) => setTimeout(r, 4000));
            continue;
          }
        }
        return res;
      } catch (err) {
        if (attempt < retries) {
          updateLoadingMessage('Retrying connection...');
          await new Promise((r) => setTimeout(r, 3000));
        } else {
          throw err;
        }
      }
    }
  }

  function updateLoadingMessage(msg) {
    const spinnerText = previewSpinner.querySelector('span');
    if (spinnerText) spinnerText.textContent = msg;
  }

  // ── Mode Tab Switching with Sliding Indicator Animation ──────────────────
  function updateTabIndicator(index) {
    tabIndicator.style.transform = `translateX(${index * 100}%)`;
  }

  function setMode(mode) {
    if (currentMode === mode) return;
    currentMode = mode;
    triggerHaptic(30);

    const tabs = [tabSingle, tabPlaylist, tabMulti];
    tabs.forEach((tab) => {
      const isActive = tab.dataset.mode === mode;
      tab.classList.toggle('active', isActive);
      if (isActive) {
        const idx = tabs.indexOf(tab);
        updateTabIndicator(idx);
      }
    });

    if (mode === 'multi') {
      singlePanel.classList.remove('active');
      multiPanel.classList.add('active');
      urlInput.value = '';
    } else {
      multiPanel.classList.remove('active');
      singlePanel.classList.add('active');
      urlInput.placeholder = mode === 'single' ? 'Paste single song link...' : 'Paste playlist link...';
    }

    resetPreview();
  }

  tabSingle.addEventListener('click', () => setMode('single'));
  tabPlaylist.addEventListener('click', () => setMode('playlist'));
  tabMulti.addEventListener('click', () => setMode('multi'));

  // ── Quality Selector ─────────────────────────────────────────────────────
  qualitySelector.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    triggerHaptic(20);
    document.querySelectorAll('.quality-chips .chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    selectedQuality = chip.dataset.quality;
  });

  // ── Paste & Clear Handlers ───────────────────────────────────────────────
  async function getClipboardData() {
    triggerHaptic(35);
    if (isAndroid() && window.Android.getClipboardText) {
      const text = window.Android.getClipboardText();
      if (text) return text;
    }
    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        return await navigator.clipboard.readText();
      } catch (err) {
        console.warn('Clipboard read failed:', err);
      }
    }
    return '';
  }

  pasteBtn.addEventListener('click', async () => {
    const text = await getClipboardData();
    if (text) {
      urlInput.value = text.trim();
      clearBtn.classList.add('visible');
      handleAutoFetch();
    }
  });

  multiPasteBtn.addEventListener('click', async () => {
    const text = await getClipboardData();
    if (text) {
      multiInput.value = (multiInput.value ? multiInput.value + '\n' : '') + text.trim();
    }
  });

  clearBtn.addEventListener('click', () => {
    triggerHaptic(20);
    urlInput.value = '';
    clearBtn.classList.remove('visible');
    resetPreview();
  });

  urlInput.addEventListener('input', () => {
    clearBtn.classList.toggle('visible', urlInput.value.length > 0);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleAutoFetch, 400);
  });

  urlInput.addEventListener('paste', () => {
    setTimeout(handleAutoFetch, 100);
  });

  // ── Share Intent Handler ─────────────────────────────────────────────────
  window.handleSharedUrl = function (url) {
    if (!url) return;
    if (url.includes('list=') || url.includes('playlist')) {
      setMode('playlist');
    } else {
      setMode('single');
    }
    urlInput.value = url.trim();
    clearBtn.classList.add('visible');
    handleAutoFetch();
  };

  // ── Auto-Fetch & Metadata Resolution ─────────────────────────────────────
  async function handleAutoFetch() {
    const url = urlInput.value.trim();
    if (!url || !url.startsWith('http')) {
      resetPreview();
      return;
    }

    showLoadingPreview('Resolving audio streams...');

    try {
      const res = await robustFetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${res.status}`);
      }

      const data = await res.json();
      activeEntity = data;
      renderPreview(data);
    } catch (err) {
      showErrorPreview(err.message);
    }
  }

  // ── Multi-Link Inspector ─────────────────────────────────────────────────
  inspectBtn.addEventListener('click', async () => {
    const lines = multiInput.value
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('http'));

    if (lines.length === 0) {
      showNotification('Please paste at least one valid URL');
      return;
    }

    triggerHaptic(40);
    showLoadingPreview('Inspecting all playlist and song links...');

    try {
      const res = await robustFetch('/api/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: lines })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Inspection failed with status ${res.status}`);
      }

      const data = await res.json();
      activeEntity = { type: 'multi', ...data, urls: lines };
      renderMultiPreview(data);
    } catch (err) {
      showErrorPreview(err.message);
    }
  });

  // ── Preview Renderers ────────────────────────────────────────────────────
  function showLoadingPreview(text = 'Resolving audio streams...') {
    previewCard.classList.add('visible');
    previewSpinner.classList.add('visible');
    updateLoadingMessage(text);
    previewContent.classList.remove('visible');
    downloadBtn.disabled = true;
    btnText.textContent = 'Resolving Streams...';
  }

  function resetPreview() {
    previewCard.classList.remove('visible');
    previewSpinner.classList.remove('visible');
    previewContent.classList.remove('visible');
    downloadBtn.disabled = true;
    btnText.textContent = 'Convert & Download MP3';
    activeEntity = null;
  }

  function showErrorPreview(msg) {
    previewCard.classList.add('visible');
    previewSpinner.classList.remove('visible');
    previewContent.classList.add('visible');
    multiTreeWrap.innerHTML = `<div class="tree-item"><span class="tree-badge error">ERROR</span><span class="tree-name">${msg}</span></div>`;
    previewThumb.src = '';
    previewTitle.textContent = 'Could not resolve link';
    previewAuthor.textContent = 'Check URL or internet connection';
    previewDuration.textContent = '--';
    previewTrackCount.textContent = '0 Tracks';
    previewTypePill.textContent = 'ERROR';
    downloadBtn.disabled = true;
    btnText.textContent = 'Invalid Link';
  }

  function renderPreview(data) {
    previewSpinner.classList.remove('visible');
    previewContent.classList.add('visible');
    multiTreeWrap.innerHTML = '';

    previewThumb.src = data.thumbnail || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" fill="%231E222B"><rect width="80" height="80"/></svg>';
    previewTitle.textContent = data.title || 'Track';
    previewAuthor.textContent = data.uploader || 'YouTube';
    previewDuration.textContent = data.duration || '--';
    previewTypePill.textContent = data.type === 'playlist' ? 'PLAYLIST' : 'SINGLE';
    previewTrackCount.textContent = data.type === 'playlist' ? `${data.count} Tracks` : '1 Track';

    downloadBtn.disabled = false;
    btnText.textContent = data.type === 'playlist' ? `Download Playlist ZIP (${data.count} Tracks)` : 'Download 320kbps MP3';
  }

  function renderMultiPreview(data) {
    previewSpinner.classList.remove('visible');
    previewContent.classList.add('visible');

    previewThumb.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" fill="%231E222B"><rect width="80" height="80"/></svg>';
    previewTitle.textContent = `Batch Package (${data.total_tracks} Tracks)`;
    previewAuthor.textContent = `${data.playlists.length} Playlists, ${data.singles.length} Single Tracks`;
    previewDuration.textContent = 'ZIP Archive';
    previewTypePill.textContent = 'MULTI';
    previewTrackCount.textContent = `${data.total_tracks} Total Tracks`;

    let html = '';
    data.playlists.forEach((p) => {
      html += `<div class="tree-item"><span class="tree-badge playlist">PLAYLIST</span><span class="tree-name">${p.title}</span><span class="tree-count">${p.count} tracks</span></div>`;
    });
    data.singles.forEach((s) => {
      html += `<div class="tree-item"><span class="tree-badge single">SINGLE</span><span class="tree-name">${s.title}</span></div>`;
    });
    data.errors.forEach((e) => {
      html += `<div class="tree-item"><span class="tree-badge error">SKIPPED</span><span class="tree-name">${e.url}</span></div>`;
    });
    multiTreeWrap.innerHTML = html;

    downloadBtn.disabled = data.total_tracks === 0;
    btnText.textContent = `Download Multi-Link ZIP (${data.total_tracks} Tracks)`;
  }

  // ── Download & Conversion Flow ───────────────────────────────────────────
  downloadBtn.addEventListener('click', async () => {
    if (!activeEntity) return;

    triggerHaptic(50);
    downloadBtn.disabled = true;
    btnText.textContent = 'Initializing Converter...';
    progressPanel.classList.add('visible');
    tracklistProgress.innerHTML = '';
    progressBarFill.style.width = '0%';
    percentageLabel.textContent = '0%';
    statusLabel.textContent = 'Starting conversion...';

    const urls = currentMode === 'multi' ? activeEntity.urls : [urlInput.value.trim()];

    try {
      const res = await robustFetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, quality: selectedQuality })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to start conversion.');
      }

      const { task_id } = await res.json();
      streamProgress(task_id);
    } catch (err) {
      statusLabel.textContent = `Error: ${err.message}`;
      showNotification(`Download error: ${err.message}`);
      downloadBtn.disabled = false;
      btnText.textContent = 'Try Again';
    }
  });

  function streamProgress(taskId) {
    if (activeEventSource) {
      activeEventSource.close();
    }

    const progressUrl = `${apiBase}/api/progress/${taskId}`;
    activeEventSource = new EventSource(progressUrl);

    activeEventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.status === 'converting') {
        const progList = data.progress || [];
        const total = progList.length;
        let completed = 0;
        let sumPercent = 0;

        let trackHtml = '';
        progList.forEach((p, idx) => {
          if (p.status === 'completed') completed++;
          sumPercent += (p.percent || 0);

          trackHtml += `
            <div class="track-prog-item">
              <span class="track-prog-title">${p.title || `Track ${idx + 1}`}</span>
              <span class="track-prog-status">${p.status === 'completed' ? '✓ Done' : p.percent ? `${p.percent}%` : p.status}</span>
            </div>
          `;
        });

        tracklistProgress.innerHTML = trackHtml;
        const avgPercent = total > 0 ? Math.round(sumPercent / total) : 0;
        progressBarFill.style.width = `${avgPercent}%`;
        percentageLabel.textContent = `${avgPercent}%`;
        statusLabel.textContent = `Converting ${completed}/${total} Tracks...`;

        const activeTrack = progList.find((p) => p.status === 'downloading');
        if (activeTrack) {
          speedLabel.textContent = activeTrack.speed || '-- MB/s';
          etaLabel.textContent = activeTrack.eta ? `ETA: ${activeTrack.eta}` : 'Converting...';
        }
      } else if (data.status === 'completed' || data.status === 'done') {
        activeEventSource.close();
        progressBarFill.style.width = '100%';
        percentageLabel.textContent = '100%';
        statusLabel.textContent = 'Download Ready!';
        btnText.textContent = 'Download Complete!';
        triggerHaptic(80);
        showNotification('Conversion finished! Saving file...');

        const fileUrl = `${apiBase}/api/file/${taskId}`;
        triggerNativeOrWebDownload(fileUrl, data.output_name || 'audio.mp3');
      } else if (data.status === 'error') {
        activeEventSource.close();
        statusLabel.textContent = `Error: ${data.error || 'Conversion failed'}`;
        downloadBtn.disabled = false;
        btnText.textContent = 'Retry Download';
      }
    };

    activeEventSource.onerror = () => {
      activeEventSource.close();
    };
  }

  async function triggerNativeOrWebDownload(url, filename) {
    if (isAndroid() && window.Android.saveFile) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = function () {
          const base64data = reader.result.split(',')[1];
          window.Android.saveFile(base64data, filename, '');
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.error('Native save error:', err);
      }
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  // ── In-App Update System & Changelog Viewer ──────────────────────────────
  const CURRENT_VERSION = '1.0.0';
  const GITHUB_REPO = 'SujalBhure/audiorip-backend';
  
  const versionBadge = document.getElementById('versionBadge');
  const updateModal = document.getElementById('updateModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalDismissBtn = document.getElementById('modalDismissBtn');
  const modalUpdateBtn = document.getElementById('modalUpdateBtn');
  const modalTitle = document.getElementById('modalTitle');
  const modalVersionTag = document.getElementById('modalVersionTag');
  const newFeaturesList = document.getElementById('newFeaturesList');
  const bugFixesList = document.getElementById('bugFixesList');

  function parseChangelog(markdown) {
    const features = [];
    const fixes = [];
    if (!markdown) return { features, fixes };

    const lines = markdown.split('\n');
    let currentCategory = 'features';

    lines.forEach(line => {
      const trimmed = line.trim();
      if (/bug|fix|patch|issue/i.test(trimmed) && trimmed.startsWith('#')) {
        currentCategory = 'fixes';
      } else if (/new|feature|add|what/i.test(trimmed) && trimmed.startsWith('#')) {
        currentCategory = 'features';
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
        const item = trimmed.replace(/^[-*•]\s+/, '').trim();
        if (item) {
          if (currentCategory === 'fixes') {
            fixes.push(item);
          } else {
            features.push(item);
          }
        }
      }
    });

    return { features, fixes };
  }

  function compareVersions(v1, v2) {
    const p1 = v1.replace(/^v/, '').split('.').map(Number);
    const p2 = v2.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const n1 = p1[i] || 0;
      const n2 = p2[i] || 0;
      if (n1 > n2) return 1;
      if (n1 < n2) return -1;
    }
    return 0;
  }

  async function checkAppUpdates(isManual = false) {
    try {
      if (isManual) {
        showNotification('Checking for updates...');
        triggerHaptic(25);
      }

      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' }
      });

      if (!res.ok) {
        if (isManual) showNotification('No updates found or repository offline.');
        return;
      }

      const release = await res.json();
      const latestTag = release.tag_name || '';
      const releaseName = release.name || latestTag;
      const hasUpdate = compareVersions(latestTag, CURRENT_VERSION) > 0;

      if (hasUpdate) {
        triggerHaptic(60);
        modalTitle.textContent = 'Update Available';
        modalVersionTag.textContent = `${latestTag} · ${releaseName}`;

        const { features, fixes } = parseChangelog(release.body);
        
        if (features.length > 0) {
          newFeaturesList.innerHTML = features.map(f => `<li>${f}</li>`).join('');
        }
        if (fixes.length > 0) {
          bugFixesList.innerHTML = fixes.map(f => `<li>${f}</li>`).join('');
        }

        // Find direct APK asset or fall back to release page
        const apkAsset = (release.assets || []).find(a => a.name.endsWith('.apk'));
        const downloadUrl = apkAsset ? apkAsset.browser_download_url : release.html_url;

        modalUpdateBtn.href = downloadUrl;
        modalUpdateBtn.onclick = (e) => {
          if (isAndroid() && window.Android.openExternalUrl) {
            e.preventDefault();
            window.Android.openExternalUrl(downloadUrl);
          }
        };

        updateModal.classList.add('visible');
      } else if (isManual) {
        showNotification(`AudioRip is up to date (v${CURRENT_VERSION})`);
        triggerHaptic(30);
      }
    } catch (err) {
      if (isManual) showNotification('Could not check for updates');
    }
  }

  if (versionBadge) {
    versionBadge.addEventListener('click', () => checkAppUpdates(true));
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => {
      triggerHaptic(20);
      updateModal.classList.remove('visible');
    });
  }

  if (modalDismissBtn) {
    modalDismissBtn.addEventListener('click', () => {
      triggerHaptic(20);
      updateModal.classList.remove('visible');
    });
  }

  // Auto-check for updates 3 seconds after launch
  setTimeout(() => checkAppUpdates(false), 3000);

  // Instagram external link open
  if (creatorLink) {
    creatorLink.addEventListener('click', (e) => {
      if (isAndroid() && window.Android.openExternalUrl) {
        e.preventDefault();
        window.Android.openExternalUrl('https://www.instagram.com/sujallbhure?igsi=MWozaXhsNnJkYXcwcg==');
      }
    });
  }
});
