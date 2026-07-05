import * as rrweb from 'rrweb';

let stopRecording: any = null;
let isBackgroundRecording = false;
let controlBarElement: HTMLDivElement | null = null;
let timerInterval: any = null;

// --- Recording Functions ---

function startRecording(recordMode: string) {
  if (stopRecording) return; // Already recording

  if (recordMode === 'this-tab') {
    stopRecording = rrweb.record({
      emit(event) {
        chrome.runtime.sendMessage({ action: 'addEvent', event });
      }
    });
    console.log('[Reportr] Started recording DOM interactions.');
  }
}

function cleanUpRecording() {
  if (stopRecording) {
    try { stopRecording(); } catch (_) {}
    stopRecording = null;
  }
  isBackgroundRecording = false;
  removeControlBar();
}

// --- Sync State on Load ---
chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
  if (response && response.isRecording) {
    isBackgroundRecording = true;
    if (response.recordMode === 'this-tab' || response.recordMode === 'desktop') {
      startRecording(response.recordMode);
      injectControlBar();
    }
  }
});

// --- Listen to Background Messages ---
chrome.runtime.onMessage.addListener((request: any, _sender: any, sendResponse: any) => {
  if (request.action === 'start') {
    isBackgroundRecording = true;
    startRecording(request.recordMode);
    if (request.recordMode === 'this-tab' || request.recordMode === 'desktop') {
      injectControlBar();
    }
    sendResponse({ status: 'started' });
  } else if (request.action === 'stop') {
    cleanUpRecording();
    sendResponse({ status: 'stopped' });
  } else if (request.action === 'ping') {
    sendResponse({ status: 'ready' });
  } else if (request.action === 'startSelection') {
    startAreaSelection();
    sendResponse({ status: 'selection_started' });
  } else if (request.action === 'cropImage') {
    cropCapturedImage(request.dataUrl, request.box).then((cropped) => {
      sendResponse({ croppedDataUrl: cropped });
    });
    return true; // Keep channel open for async response
  } else if (request.action === 'captureFullPage') {
    runFullPageCapture(request.workspaceId);
    sendResponse({ status: 'started_full_page' });
  }
  return true;
});

// --- Listen for page events to relay ---
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || !event.data.type) return;

  const type = event.data.type;

  // Handle storage bridge requests from the review page
  if (type === 'REPORTR_GET_DRAFT') {
    const { draftId } = event.data;
    if (!draftId) return;

    chrome.storage.local.get([draftId], (result) => {
      window.postMessage({
        type: 'REPORTR_DRAFT_RESULT',
        draft: result[draftId] ?? null,
      }, '*');
    });
    return;
  }

  if (type === 'reportr_network' || type === 'reportr_console' || type === 'reportr_click') {
    if (!isBackgroundRecording) return;
    chrome.runtime.sendMessage({
      action: 'addEvent',
      event: {
        type: 6,
        data: { plugin: type.replace('reportr_', ''), payload: event.data.detail },
        timestamp: Date.now()
      }
    });
  }
});

// --- In-Tab Control Bar (Shadow DOM) ---

