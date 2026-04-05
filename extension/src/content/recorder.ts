import * as rrweb from 'rrweb';

let events: any[] = [];
let stopRecording: any = null;

function startRecording() {
  events = [];
  stopRecording = rrweb.record({
    emit(event) {
      events.push(event);
    }
  });
  console.log('[Reportr] Started recording interactions and DOM changes.');
}

// Messages from background (start/stop rrweb)
chrome.runtime.onMessage.addListener((request: any, _sender: any, sendResponse: any) => {
  if (request.action === 'start') {
    startRecording();
    sendResponse({ status: 'started' });
  } else if (request.action === 'stop') {
    if (stopRecording) stopRecording();
    stopRecording = null;
    sendResponse({ status: 'stopped', data: events });
  } else if (request.action === 'ping') {
    sendResponse({ status: 'ready' });
  }
});

// Intercept network/console events from the MAIN world monkeypatch, and act as a bridge for draft storage
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || !event.data.type) return;

  const type = event.data.type;

  // Handle recorded events from MAIN world
  if (type === 'reportr_network' || type === 'reportr_console' || type === 'reportr_click') {
    if (!stopRecording) return;
    events.push({
      type: 6,
      data: { plugin: type.replace('reportr_', ''), payload: event.data.detail },
      timestamp: Date.now()
    });
    return;
  }

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
  }
});
