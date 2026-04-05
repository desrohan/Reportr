// Recording state
let isRecording = false;
let captureTabId: number | null = null;
let recordingStartedAt: number | null = null;
let currentRrwebEvents: any[] = [];

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
  } else if (request.target === 'background' && request.type === 'video-local-ready') {
    handleLocalVideoReady(request.data.draftKey, request.data.base64);
    return false;
  } else if (request.target === 'background' && request.type === 'recording-finished') {
    finishReportCreation(request.data.draftKey, request.data.videoUrl);
    return false;
  } else if (request.target === 'background' && request.type === 'recording-error') {
    console.error('[Reportr] Offscreen error:', request.data.error);
    return false;
  }
  return false;
});

async function handleStartRecording(_request: any, sendResponse: any) {
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

  // Store these so handleStopRecording can use the ORIGINAL tab, not whatever is active at stop time
  captureTabId = tab.id;
  recordingStartedAt = Date.now();

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

  // Create draft shell immediately and open review page — don't wait for the upload
  await chrome.storage.local.set({
    [draftKey]: { status: 'uploading', events: [], recordingStartedAt }
  });
  const encodedId = encodeURIComponent(draftKey);
  chrome.tabs.create({ url: `http://localhost:3000/reports/new?draftId=${encodedId}` });

  // Send stop to the CAPTURED tab (not the active tab, which is now the review page)
  const tabId = captureTabId;
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { action: 'stop' }, (response: any) => {
      if (chrome.runtime.lastError) {
        console.log('[Reportr] Could not collect rrweb events:', chrome.runtime.lastError.message);
        return;
      }
      if (response?.data) {
        currentRrwebEvents = response.data;
        chrome.storage.local.get([draftKey], (result) => {
          const draft = result[draftKey] || {};
          chrome.storage.local.set({ [draftKey]: { ...draft, events: currentRrwebEvents } });
        });
      }
    });
  }

  // Tell offscreen to stop and upload — it will call back with base64 + videoUrl
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop-recording', data: { draftKey } });

  captureTabId = null;
  recordingStartedAt = null;
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
  currentRrwebEvents = [];
}
