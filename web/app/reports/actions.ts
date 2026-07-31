'use server'

import { createClient } from '../../utils/supabase/server'

// Postgres jsonb/text cannot store the NUL character (U+0000). Captured network
// response bodies occasionally contain one, which made the ENTIRE 100-event
// insert chunk fail with error 22P05 ("\u0000 cannot be converted to text") and
// silently drop that slice of the session replay. Strip NUL from every string in
// the event before insert. Done here (not just in the extension) so it covers
// all sources — rrweb DOM snapshots, console output, etc. — and every extension
// version, since this server path is the single point that touches the DB.
function stripNullBytes(value: any): any {
  if (typeof value === 'string') return value.replace(/\u0000/g, '')
  if (Array.isArray(value)) return value.map(stripNullBytes)
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const key in value) out[key] = stripNullBytes(value[key])
    return out
  }
  return value
}

export async function saveReport(data: {
  workspaceId: string;
  title: string;
  videoUrl: string;
  thumbnailUrl?: string;
  events: any[];
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
    const eventRows = data.events.map((e: any) => ({
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