function injectControlBar() {
  if (document.getElementById('reportr-control-bar')) return;

  const container = document.createElement('div');
  container.id = 'reportr-control-bar';
  container.style.cssText = 'position: fixed; bottom: 24px; left: 24px; z-index: 2147483647; pointer-events: auto;';
  
  const shadow = container.attachShadow({ mode: 'open' });

  // Stylesheet
  const style = document.createElement('style');
  style.textContent = `
    .reportr-panel {
      display: flex;
      align-items: center;
      gap: 16px;
      background-color: #09090b;
      color: #f4f4f5;
      border: 1px solid #27272a;
      border-radius: 9999px;
      padding: 8px 18px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.4);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      user-select: none;
    }
    .reportr-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .reportr-dot {
      width: 8px;
      height: 8px;
      background-color: #ef4444;
      border-radius: 50%;
    }
    .reportr-dot.pulse {
      animation: reportr-pulse 1.5s infinite;
    }
    @keyframes reportr-pulse {
      0% { transform: scale(0.95); opacity: 1; }
      50% { transform: scale(1.15); opacity: 0.4; }
      100% { transform: scale(0.95); opacity: 1; }
    }
    .reportr-timer {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      font-weight: 600;
      color: #e4e4e7;
    }
    .reportr-divider {
      width: 1px;
      height: 16px;
      background-color: #27272a;
    }
    .reportr-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .reportr-btn {
      background: none;
      border: none;
      color: #a1a1aa;
      cursor: pointer;
      padding: 6px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s, color 0.2s;
    }
    .reportr-btn:hover {
      background-color: #18181b;
      color: #f4f4f5;
    }
    .reportr-btn-stop {
      color: #f87171;
    }
    .reportr-btn-stop:hover {
      background-color: #450a0a;
      color: #fca5a5;
    }
  `;

  // HTML layout
  const panel = document.createElement('div');
  panel.className = 'reportr-panel';

  const indicator = document.createElement('div');
  indicator.className = 'reportr-indicator';
  const dot = document.createElement('div');
  dot.className = 'reportr-dot pulse';
  const timer = document.createElement('span');
  timer.className = 'reportr-timer';
  timer.textContent = '00:00';
  indicator.appendChild(dot);
  indicator.appendChild(timer);

  const divider = document.createElement('div');
  divider.className = 'reportr-divider';

  const actions = document.createElement('div');
  actions.className = 'reportr-actions';

  const pauseBtn = document.createElement('button');
  pauseBtn.className = 'reportr-btn';
  pauseBtn.title = 'Pause Recording';
  pauseBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="4" x2="18" y2="20"></line><line x1="6" y1="4" x2="6" y2="20"></line></svg>`;

  const stopBtn = document.createElement('button');
  stopBtn.className = 'reportr-btn reportr-btn-stop';
  stopBtn.title = 'Stop and Save';
  stopBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;

  actions.appendChild(pauseBtn);
  actions.appendChild(stopBtn);

  panel.appendChild(indicator);
  panel.appendChild(divider);
  panel.appendChild(actions);

  shadow.appendChild(style);
  shadow.appendChild(panel);
  document.body.appendChild(container);
  controlBarElement = container;

  // Click events
  let localPaused = false;
  pauseBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: localPaused ? 'resumeRecording' : 'pauseRecording' }, () => {
      localPaused = !localPaused;
      dot.className = localPaused ? 'reportr-dot' : 'reportr-dot pulse';
      pauseBtn.title = localPaused ? 'Resume' : 'Pause';
      pauseBtn.innerHTML = localPaused 
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="4" x2="18" y2="20"></line><line x1="6" y1="4" x2="6" y2="20"></line></svg>`;
    });
  });

  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stopRecording' });
  });

  // Local timer update interval
  const updateTimer = () => {
    chrome.runtime.sendMessage({ action: 'getRecordingState' }, (state) => {
      if (!state || !state.isRecording) {
        removeControlBar();
        return;
      }
      
      localPaused = state.isPaused;
      dot.className = state.isPaused ? 'reportr-dot' : 'reportr-dot pulse';
      pauseBtn.title = state.isPaused ? 'Resume' : 'Pause';
      pauseBtn.innerHTML = state.isPaused 
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="4" x2="18" y2="20"></line><line x1="6" y1="4" x2="6" y2="20"></line></svg>`;

      let elapsedMs = 0;
      if (state.isPaused) {
        elapsedMs = state.pauseTimestamp - state.recordingStartedAt - state.totalPausedDuration;
      } else {
        elapsedMs = Date.now() - state.recordingStartedAt - state.totalPausedDuration;
      }

      const totalSecs = Math.max(0, Math.floor(elapsedMs / 1000));
      const mins = Math.floor(totalSecs / 60).toString().padStart(2, '0');
      const secs = (totalSecs % 60).toString().padStart(2, '0');
      timer.textContent = `${mins}:${secs}`;
    });
  };

  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

function removeControlBar() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (controlBarElement) {
    try { controlBarElement.remove(); } catch (_) {}
    controlBarElement = null;
  }
}

// --- Screenshot Selected Area Selection Overlay ---

function startAreaSelection() {
  if (document.getElementById('reportr-select-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'reportr-select-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background-color: rgba(0, 0, 0, 0.4); z-index: 2147483647;
    cursor: crosshair; user-select: none; pointer-events: auto;
  `;

  const selection = document.createElement('div');
  selection.style.cssText = `
    position: absolute; border: 2px dashed #3b82f6;
    background-color: rgba(59, 130, 246, 0.15); display: none;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.4);
  `;
  overlay.appendChild(selection);
  document.body.appendChild(overlay);

  let startX = 0, startY = 0;
  let isDrawing = false;

  const onMouseDown = (e: MouseEvent) => {
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    selection.style.left = `${startX}px`;
    selection.style.top = `${startY}px`;
    selection.style.width = '0px';
    selection.style.height = '0px';
    selection.style.display = 'block';
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDrawing) return;
    const currentX = e.clientX;
    const currentY = e.clientY;

    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const w = Math.abs(startX - currentX);
    const h = Math.abs(startY - currentY);

    selection.style.left = `${x}px`;
    selection.style.top = `${y}px`;
    selection.style.width = `${w}px`;
    selection.style.height = `${h}px`;
  };

  const onMouseUp = (e: MouseEvent) => {
    if (!isDrawing) return;
    isDrawing = false;
    
    const endX = e.clientX;
    const endY = e.clientY;
    
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(startX - endX);
    const h = Math.abs(startY - endY);

    // Clean up elements
    document.body.removeChild(overlay);

    if (w > 5 && h > 5) {
      chrome.runtime.sendMessage({
        action: 'selectionDone',
        box: { x, y, w, h }
      });
    }
  };

  overlay.addEventListener('mousedown', onMouseDown);
  overlay.addEventListener('mousemove', onMouseMove);
  overlay.addEventListener('mouseup', onMouseUp);
}

// --- Canvas Image Cropping (DPR Aware) ---

function cropCapturedImage(dataUrl: string, box: { x: number, y: number, w: number, h: number }): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = box.w * dpr;
      canvas.height = box.h * dpr;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(
          img,
          box.x * dpr,
          box.y * dpr,
          box.w * dpr,
          box.h * dpr,
          0,
          0,
          box.w * dpr,
          box.h * dpr
        );
      }
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
}

