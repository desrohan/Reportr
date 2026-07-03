// Recording state
let isRecording = false;
let captureTabId: number | null = null;
let recordedEvents: any[] = [];
let recordingStartedAt: number | null = null;
let activeWorkspaceId: string | null = null;

async function setupOffscreenDocument(path: string) {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existingContexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: path,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Recording active browser tab',
  });
}

chrome.runtime.onMessage.addListener((request: any, _sender: any, sendResponse: any) => {
  if (request.action === 'getStatus') {
    sendResponse({ isRecording });
    return false;
  } else if (request.action === 'startRecording') {
    handleStartRecording(request, sendResponse);
    return true; // Indicate async response
  } else if (request.action === 'stopRecording') {
    handleStopRecording();
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
    return false;
  } else if (request.target === 'background' && request.type === 'auth-sync') {
    // Store the synced session from the web dashboard
    chrome.storage.local.set({ reportr_session: request.data.session });
    return false;
  }
  return false;
});

async function handleStartRecording(request: any, sendResponse: any) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    if (sendResponse) sendResponse({ status: 'error', message: 'No active tab found' });
    return;
  }

  let streamId: string;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  } catch (err: any) {
    console.error('[Reportr] tabCapture.getMediaStreamId failed:', err);
    if (sendResponse) sendResponse({ status: 'error', message: err.message });
    return;
  }

  captureTabId = tab.id;
  recordingStartedAt = Date.now();
  activeWorkspaceId = request.workspaceId || null;
  recordedEvents = []; // Reset events for the new session

  await setupOffscreenDocument('src/offscreen/offscreen.html');
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'start-recording', data: { streamId } });
  chrome.tabs.sendMessage(tab.id, { action: 'start' }, () => {
    if (chrome.runtime.lastError) console.log('[Reportr] Content script not active');
  });

  isRecording = true;
  sendResponse({ status: 'started' });
  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
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
  chrome.tabs.create({ url: `http://localhost:3000/reports/new?draftId=${encodedId}` });

  // Tell offscreen to stop and upload — it will call back with base64 + videoUrl
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop-recording', data: { draftKey } });

  // Send stop to the CAPTURED tab (so it stops rrweb recording)
  const tabId = captureTabId;
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { action: 'stop' }, () => {
      if (chrome.runtime.lastError) {
        console.log('[Reportr] Could not stop recording in tab:', chrome.runtime.lastError.message);
      }
    });
  }

  captureTabId = null;
  recordingStartedAt = null;
  activeWorkspaceId = null;
  // Note: we don't clear recordedEvents immediately here because finishReportCreation/localVideoReady still needs
  // reference if they are modifying the same draft, but actually we store the draft in chrome.storage above,
  // so we can clear recordedEvents now safely.
  recordedEvents = [];
}

async function handleLocalVideoReady(draftKey: string, base64: string) {
  // Store local base64 so the review page can play video immediately, before R2 upload finishes
  const result = await chrome.storage.local.get([draftKey]);
  const draft = result[draftKey] || {};
  await chrome.storage.local.set({ [draftKey]: { ...draft, localVideoBase64: base64 } });
}

async function finishReportCreation(draftKey: string, videoUrl: string) {
  const result = await chrome.storage.local.get([draftKey]);
  const draft = result[draftKey] || {};
  await chrome.storage.local.set({ [draftKey]: { ...draft, status: 'ready', videoUrl } });
  try { await chrome.offscreen.closeDocument(); } catch (_) {}
}
