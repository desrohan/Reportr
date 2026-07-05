import { getBackendUrl } from './config';

// Recording state
let isRecording = false;
let isPaused = false;
let captureTabId: number | null = null;
let recordedEvents: any[] = [];
let recordingStartedAt: number | null = null;
let totalPausedDuration = 0;
let pauseTimestamp = 0;
let activeWorkspaceId: string | null = null;
let activeRecordMode: string | null = null;

async function setupOffscreenDocument(path: string) {
  try {
    await chrome.offscreen.closeDocument();
  } catch (_) {}
  
  await chrome.offscreen.createDocument({
    url: path,
    reasons: [
      chrome.offscreen.Reason.USER_MEDIA,
      chrome.offscreen.Reason.DISPLAY_MEDIA
    ],
    justification: 'Recording active browser tab and screen content',
  });
}

// Ensure the in-page control overlay is present in a given tab while recording.
// Tabs opened before the extension loaded have no content script, so a plain
// sendMessage silently fails — in that case we inject the content script on
// demand (it self-syncs recording state and renders the bar on load).
async function ensureRecordingUI(tabId: number) {
  if (!isRecording) return;
  chrome.tabs.sendMessage(tabId, { action: 'start', recordMode: activeRecordMode }, () => {
    if (chrome.runtime.lastError) {
      chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/content/recorder.js'],
      }).catch(() => {
        // Restricted page (chrome://, Web Store, PDF viewer). Nothing we can
        // inject here — the browser's native screen-share bar is the fallback.
      });
    }
  });
}

// Listen to Tab activation & navigation to keep the control overlay visible
chrome.tabs.onActivated.addListener((activeInfo) => {
  if (isRecording) ensureRecordingUI(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (isRecording && changeInfo.status === 'complete') ensureRecordingUI(tabId);
});

chrome.runtime.onMessage.addListener((request: any, _sender: any, sendResponse: any) => {
  if (request.action === 'getStatus') {
    sendResponse({ isRecording });
    return false;
  } else if (request.action === 'checkAuth') {
    // Resolves whether we currently have (or can refresh to) a valid session.
    getValidAccessToken().then((token) => sendResponse({ valid: !!token }));
    return true; // async response
  } else if (request.action === 'getRecordingState') {
    sendResponse({
      isRecording,
      isPaused,
      recordingStartedAt,
      totalPausedDuration,
      pauseTimestamp,
      recordMode: activeRecordMode
    });
    return false;
  } else if (request.action === 'startRecording') {
    handleStartRecording(request, sendResponse);
    return true; // Indicate async response
  } else if (request.action === 'stopRecording') {
    handleStopRecording();
    sendResponse({ success: true });
    return false;
  } else if (request.action === 'pauseRecording') {
    isPaused = true;
    pauseTimestamp = Date.now();
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'pause-recording' });
    sendResponse({ success: true });
    return false;
  } else if (request.action === 'resumeRecording') {
    isPaused = false;
    if (pauseTimestamp > 0) {
      totalPausedDuration += Date.now() - pauseTimestamp;
    }
    pauseTimestamp = 0;
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'resume-recording' });
    sendResponse({ success: true });
    return false;
  } else if (request.action === 'addEvent') {
    if (isRecording) {
      const e = request.event;
      if (e && (e.type === 4 || e.type === 6)) {
        recordedEvents.push(e);
      }
    }
    return false;
  } else if (request.target === 'background' && request.type === 'video-local-ready') {
    handleLocalVideoReady(request.data.draftKey, request.data.base64);
    return false;
  } else if (request.target === 'background' && request.type === 'recording-finished') {
    finishReportCreation(request.data.draftKey, request.data.videoUrl);
    return false;
  } else if (request.target === 'background' && request.type === 'recording-error') {
    console.error('[Reportr] Offscreen error:', request.data.error);
    if (request.data?.draftKey) {
      markDraftError(request.data.draftKey, request.data.error);
    }
    return false;
  } else if (request.target === 'background' && request.type === 'capture-ended') {
    // User ended the share via Chrome's native "Stop sharing" bar.
    if (isRecording) handleStopRecording();
    return false;
  } else if (request.target === 'background' && request.type === 'auth-sync') {
    chrome.storage.local.set({ 
      reportr_session: request.data.session,
      reportr_origin: request.data.origin || null
    });
    return false;
  }
  
  // --- Screenshot Captures Listeners ---
  else if (request.action === 'startCapture') {
    handleScreenshotCapture(request.captureType, request.workspaceId);
    return false;
  } else if (request.action === 'selectionDone') {
    handleSelectionCompleted(request.box, activeWorkspaceId);
    return false;
  } else if (request.action === 'captureViewportChunk') {
    chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, { format: 'png' }, (dataUrl) => {
      sendResponse({ dataUrl });
    });
    return true; // Async response
  } else if (request.action === 'fullPageCaptured') {
    createAndUploadScreenshot(request.dataUrl, request.workspaceId);
    return false;
  }
  return false;
});

