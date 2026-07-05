export const DEFAULT_BACKEND_URL = import.meta.env.DEV
  ? 'http://localhost:3000'
  : 'https://reportr.tools.rohan-shah.in';

export async function getBackendUrl(): Promise<string> {
  const result = (await chrome.storage.local.get(['reportr_origin'])) as any;
  return result.reportr_origin || DEFAULT_BACKEND_URL;
}
