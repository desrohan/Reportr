'use server'

import { createClient } from '../../utils/supabase/server'
import { DeleteObjectsCommand } from '@aws-sdk/client-s3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveR2Config, r2Client } from '../../utils/r2'

// Postgres jsonb/text cannot store the NUL character (U+0000). Captured network
// response bodies occasionally contain one, which made the ENTIRE 100-event
// insert chunk fail with error 22P05 ("\u0000 cannot be converted to text") and
// silently drop that slice of the session replay. Strip NUL from every string in
// the event before insert. Done here (not just in the extension) so it covers
// all sources — rrweb DOM snapshots, console output, etc. — and every extension
// version, since this server path is the single point that touches the DB.
function stripNullBytes(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\u0000/g, '')
  if (Array.isArray(value)) return value.map(stripNullBytes)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key in value) out[key] = stripNullBytes((value as Record<string, unknown>)[key])
    return out
  }
  return value
}

// Events captured by the extension (rrweb session replay + plugin events).
interface ReportEventInput {
  type: number
  timestamp?: number
  data?: { plugin?: string; payload?: unknown; href?: string }
}

export async function saveReport(data: {
  workspaceId: string;
  title: string;
  videoUrl: string;
  thumbnailUrl?: string;
  events: ReportEventInput[];
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  // Insert the report
  const { data: report, error: reportError } = await supabase
    .from('reports')
    .insert({
      workspace_id: data.workspaceId,
      created_by: user.id,
      title: data.title || 'Untitled Recording',
      video_url: data.videoUrl,
      thumbnail_url: data.thumbnailUrl || null,
      status: 'ready'
    })
    .select('id')
    .single()

  if (reportError || !report) {
    console.error('Failed to create report:', reportError)
    throw new Error(reportError?.message || 'Failed to create report')
  }

  // Batch insert events
  if (data.events && data.events.length > 0) {
    const eventRows = data.events.map((e) => ({
      report_id: report.id,
      timestamp_ms: e.timestamp || Date.now(),
      type: e.type === 4 ? 'navigate' : (e.data?.plugin || 'unknown'),
      data: stripNullBytes(e)
    }))

    // Split eventRows into chunks of 100 to avoid request body size limitations or parameter count limits
    const chunkSize = 100
    for (let i = 0; i < eventRows.length; i += chunkSize) {
      const chunk = eventRows.slice(i, i + chunkSize)
      const { error: eventsError } = await supabase
        .from('report_events')
        .insert(chunk)

      if (eventsError) {
        console.error('Failed to save report events chunk:', eventsError)
      }
    }
  }

  return report.id
}

export async function updateReportTitle(reportId: string, title: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const trimmed = title.trim()
  if (!trimmed) {
    throw new Error('Title cannot be empty')
  }

  // Only the creator may rename; the created_by filter makes a non-owner's
  // update match zero rows, which we surface as an error.
  const { data, error } = await supabase
    .from('reports')
    .update({ title: trimmed })
    .eq('id', reportId)
    .eq('created_by', user.id)
    .select('id')

  if (error) {
    console.error('Failed to rename report:', error)
    throw new Error(error.message || 'Failed to rename report')
  }
  if (!data || data.length === 0) {
    throw new Error('Report not found or you are not its creator')
  }
}

export async function deleteReport(reportId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  // Fetch the media URLs up front so the files can be removed from R2 after
  // the row is gone.
  const { data: report } = await supabase
    .from('reports')
    .select('id, video_url, thumbnail_url, workspace_id')
    .eq('id', reportId)
    .eq('created_by', user.id)
    .maybeSingle()

  if (!report) {
    throw new Error('Report not found or you are not its creator')
  }

  // Only the creator may delete; report_events cascade via the FK.
  const { error } = await supabase
    .from('reports')
    .delete()
    .eq('id', reportId)
    .eq('created_by', user.id)

  if (error) {
    console.error('Failed to delete report:', error)
    throw new Error(error.message || 'Failed to delete report')
  }

  await deleteReportMedia(supabase, user.id, report)
}

// All stored media lives under the `reports/` key prefix, so the object key
// can be recovered from any of our public-URL shapes (custom domain with or
// without bucket segment, or the raw R2 endpoint).
function keyFromPublicUrl(url: string | null): string | null {
  if (!url) return null
  const idx = url.indexOf('/reports/')
  if (idx === -1) return null
  return decodeURIComponent(url.slice(idx + 1).split('?')[0])
}

// Best-effort R2 cleanup: the DB row is already gone, so a failure here only
// leaves an orphaned object — log it, don't fail the delete. Uses the
// creator's current R2 settings; if those changed since the upload, the old
// object can't be located and is left behind.
async function deleteReportMedia(
  supabase: SupabaseClient,
  userId: string,
  report: { video_url: string | null; thumbnail_url: string | null; workspace_id: string }
) {
  try {
    const keys = [report.video_url, report.thumbnail_url]
      .map(keyFromPublicUrl)
      .filter((k): k is string => !!k)
    if (keys.length === 0) return

    const cfg = await resolveR2Config(supabase, userId, report.workspace_id)
    if (!cfg.endpoint || !cfg.accessKeyId || !cfg.secretAccessKey) return

    await r2Client(cfg).send(
      new DeleteObjectsCommand({
        Bucket: cfg.bucketName,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      })
    )
  } catch (err) {
    console.error('Failed to delete report media from R2:', err)
  }
}