// Ask the offscreen document to start capturing. Resolves true only once the
// stream was actually acquired (getDisplayMedia/getUserMedia resolved), so a
// dismissed picker or denied permission doesn't leave us in a false REC state.
function startOffscreenRecording(streamId: string, source: 'tab' | 'desktop'): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { target: 'offscreen', type: 'start-recording', data: { streamId, source } },
      (res) => {
        if (chrome.runtime.lastError) { resolve(false); return; }
        resolve(!!(res && res.started));
      }
    );
  });
}

async function handleStartRecording(request: any, sendResponse: any) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    if (sendResponse) sendResponse({ status: 'error', message: 'No active tab found' });
    return;
  }

  activeRecordMode = request.recordMode || 'this-tab';
  recordingStartedAt = Date.now();
  activeWorkspaceId = request.workspaceId || null;
  recordedEvents = [];
  isPaused = false;
  totalPausedDuration = 0;
  pauseTimestamp = 0;

  // Setup offscreen document and wait for it to be ready BEFORE choosing media/stream!
  await setupOffscreenDocument('src/offscreen/offscreen.html');

  // Handshake loop to wait for offscreen script to be ready
  let ready = false;
  for (let i = 0; i < 15; i++) {
    const isReady = await new Promise<boolean>((resolve) => {
      chrome.runtime.sendMessage({ target: 'offscreen', type: 'ping' }, (res) => {
        if (chrome.runtime.lastError) {
          resolve(false);
        } else {
          resolve(res && res.ready);
        }
      });
    });
    if (isReady) {
      ready = true;
      break;
    }
    await new Promise(r => setTimeout(r, 100)); // wait 100ms
  }

  if (!ready) {
    console.error('[Reportr] Offscreen document handshake failed (timeout)');
    activeRecordMode = null;
    if (sendResponse) sendResponse({ status: 'error', message: 'Offscreen handshake timeout' });
    return;
  }

  if (activeRecordMode === 'desktop') {
    // Whole-screen / window / tab recording. The offscreen document calls
    // getDisplayMedia() itself and shows the browser's native picker — we do
    // NOT use chrome.desktopCapture, because its stream IDs cannot be consumed
    // inside an offscreen document.
    captureTabId = tab.id ?? null;
    const started = await startOffscreenRecording('', 'desktop');
    if (!started) {
      // Picker dismissed or capture denied — nothing is recording.
      captureTabId = null;
      activeRecordMode = null;
      if (sendResponse) sendResponse({ status: 'error', message: 'Screen capture was cancelled' });
      return;
    }

    chrome.tabs.sendMessage(tab.id!, { action: 'start', recordMode: 'desktop' }, () => {
      if (chrome.runtime.lastError) console.log('[Reportr] Content script not active');
    });

    isRecording = true;
    chrome.action.setBadgeText({ text: 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    if (sendResponse) sendResponse({ status: 'started' });
  } else {
    // Tab capture
    let streamId: string;
    try {
      streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id! });
    } catch (err: any) {
      console.error('[Reportr] tabCapture.getMediaStreamId failed:', err);
      activeRecordMode = null;
      if (sendResponse) sendResponse({ status: 'error', message: err.message });
      return;
    }

    captureTabId = tab.id;
    const started = await startOffscreenRecording(streamId, 'tab');
    if (!started) {
      captureTabId = null;
      activeRecordMode = null;
      if (sendResponse) sendResponse({ status: 'error', message: 'Tab capture failed to start' });
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'start', recordMode: 'this-tab' }, () => {
      if (chrome.runtime.lastError) console.log('[Reportr] Content script not active');
    });

    isRecording = true;
    if (sendResponse) sendResponse({ status: 'started' });
    chrome.action.setBadgeText({ text: 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  }
}

