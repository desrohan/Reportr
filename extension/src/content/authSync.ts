// Origins we trust to hand us a session. Without this gate, ANY page the user
// visits could postMessage a forged REPORTR_AUTH_SYNC and inject a session into
// the extension. Only the real Reportr dashboard (prod + local dev) is allowed.
const ALLOWED_ORIGINS = new Set([
  'https://reportr.tools.rohan-shah.in',
  'http://localhost:3000',
]);

// Listens for postMessage events from the Reportr web dashboard
window.addEventListener('message', (event) => {
  // Must originate from this same window/frame AND from a trusted dashboard
  // origin. event.source guards against cross-frame injection; event.origin
  // guards against a malicious page spoofing the sync message.
  if (event.source !== window) return;
  if (!ALLOWED_ORIGINS.has(event.origin)) return;

  if (event.data && event.data.type === 'REPORTR_AUTH_SYNC') {
    const session = event.data.session;
    if (session && session.access_token) {
      // Send it securely to our background script to save in extension storage
      chrome.runtime.sendMessage({
        target: 'background',
        type: 'auth-sync',
        data: { session, origin: window.location.origin }
      }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[Reportr AuthSync] Extension background not receiving:', chrome.runtime.lastError.message);
        } else {
          console.log('[Reportr AuthSync] Session synced to extension successfully.');
        }
      });
    } else if (session === null) {
      // User is logged out, clear extension session
      chrome.runtime.sendMessage({
        target: 'background',
        type: 'auth-sync',
        data: { session: null }
      }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[Reportr AuthSync] Failed to sync signout:', chrome.runtime.lastError.message);
        } else {
          console.log('[Reportr AuthSync] Signout synced to extension successfully.');
        }
      });
    }
  }
});