// --- Full Page Capture Orchestration (Canvas Stitching) ---

async function runFullPageCapture(workspaceId: string | null) {
  // Hide scrollbar temporarily
  const originalOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const originalScrollTop = window.scrollY || document.documentElement.scrollTop;
  const totalHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const dpr = window.devicePixelRatio || 1;

  // Create stitch canvas
  const canvas = document.createElement('canvas');
  canvas.width = viewportWidth * dpr;
  canvas.height = totalHeight * dpr;
  const ctx = canvas.getContext('2d');

  let currentScroll = 0;
  const chunks: { dataUrl: string, y: number }[] = [];

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  // Loop through and capture each viewport chunk
  while (currentScroll < totalHeight) {
    window.scrollTo(0, currentScroll);
    await delay(250); // wait for render

    const response = await new Promise<any>((resolve) => {
      chrome.runtime.sendMessage({ action: 'captureViewportChunk' }, (res) => {
        resolve(res);
      });
    });

    if (response && response.dataUrl) {
      chunks.push({ dataUrl: response.dataUrl, y: currentScroll });
    }

    currentScroll += viewportHeight;
  }

  // Restore scroll
  document.body.style.overflow = originalOverflow;
  window.scrollTo(0, originalScrollTop);

  // Load and draw chunks onto stitch canvas
  const drawPromises = chunks.map(chunk => {
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        if (ctx) {
          ctx.drawImage(img, 0, chunk.y * dpr);
        }
        resolve();
      };
      img.src = chunk.dataUrl;
    });
  });

  await Promise.all(drawPromises);

  // Send stitched image back to background to upload
  const stitchedDataUrl = canvas.toDataURL('image/png');
  chrome.runtime.sendMessage({
    action: 'fullPageCaptured',
    dataUrl: stitchedDataUrl,
    workspaceId
  });
}