async function handleStopRecording() {
  isRecording = false;
  chrome.action.setBadgeText({ text: '' });

  const reportDataId = Date.now().toString();
  const draftKey = `report_draft_${reportDataId}`;

  // Store draft shell immediately and open review page
  await chrome.storage.local.set({
    [draftKey]: {
      status: 'uploading',
      events: recordedEvents,
      recordingStartedAt: recordingStartedAt || Date.now(),
      workspaceId: activeWorkspaceId
    }
  });

  const encodedId = encodeURIComponent(draftKey);
  const backendUrl = await getBackendUrl();
  chrome.tabs.create({ url: `${backendUrl}/reports/new?draftId=${encodedId}` });

  // Tell offscreen to stop and upload — it will call back with base64 + videoUrl
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop-recording', data: { draftKey } });

  // Send stop to all active/captured tabs
  const tabId = captureTabId;
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { action: 'stop' }, () => {
      if (chrome.runtime.lastError) {
        console.log('[Reportr] Could not stop recording in tab:', chrome.runtime.lastError.message);
      }
    });
  }

  // Fallback cleanup to other tabs
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((t) => {
      if (t.id && t.id !== tabId) {
        chrome.tabs.sendMessage(t.id, { action: 'stop' }, () => {
          if (chrome.runtime.lastError) { /* ignore */ }
        });
      }
    });
  });

  captureTabId = null;
  recordingStartedAt = null;
  activeWorkspaceId = null;
  activeRecordMode = null;
  isPaused = false;
  totalPausedDuration = 0;
  pauseTimestamp = 0;
  recordedEvents = [];
}

async function handleLocalVideoReady(draftKey: string, base64: string) {
  console.log('[Reportr][bg] video received from offscreen', { draftKey, length: base64?.length });
  const result = await chrome.storage.local.get([draftKey]);
  const draft = (result[draftKey] || {}) as any;
  // Store the base64 for instant local playback on the review page...
  await chrome.storage.local.set({ [draftKey]: { ...draft, localVideoBase64: base64 } });
  // ...then upload to R2 here in the service worker (offscreen docs can't use
  // chrome.storage / getBackendUrl, so the upload must happen in the background).
  uploadVideo(base64, draftKey, draft.workspaceId ?? null);
}

// Returns a currently-valid Supabase access token, refreshing it via the web
// app if the synced one has expired. Supabase access tokens last ~1h, so a
// static synced token 401s on any upload made long after the last dashboard
// visit. Requires refresh_token + expires_at (synced by AuthSync.tsx).
async function getValidAccessToken(): Promise<string | null> {
  const { reportr_session } = (await chrome.storage.local.get(['reportr_session'])) as any;
  if (!reportr_session) return null;

  const { access_token, refresh_token, expires_at } = reportr_session;
  const nowSec = Math.floor(Date.now() / 1000);

  // Expiry unknown (session synced by old code) — optimistically try it.
  if (access_token && !expires_at) return access_token;

  // Still valid (60s buffer) — use as-is.
  if (access_token && expires_at && expires_at - nowSec > 60) {
    return access_token;
  }

  // Expired. We can only recover with a refresh_token.
  if (!refresh_token) {
    console.warn('[Reportr][bg] session expired and no refresh_token — user must sign in again');
    return null;
  }

  try {
    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    });
    if (!res.ok) throw new Error(`refresh failed (${res.status})`);
    const data = await res.json();

    await chrome.storage.local.set({
      reportr_session: {
        ...reportr_session,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
      },
    });
    console.log('[Reportr][bg] access token refreshed');
    return data.access_token;
  } catch (err) {
    console.error('[Reportr][bg] token refresh failed:', err);
    return null;
  }
}

