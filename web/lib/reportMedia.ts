/**
 * Client-side helpers for report media: uploading a local capture to R2 at
 * save-time (uploads are deferred from capture until the user keeps the report),
 * and copying/downloading stored files without tripping over cross-origin R2.
 */

/**
 * Upload a blob to storage through our own server (/api/store). We deliberately
 * do NOT upload straight to R2 from the browser: that PUT triggers a CORS
 * preflight R2 buckets don't answer. Routing through the server sidesteps CORS
 * entirely and works with any R2 token.
 */
export async function uploadToStorage(
  blob: Blob,
  filename: string,
  contentType: string,
  workspaceId?: string
): Promise<string> {
  const params = new URLSearchParams({ filename, contentType })
  if (workspaceId) params.set('workspaceId', workspaceId)
  const res = await fetch(`/api/store?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: blob,
  })
  if (res.status === 401) throw new Error('Please sign in to your dashboard before saving.')
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.json())?.error || ''
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Upload failed (${res.status})`)
  }
  const { publicUrl } = await res.json()
  return publicUrl
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
