// Listens for postMessage events from the Reportr web dashboard
window.addEventListener('message', (event) => {
  // Only accept messages from the same origin to be safe
  if (event.source !== window) return;

  if (event.data && event.data.type === 'REPORTR_AUTH_SYNC') {
    const session = event.data.session;
    if (session && session.access_token) {
      // Send it securely to our background script to save in extension storage
      chrome.runtime.sendMessage({
        target: 'background',
        type: 'auth-sync',
        data: { session }
      }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[Reportr AuthSync] Extension background not receiving:', chrome.runtime.lastError.message);
        } else {
          console.log('[Reportr AuthSync] Session synced to extension successfully.');
        }
      });
    }
  }
});
