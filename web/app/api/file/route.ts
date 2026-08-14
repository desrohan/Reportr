import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '../../../utils/supabase/server'

/**
 * Same-origin proxy for stored report media (R2). The browser refuses to
 * download or read cross-origin R2 URLs (no CORS headers, so `download` opens a
 * tab and `fetch` throws), so the viewer routes those through here:
 *
 *   GET /api/file?url=<r2-url>              → streams the bytes (for clipboard copy)
 *   GET /api/file?url=<r2-url>&download=1&filename=foo.webm → forces a download
 *
 * Only hosts we actually store media on are allowed, so this can't be used to
 * fetch arbitrary internal/external URLs (SSRF guard).
 */

function hostAllowed(host: string, extra: Set<string>): boolean {
  const h = host.toLowerCase()
  if (h.endsWith('.r2.dev')) return true
  if (h.endsWith('.r2.cloudflarestorage.com')) return true
  return extra.has(h)
}

function hostnameOf(value?: string | null): string | null {
  if (!value) return null
  try {
    const withProto = /^https?:\/\//i.test(value) ? value : `https://${value}`
    return new URL(withProto).hostname.toLowerCase()
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const target = searchParams.get('url')
  const wantsDownload = searchParams.get('download') === '1'
  const filename = searchParams.get('filename') || 'download'

  if (!target) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
  }
  if (parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only https urls are allowed' }, { status: 400 })
  }

  // Signed-in users may proxy media stored on their personal/workspace custom
  // domains in addition to the wildcard R2 hosts. Anonymous visitors (public
  // shared-report links) may proxy only the env/wildcard hosts — the R2 bucket
  // is public anyway; this route exists to force downloads and clipboard reads.
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Build the set of allowed hosts from configured public domains (in addition
  // to the Cloudflare wildcard hosts handled above).
  const allowed = new Set<string>()
  const envHost = hostnameOf(process.env.R2_PUBLIC_DOMAIN)
  if (envHost) allowed.add(envHost)

  if (user) {
    const { data: personal } = await supabase
      .from('user_r2_settings')
      .select('r2_public_domain')
      .eq('user_id', user.id)
      .maybeSingle()
    const personalHost = hostnameOf(personal?.r2_public_domain)
    if (personalHost) allowed.add(personalHost)

    const { data: memberships } = await supabase
      .from('workspace_members')
      .select('workspaces(r2_public_domain)')
      .eq('user_id', user.id)
    for (const m of memberships || []) {
      const ws = (m as any).workspaces
      const h = hostnameOf(ws?.r2_public_domain)
      if (h) allowed.add(h)
    }
  }

  if (!hostAllowed(parsed.hostname, allowed)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 })
  }

  let upstream: Response
  try {
    upstream = await fetch(parsed.toString(), { redirect: 'error' })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch file' }, { status: 502 })
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `Upstream error (${upstream.status})` }, { status: 502 })
  }

  const headers = new Headers()
  headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/octet-stream')
  const len = upstream.headers.get('Content-Length')
  if (len) headers.set('Content-Length', len)
  headers.set('Cache-Control', 'private, max-age=0, no-store')
  if (wantsDownload) {
    const safe = filename.replace(/["\\\r\n]/g, '')
    headers.set('Content-Disposition', `attachment; filename="${safe}"`)
  }

  // Stream the upstream body straight through — no buffering of large videos.
  return new Response(upstream.body, { status: 200, headers })
}
