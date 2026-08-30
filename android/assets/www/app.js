// AudioRip Mobile Client
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
  const autoDownloadToggle = document.getElementById('autoDownloadToggle');
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
  let autoDownload = true;
  let activeEntity = null;
  let debounceTimer = null;
  let autoDownloadTimer = null;
  let activeEventSource = null;
  let apiBase = '';

  // Native Android Bridge Helper
  const isAndroid = () => typeof window.Android !== 'undefined';
  const usesOnDeviceEngine = () => isAndroid() && typeof window.Android.inspectOnDevice === 'function';
  
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

  // ── Engine Initialization (100% On-Device APK vs Local Companion) ───────────
  async function initBackend() {
    if (usesOnDeviceEngine()) {
      apiBase = '';
      console.log('⚡ AudioRip: 100% on-device native engine active');
      return;
    }

    // When accessed in a desktop browser or self-hosted companion server
    if (window.location.protocol.startsWith('http')) {
      apiBase = '';
      console.log('⚡ AudioRip: Same-origin companion server connected');
      return;
    }

    // Try local port 5000 if running a local companion daemon
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      const res = await fetch('http://127.0.0.1:5000/api/health', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        apiBase = 'http://127.0.0.1:5000';
        console.log('⚡ AudioRip: Local daemon connected:', apiBase);
        return;
      }
    } catch (e) {
      // Local daemon inactive
    }
  }
  initBackend();

  // ── Helper fetch for companion/web mode ───────────────────────────────────
  async function localFetch(path, options = {}) {
    const url = `${apiBase}${path}`;
    return await fetch(url, options);
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

  // ── Auto-Download Toggle ─────────────────────────────────────────────────
  if (autoDownloadToggle) {
    autoDownloadToggle.addEventListener('click', () => {
      autoDownload = !autoDownload;
      autoDownloadToggle.classList.toggle('active', autoDownload);
      triggerHaptic(25);
      showNotification(autoDownload ? 'Auto-Download enabled ⚡' : 'Auto-Download disabled');
    });
  }

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
    clearTimeout(autoDownloadTimer);
    resetPreview();
  });

  urlInput.addEventListener('input', () => {
    clearBtn.classList.toggle('visible', urlInput.value.length > 0);
    clearTimeout(debounceTimer);
    clearTimeout(autoDownloadTimer);
    debounceTimer = setTimeout(handleAutoFetch, 200);
  });

  urlInput.addEventListener('paste', () => {
    clearTimeout(autoDownloadTimer);
    setTimeout(handleAutoFetch, 60);
  });

  // ── Share Intent Handler (YouTube -> Share -> AudioRip) ───────────────────
  window.handleSharedUrl = function (url) {
    if (!url) return;
    const cleanUrl = url.trim();
    if (cleanUrl.includes('list=') || cleanUrl.includes('playlist')) {
      setMode('playlist');
    } else {
      setMode('single');
    }
    urlInput.value = cleanUrl;
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

    showLoadingPreview('Resolving audio metadata on-device...');

    // 100% On-Device Engine path
    if (usesOnDeviceEngine()) {
      window.Android.inspectOnDevice(url);
      return;
    }

    // Companion server / web fallback
    try {
      const res = await localFetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      activeEntity = data;
      renderPreview(data);
    } catch (err) {
      showErrorPreview(err.message);
    }
  }

  // ── Multi-Link Batch Inspector ───────────────────────────────────────────
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
    showLoadingPreview('Inspecting all playlist & song links on-device...');

    // 100% On-Device Engine path
    if (usesOnDeviceEngine()) {
      window.Android.inspectManyOnDevice(JSON.stringify(lines));
      return;
    }

    // Companion server / web fallback
    try {
      const res = await localFetch('/api/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: lines })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Inspection failed (${res.status})`);
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
    clearTimeout(autoDownloadTimer);
    previewCard.classList.remove('visible');
    previewSpinner.classList.remove('visible');
    previewContent.classList.remove('visible');
    downloadBtn.disabled = true;
    btnText.textContent = 'Convert & Download MP3';
    activeEntity = null;
  }

  function showErrorPreview(msg) {
    clearTimeout(autoDownloadTimer);
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
    clearTimeout(autoDownloadTimer);
    previewSpinner.classList.remove('visible');
    previewContent.classList.add('visible');
    multiTreeWrap.innerHTML = '';

    previewThumb.src = data.thumbnail || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" fill="%231E222B"><rect width="80" height="80"/></svg>';
    previewTitle.textContent = data.title || 'Track';
    previewAuthor.textContent = data.uploader || 'YouTube';
    previewDuration.textContent = data.duration || 'Ready';
    previewTypePill.textContent = data.type === 'playlist' ? 'PLAYLIST' : 'SINGLE';
    previewTrackCount.textContent = data.type === 'playlist' ? `${data.count} Tracks` : '1 Track';

    downloadBtn.disabled = false;
    btnText.textContent = data.type === 'playlist' ? `Convert Playlist (${data.count} Tracks)` : `Convert ${selectedQuality}kbps MP3`;

    // ⚡ Auto-Download Feature: Trigger conversion hands-free once resolved
    if (autoDownload) {
      btnText.textContent = '⚡ Auto-Converting MP3...';
      autoDownloadTimer = setTimeout(() => {
        if (activeEntity && !downloadBtn.disabled) {
          downloadBtn.click();
        }
      }, 350);
    }
  }

  function renderMultiPreview(data) {
    clearTimeout(autoDownloadTimer);
    previewSpinner.classList.remove('visible');
    previewContent.classList.add('visible');

    previewThumb.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" fill="%231E222B"><rect width="80" height="80"/></svg>';
    previewTitle.textContent = `Batch Package (${data.total_tracks} Tracks)`;
    previewAuthor.textContent = `${(data.playlists || []).length} Playlists, ${(data.singles || []).length} Single Tracks`;
    previewDuration.textContent = 'Batch Process';
    previewTypePill.textContent = 'MULTI';
    previewTrackCount.textContent = `${data.total_tracks} Total Tracks`;

    let html = '';
    (data.playlists || []).forEach((p) => {
      html += `<div class="tree-item"><span class="tree-badge playlist">PLAYLIST</span><span class="tree-name">${p.title}</span><span class="tree-count">${p.count} tracks</span></div>`;
    });
    (data.singles || []).forEach((s) => {
      html += `<div class="tree-item"><span class="tree-badge single">SINGLE</span><span class="tree-name">${s.title}</span></div>`;
    });
    (data.errors || []).forEach((e) => {
      html += `<div class="tree-item"><span class="tree-badge error">SKIPPED</span><span class="tree-name">${e.url}</span></div>`;
    });
    multiTreeWrap.innerHTML = html;

    downloadBtn.disabled = data.total_tracks === 0;
    btnText.textContent = `Convert Multi-Link Batch (${data.total_tracks} Tracks)`;

    if (autoDownload && data.total_tracks > 0) {
      btnText.textContent = '⚡ Auto-Converting Multi Batch...';
      autoDownloadTimer = setTimeout(() => {
        if (activeEntity && !downloadBtn.disabled) {
          downloadBtn.click();
        }
      }, 400);
    }
  }

  // ── Download & Conversion Flow ───────────────────────────────────────────
  downloadBtn.addEventListener('click', async () => {
    if (!activeEntity) return;

    triggerHaptic(50);
    downloadBtn.disabled = true;
    btnText.textContent = 'Initializing On-Device Engine...';
    progressPanel.classList.add('visible');
    tracklistProgress.innerHTML = '';
    progressBarFill.style.width = '0%';
    percentageLabel.textContent = '0%';
    statusLabel.textContent = 'Starting conversion...';

    const urls = currentMode === 'multi' 
      ? (activeEntity.urls || multiInput.value.split('\n').map((v) => v.trim()).filter((v) => v.startsWith('http')))
      : [urlInput.value.trim()];

    // 100% On-Device Engine execution
    if (usesOnDeviceEngine()) {
      window.Android.convertOnDevice(JSON.stringify(urls), selectedQuality);
      return;
    }

    // Companion server / web fallback
    try {
      const res = await localFetch('/api/download', {
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

  // Companion SSE progress stream (used in companion web mode only)
  function streamProgress(taskId) {
    if (activeEventSource) activeEventSource.close();
    activeEventSource = new EventSource(`${apiBase}/api/progress/${taskId}`);

    activeEventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.status === 'converting') {
        const progList = data.progress || [];
        const total = progList.length;
        let sumPercent = 0;
        progList.forEach((p) => { sumPercent += (p.percent || 0); });
        const avgPercent = total > 0 ? Math.round(sumPercent / total) : 0;
        progressBarFill.style.width = `${avgPercent}%`;
        percentageLabel.textContent = `${avgPercent}%`;
        statusLabel.textContent = `Converting ${total} Tracks...`;
      } else if (data.status === 'completed' || data.status === 'done') {
        activeEventSource.close();
        progressBarFill.style.width = '100%';
        percentageLabel.textContent = '100%';
        statusLabel.textContent = '✓ Conversion Complete!';
        btnText.textContent = 'Convert Another MP3';
        downloadBtn.disabled = false;
        triggerHaptic(80);
      } else if (data.status === 'error') {
        activeEventSource.close();
        statusLabel.textContent = `Error: ${data.error || 'Conversion failed'}`;
        downloadBtn.disabled = false;
        btnText.textContent = 'Retry Download';
      }
    };
  }

  // ── Native On-Device Event Listener (Called by MainActivity.java) ────────
  window.onNativeEvent = function (raw) {
    try {
      const event = typeof raw === 'string' ? JSON.parse(raw) : raw;
      
      if (event.kind === 'info') {
        activeEntity = event;
        renderPreview(event);
      } else if (event.kind === 'multiInfo') {
        activeEntity = {
          type: 'multi',
          ...event,
          urls: event.urls || multiInput.value.split('\n').map((v) => v.trim()).filter((v) => v.startsWith('http'))
        };
        renderMultiPreview(event);
      } else if (event.kind === 'progress') {
        progressPanel.classList.add('visible');
        progressBarFill.style.width = `${event.percent || 0}%`;
        percentageLabel.textContent = `${event.percent || 0}%`;
        statusLabel.textContent = event.message || 'Processing on device…';
      } else if (event.kind === 'complete') {
        progressBarFill.style.width = '100%';
        percentageLabel.textContent = '100%';
        const count = event.count || 1;
        statusLabel.textContent = `✓ Saved ${count} MP3 file(s) to Music/AudioRip`;
        btnText.textContent = 'Convert Another MP3';
        downloadBtn.disabled = false;
        triggerHaptic(80);
        showNotification(`Saved ${count} MP3 to Music/AudioRip 🎵`);
      } else if (event.kind === 'error') {
        statusLabel.textContent = `Error: ${event.message || 'Conversion failed'}`;
        btnText.textContent = 'Try Again';
        downloadBtn.disabled = false;
        showErrorPreview(event.message || 'Conversion failed');
        showNotification(event.message || 'Conversion failed');
      }
    } catch (err) {
      console.error('Invalid native event received:', err);
    }
  };

  // ── In-App Update System & Changelog Viewer (GitHub Releases) ─────────────
  const CURRENT_VERSION = '1.1.0';
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

    lines.forEach((line) => {
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
      const n1 = p1[i] || 0, n2 = p2[i] || 0;
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
        if (isManual) showNotification('AudioRip is up to date.');
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
          newFeaturesList.innerHTML = features.map((f) => `<li>${f}</li>`).join('');
        }
        if (fixes.length > 0) {
          bugFixesList.innerHTML = fixes.map((f) => `<li>${f}</li>`).join('');
        }

        const apkAsset = (release.assets || []).find((a) => a.name.endsWith('.apk'));
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

  // Auto-check for updates 4 seconds after launch
  setTimeout(() => checkAppUpdates(false), 4000);

  // Instagram external link
  if (creatorLink) {
    creatorLink.addEventListener('click', (e) => {
      if (isAndroid() && window.Android.openExternalUrl) {
        e.preventDefault();
        window.Android.openExternalUrl('https://www.instagram.com/sujallbhure?igsi=MWozaXhsNnJkYXcwcg==');
      }
    });
  }
});
