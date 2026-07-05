let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let currentDraftKey: string | null = null;
// The recorded blob, held until we also have a draft key. Native "Stop sharing"
// makes the recorder stop (and onstop fire) BEFORE the background assigns a
// draft key, so the two arrive in either order — we finalize once both exist.
let pendingBlob: Blob | null = null;
let finalizing = false;

chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: any) => {
  if (message.target !== 'offscreen') return false;
  if (message.type === 'ping') {
    sendResponse({ ready: true });
    return false;
  }
  if (message.type === 'start-recording') {
    startRecording(message.data.streamId, message.data.source || 'tab')
      .then(() => sendResponse({ started: true }))
      .catch((err: any) => {
        // e.g. user dismissed the getDisplayMedia picker, or capture was denied.
        console.error('[Reportr] startRecording error:', err);
        sendResponse({ started: false, error: err?.message });
      });
    return true; // async response — keep the channel open
  } else if (message.type === 'stop-recording') {
    currentDraftKey = message.data?.draftKey ?? null;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      // Still recording — stop it; onstop buffers the blob and finalizes.
      stopRecording();
    } else if (pendingBlob) {
      // Recorder already stopped itself (native "Stop sharing"). We have the
      // blob and now the draft key — finalize the upload.
      finalizeRecording();
    } else {
      // Capture never started (e.g. permission denied / picker dismissed).
      // onstop will never fire, so surface an error now with the draft key —
      // otherwise the review page hangs forever on "processing".
      chrome.runtime.sendMessage({
        target: 'background',
        type: 'recording-error',
        data: { draftKey: currentDraftKey, error: 'Recording failed to start — no media was captured.' }
      });
    }
    sendResponse({ stopped: true });
  } else if (message.type === 'pause-recording') {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.pause();
    }
    sendResponse({ paused: true });
  } else if (message.type === 'resume-recording') {
    if (mediaRecorder && mediaRecorder.state === 'paused') {
      mediaRecorder.resume();
    }
    sendResponse({ resumed: true });
  }
  return true;
});

async function startRecording(streamId: string, source: string) {
  if (mediaRecorder) stopRecording();

  // Desktop/whole-screen capture must use getDisplayMedia() here in the
  // offscreen document (created with the DISPLAY_MEDIA reason). chrome.desktop-
  // Capture stream IDs cannot be consumed inside an offscreen document, so the
  // old chooseDesktopMedia → getUserMedia path could never produce a stream.
  // Tab capture still uses the tabCapture stream ID via getUserMedia.
  console.log('[Reportr][offscreen] startRecording', { source, hasStreamId: !!streamId });
  let mediaStream: MediaStream;
  if (source === 'desktop') {
    mediaStream = await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: { displaySurface: 'monitor' }
    });
  } else {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: { chromeMediaSource: source, chromeMediaSourceId: streamId }
      } as any
    });
  }
  console.log('[Reportr][offscreen] got media stream', { tracks: mediaStream.getVideoTracks().length });

  {
    recordedChunks = [];
    pendingBlob = null;
    finalizing = false;
    currentDraftKey = null;
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'video/webm' });

    // If the user ends the share via Chrome's native "Stop sharing" bar, the
    // track fires 'ended'. Tell the background so it runs the normal stop flow
    // (creates the draft, opens the review page, then asks us to stop & upload).
    mediaStream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        console.log('[Reportr][offscreen] track ended (native Stop sharing)');
        chrome.runtime.sendMessage({ target: 'background', type: 'capture-ended' });
      });
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
      pendingBlob = new Blob(recordedChunks, { type: 'video/webm' });
      console.log('[Reportr][offscreen] recorder stopped', { chunks: recordedChunks.length, size: pendingBlob.size });
      mediaStream.getTracks().forEach(t => t.stop());
      // Finalize now if the draft key is already known; otherwise the
      // stop-recording message will call finalizeRecording() once it arrives.
      finalizeRecording();
    };

    mediaRecorder.start();
  }
}

// Hands the recorded blob to the background, but only once BOTH the blob and a
// draft key exist. Safe to call multiple times (from onstop and/or the
// stop-recording message) — the `finalizing` guard runs the work exactly once.
//
// IMPORTANT: offscreen documents can ONLY use the chrome.runtime API — NOT
// chrome.storage, and getBackendUrl() reads chrome.storage. So all storage
// access and the R2 upload happen in the background service worker; here we
// just base64-encode the blob and send it over runtime messaging.
async function finalizeRecording() {
  if (finalizing || !pendingBlob || !currentDraftKey) return;
  finalizing = true;

  const blob = pendingBlob;
  const draftKey = currentDraftKey;
  pendingBlob = null;

  console.log('[Reportr][offscreen] finalizing recording', { draftKey, blobSize: blob.size });

  try {
    const base64 = await blobToBase64(blob);
    console.log('[Reportr][offscreen] base64 ready, sending to background', { length: base64.length });
    chrome.runtime.sendMessage({
      target: 'background',
      type: 'video-local-ready',
      data: { draftKey, base64 }
    });
  } catch (err: any) {
    console.error('[Reportr][offscreen] finalize failed:', err);
    chrome.runtime.sendMessage({
      target: 'background',
      type: 'recording-error',
      data: { draftKey, error: err?.message || 'Failed to process recording' }
    });
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string); // "data:video/webm;base64,..."
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