async function uploadVideo(base64Data: string, draftKey: string, workspaceId: string | null) {
  try {
    const resBlob = await fetch(base64Data);
    const blob = await resBlob.blob();

    const backendUrl = await getBackendUrl();
    const accessToken = await getValidAccessToken();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    console.log('[Reportr][bg] requesting upload URL', { draftKey, backendUrl, workspaceId, hasToken: !!accessToken });
    const uploadRes = await fetch(`${backendUrl}/api/upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filename: 'recording.webm',
        contentType: 'video/webm',
        workspaceId
      })
    });
    if (uploadRes.status === 401) { await markDraftAuthError(draftKey); return; }
    if (!uploadRes.ok) throw new Error(`Upload API failed (${uploadRes.status})`);
    const { uploadUrl, publicUrl } = await uploadRes.json();

    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/webm' },
      body: blob
    });

    console.log('[Reportr][bg] video uploaded', { draftKey, publicUrl });
    const result = await chrome.storage.local.get([draftKey]);
    const draft = result[draftKey] || {};
    await chrome.storage.local.set({ [draftKey]: { ...draft, status: 'ready', videoUrl: publicUrl } });
    try { await chrome.offscreen.closeDocument(); } catch (_) {}
  } catch (err: any) {
    console.error('[Reportr][bg] video upload failed:', err);
    markDraftError(draftKey, err.message);
  }
}

async function finishReportCreation(draftKey: string, videoUrl: string) {
  const result = await chrome.storage.local.get([draftKey]);
  const draft = result[draftKey] || {};
  await chrome.storage.local.set({ [draftKey]: { ...draft, status: 'ready', videoUrl } });
  try { await chrome.offscreen.closeDocument(); } catch (_) {}
}

async function markDraftError(draftKey: string, error: string) {
  const result = await chrome.storage.local.get([draftKey]);
  const draft = result[draftKey] || {};
  await chrome.storage.local.set({ [draftKey]: { ...draft, status: 'error', error } });
  try { await chrome.offscreen.closeDocument(); } catch (_) {}
}

// The recording succeeded but the user's session is no longer valid, so the
// upload was rejected. Flag it distinctly so the review page can offer sign-in
// (and, once signed in, we could retry) instead of a generic failure.
async function markDraftAuthError(draftKey: string) {
  console.warn('[Reportr][bg] upload rejected (401) — session invalid, sign-in required');
  const result = await chrome.storage.local.get([draftKey]);
  const draft = result[draftKey] || {};
  await chrome.storage.local.set({
    [draftKey]: {
      ...draft,
      status: 'error',
      authRequired: true,
      error: 'Your session has expired. Please sign in again to finish uploading.'
    }
  });
  try { await chrome.offscreen.closeDocument(); } catch (_) {}
}

// --- Screenshot Captures Core Orchestrator ---

async function handleScreenshotCapture(type: 'visible' | 'full' | 'selected', workspaceId: string | null) {
  activeWorkspaceId = workspaceId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  if (type === 'visible') {
    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, (dataUrl) => {
      if (dataUrl) {
        createAndUploadScreenshot(dataUrl, workspaceId);
      }
    });
  } else if (type === 'selected') {
    // Send message to initiate click-drag canvas
    chrome.tabs.sendMessage(tab.id!, { action: 'startSelection' }, () => {
      if (chrome.runtime.lastError) {
        alert('Please reload the page before using Selected Area Capture');
      }
    });
  } else if (type === 'full') {
    // Send message to initiate page scrolling capture
    chrome.tabs.sendMessage(tab.id!, { action: 'captureFullPage', workspaceId }, () => {
      if (chrome.runtime.lastError) {
        alert('Please reload the page before using Full Page Capture');
      }
    });
  }
}

async function handleSelectionCompleted(box: { x: number, y: number, w: number, h: number }, workspaceId: string | null) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, (dataUrl) => {
    if (!dataUrl) return;
    
    // Call content script to crop via canvas
    chrome.tabs.sendMessage(tab.id!, { action: 'cropImage', dataUrl, box }, (response: any) => {
      if (response && response.croppedDataUrl) {
        createAndUploadScreenshot(response.croppedDataUrl, workspaceId);
      }
    });
  });
}

async function createAndUploadScreenshot(dataUrl: string, workspaceId: string | null) {
  const reportDataId = Date.now().toString();
  const draftKey = `report_draft_${reportDataId}`;

  // Store draft shell and load immediately in tab
  await chrome.storage.local.set({
    [draftKey]: {
      status: 'uploading',
      events: [],
      recordingStartedAt: Date.now(),
      workspaceId: workspaceId,
      localVideoBase64: dataUrl
    }
  });

  const encodedId = encodeURIComponent(draftKey);
  const backendUrl = await getBackendUrl();
  chrome.tabs.create({ url: `${backendUrl}/reports/new?draftId=${encodedId}` });

  // Upload screenshot file in background
  uploadScreenshot(dataUrl, draftKey, workspaceId);
}

async function uploadScreenshot(base64Data: string, draftKey: string, workspaceId: string | null) {
  try {
    const resBlob = await fetch(base64Data);
    const blob = await resBlob.blob();

    const backendUrl = await getBackendUrl();
    const accessToken = await getValidAccessToken();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const uploadRes = await fetch(`${backendUrl}/api/upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filename: 'screenshot.png',
        contentType: 'image/png',
        workspaceId
      })
    });

    if (uploadRes.status === 401) { await markDraftAuthError(draftKey); return; }
    if (!uploadRes.ok) throw new Error('Upload API failed');
    const { uploadUrl, publicUrl } = await uploadRes.json();

    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: blob
    });

    // Mark as ready
    const result = await chrome.storage.local.get([draftKey]);
    const draft = result[draftKey] || {};
    await chrome.storage.local.set({ [draftKey]: { ...draft, status: 'ready', videoUrl: publicUrl } });
  } catch (err: any) {
    console.error('[Reportr] Screenshot upload failed:', err);
    const result = await chrome.storage.local.get([draftKey]);
    const draft = result[draftKey] || {};
    await chrome.storage.local.set({ [draftKey]: { ...draft, status: 'error', error: err.message } });
  }
}
