let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let currentDraftKey: string | null = null;

chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: any) => {
  if (message.target !== 'offscreen') return false;
  if (message.type === 'start-recording') {
    startRecording(message.data.streamId);
    sendResponse({ started: true });
  } else if (message.type === 'stop-recording') {
    currentDraftKey = message.data?.draftKey ?? null;
    stopRecording();
    sendResponse({ stopped: true });
  }
  return true;
});

async function startRecording(streamId: string) {
  if (mediaRecorder) stopRecording();
  try {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId }
      } as any
    });

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'video/webm' });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      mediaStream.getTracks().forEach(t => t.stop());
      const draftKey = currentDraftKey;

      // Step 1: Convert blob to base64 data URL and send to background immediately
      // so the review page can play the video locally before R2 upload finishes
      try {
        const base64 = await blobToBase64(blob);
        chrome.runtime.sendMessage({
          target: 'background',
          type: 'video-local-ready',
          data: { draftKey, base64 }
        });
      } catch (err) {
        console.error('[Reportr] base64 conversion failed:', err);
      }

      // Step 2: Upload to R2 in the background
      const host = 'http://localhost:3000';
      try {
        const res = await fetch(`${host}/api/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: 'recording.webm', contentType: 'video/webm' })
        });
        const { uploadUrl, publicUrl } = await res.json();
        if (!res.ok) throw new Error('Upload API failed');

        await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'video/webm' },
          body: blob
        });

        chrome.runtime.sendMessage({
          target: 'background',
          type: 'recording-finished',
          data: { draftKey, videoUrl: publicUrl }
        });
      } catch (err: any) {
        console.error('[Reportr] Upload failed:', err);
        chrome.runtime.sendMessage({
          target: 'background',
          type: 'recording-error',
          data: { error: err.message }
        });
      }
    };

    mediaRecorder.start();
  } catch (err: any) {
    console.error('[Reportr] startRecording error:', err);
    chrome.runtime.sendMessage({
      target: 'background',
      type: 'recording-error',
      data: { error: err.message }
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
