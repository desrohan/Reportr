'use server'

import { createClient } from '../../utils/supabase/server'

export async function saveReport(data: {
  workspaceId: string;
  title: string;
  videoUrl: string;
  events: any[];
}) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Not authenticated')
  }

  // Insert the report
  const { data: report, error: reportError } = await supabase
    .from('reports')
    .insert({
      workspace_id: data.workspaceId,
      created_by: session.user.id,
      title: data.title || 'Untitled Recording',
      video_url: data.videoUrl,
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
      data: e
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
