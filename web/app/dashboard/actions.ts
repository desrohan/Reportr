'use server'

import { createClient } from '../../utils/supabase/server'
import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import type { User } from '@supabase/supabase-js'

export async function regenerateInviteCode(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  // Verify they are the owner of the workspace
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!member || member.role !== 'owner') {
    throw new Error('Only workspace owners can regenerate the invite code.')
  }

  // Generate new code
  const newCode = randomBytes(4).toString('hex')

  const { error } = await supabase
    .from('workspaces')
    .update({ invite_code: newCode })
    .eq('id', workspaceId)

  if (error) {
    console.error('Failed to regenerate invite code:', error)
    throw new Error('Failed to regenerate invite code.')
  }

  revalidatePath('/dashboard')
  return newCode
}

export async function fetchPaginatedReports(params: {
  workspaceId: string
  page: number
  pageSize: number
  searchQuery?: string
  ownerFilter?: string
  startDate?: string
  endDate?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Verify they are a member of the workspace
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', params.workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member) {
    throw new Error('Not a member of this workspace')
  }

  // Calculate range
  const from = (params.page - 1) * params.pageSize
  const to = from + params.pageSize - 1

  // Start building query
  let query = supabase
    .from('reports')
    .select('*')
    .eq('workspace_id', params.workspaceId)

  // 1. Search filter
  if (params.searchQuery) {
    query = query.ilike('title', `%${params.searchQuery}%`)
  }

  // 2. Owner filter
  if (params.ownerFilter === 'me') {
    query = query.eq('created_by', user.id)
  } else if (params.ownerFilter && params.ownerFilter !== 'all') {
    query = query.eq('created_by', params.ownerFilter)
  }

  // 3. Date filters
  if (params.startDate) {
    const start = new Date(params.startDate)
    start.setHours(0, 0, 0, 0)
    query = query.gte('created_at', start.toISOString())
  }
  if (params.endDate) {
    const end = new Date(params.endDate)
    end.setHours(23, 59, 59, 999)
    query = query.lte('created_at', end.toISOString())
  }

  // 4. Ordering and Pagination
  const { data: reports, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('Failed to fetch paginated reports:', error)
    throw new Error('Failed to fetch reports')
  }

  // Fetch uploader profile metadata using the service role client on the server
  const { createClient: createAdminClient } = await import('@supabase/supabase-js')
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )

  const { data: usersData } = await adminSupabase.auth.admin.listUsers()
  const authUsers = usersData?.users || []

  const usersMap = new Map()
  authUsers.forEach((u: User) => {
    usersMap.set(u.id, {
      id: u.id,
      name: u.user_metadata?.full_name || u.email?.split('@')[0] || 'Anonymous',
      avatarUrl: u.user_metadata?.avatar_url || null,
      email: u.email || ''
    })
  })

  // Map uploader details to each report
  const reportsWithUploader = (reports || []).map((r) => ({
    ...r,
    uploader: usersMap.get(r.created_by) || {
      id: r.created_by,
      name: 'Unknown User',
      avatarUrl: null,
      email: ''
    }
  }))

  return {
    reports: reportsWithUploader,
    hasMore: reportsWithUploader.length === params.pageSize
  }
}

