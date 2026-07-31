/**
 * Client-side helpers for report media: uploading a local capture to R2 at
 * save-time (uploads are deferred from capture until the user keeps the report),
 * and copying/downloading stored files without tripping over cross-origin R2.
 */

export interface UploadProgress {
  /** Bytes sent so far. */
  loaded: number
  /** Total bytes to send. */
  total: number
  /** 0–100, rounded. */
  percent: number
  /** Rolling average upload speed in bytes/second. */
  bytesPerSecond: number
}

type ProgressCallback = (p: UploadProgress) => void

/**
 * Send a blob with XMLHttpRequest so we can report upload progress — the Fetch
 * API has no upload-progress events, so a percentage bar isn't possible with it.
 * Resolves with the raw status + response text; the caller interprets them.
 */
function xhrSend(opts: {
  method: 'PUT' | 'POST'
  url: string
  body: Blob
  headers?: Record<string, string>
  onProgress?: ProgressCallback
}): Promise<{ status: number; responseText: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(opts.method, opts.url)
    for (const [k, v] of Object.entries(opts.headers || {})) xhr.setRequestHeader(k, v)

    const startedAt = Date.now()
    xhr.upload.onprogress = (e) => {
      if (!opts.onProgress || !e.lengthComputable) return
      const elapsedSec = (Date.now() - startedAt) / 1000
      opts.onProgress({
        loaded: e.loaded,
        total: e.total,
        percent: e.total > 0 ? Math.round((e.loaded / e.total) * 100) : 0,
        bytesPerSecond: elapsedSec > 0 ? e.loaded / elapsedSec : 0,
      })
    }
    xhr.onload = () => resolve({ status: xhr.status, responseText: xhr.responseText })
    xhr.onerror = () => reject(new TypeError('Network request failed'))
    xhr.ontimeout = () => reject(new TypeError('Upload timed out'))
    xhr.send(opts.body)
  })
}

/**
 * Upload a blob to storage. Fast path: ask the server for a presigned PUT URL and
 * send the bytes straight to R2, so the file travels the wire once instead of
 * twice (browser→R2 vs. browser→server→R2) and never buffers in server memory.
 *
 * The direct PUT is cross-origin and needs the bucket's CORS policy to allow PUT
 * (see the Settings setup guide). If it fails for any reason — CORS not yet
 * configured, network hiccup, signature mismatch — we fall back to the /api/store
 * proxy, which routes the bytes through our own server and needs no bucket CORS.
 * So uploads keep working even on buckets that haven't been updated.
 *
 * `onProgress` fires with byte/percent/speed as the upload streams.
 */
export async function uploadToStorage(
  blob: Blob,
  filename: string,
  contentType: string,
  workspaceId?: string,
  onProgress?: ProgressCallback
): Promise<string> {
  // 1. Mint a presigned PUT URL.
  const presign = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, contentType, workspaceId }),
  })
  if (presign.status === 401) throw new Error('Please sign in to your dashboard before saving.')

  if (presign.ok) {
    const { uploadUrl, publicUrl } = await presign.json()
    try {
      // 2. Upload the bytes straight to R2. Content-Type must match what the URL
      // was signed with (see /api/upload).
      const put = await xhrSend({
        method: 'PUT',
        url: uploadUrl,
        body: blob,
        headers: { 'Content-Type': contentType },
        onProgress,
      })
      if (put.status >= 200 && put.status < 300) return publicUrl
      console.warn(`[reportr] Direct R2 upload failed (${put.status}); falling back to server proxy.`)
    } catch (err) {
      // A CORS/network failure on the cross-origin PUT throws here.
      console.warn('[reportr] Direct R2 upload errored; falling back to server proxy.', err)
    }
  }

  // 3. Fallback: proxy the bytes through our own server (no bucket CORS needed).
  return uploadViaProxy(blob, filename, contentType, workspaceId, onProgress)
}

/** Upload through /api/store — the server relays the bytes to R2 (no CORS). */
async function uploadViaProxy(
  blob: Blob,
  filename: string,
  contentType: string,
  workspaceId?: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const params = new URLSearchParams({ filename, contentType })
  if (workspaceId) params.set('workspaceId', workspaceId)
  const { status, responseText } = await xhrSend({
    method: 'POST',
    url: `/api/store?${params.toString()}`,
    body: blob,
    headers: { 'Content-Type': contentType },
    onProgress,
  })
  if (status === 401) throw new Error('Please sign in to your dashboard before saving.')
  if (status < 200 || status >= 300) {
    let detail = ''
    try {
      detail = JSON.parse(responseText)?.error || ''
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Upload failed (${status})`)
  }
  return JSON.parse(responseText).publicUrl
}

/** Format a bytes/second rate as a short human string, e.g. "1.2 MB/s". */
export function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond < 1) return ''
  const mb = bytesPerSecond / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`
  return `${Math.round(bytesPerSecond / 1024)} KB/s`
}

/** Turn a data: URL (local capture) into a Blob. */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob()
}

/** Same-origin proxy URL for a stored (cross-origin) R2 file. */
export function proxyUrl(url: string, opts?: { download?: string }): string {
  const params = new URLSearchParams({ url })
  if (opts?.download) {
    params.set('download', '1')
    params.set('filename', opts.download)
  }
  return `/api/file?${params.toString()}`
}

/** Trigger a browser download for a blob or (data/blob/http) URL. */
export function triggerDownload(href: string, filename: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Normalize any image blob to PNG so it can go on the clipboard reliably. */
export async function toPngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context failed')
  ctx.drawImage(bitmap, 0, 0)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/png')
  )
}

/** Copy an image blob to the clipboard as PNG. */
export async function copyImageBlob(blob: Blob): Promise<void> {
  const png = await toPngBlob(blob)
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
}
