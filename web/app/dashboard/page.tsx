import { createClient } from '../../utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { DashboardClient } from './DashboardClient'
import { fetchPaginatedReports } from './actions'

interface PageProps {
  searchParams: Promise<{ workspace_id?: string }>
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const resolvedParams = await searchParams
  let activeWorkspaceId = resolvedParams.workspace_id

  // Fallback if no workspace_id provided in query
  if (!activeWorkspaceId) {
    const { data: userWorkspaces } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    if (userWorkspaces) {
      activeWorkspaceId = userWorkspaces.workspace_id
    }
  }

  if (!activeWorkspaceId) {
    redirect('/onboarding')
  }

  const PAGE_SIZE = 12

  // Fetch first page of reports using the server action
  const { reports: initialReports, hasMore: hasMoreInitial } = await fetchPaginatedReports({
    workspaceId: activeWorkspaceId,
    page: 1,
    pageSize: PAGE_SIZE,
  })

  // Fetch workspace members for the uploader dropdown
  const { data: members } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', activeWorkspaceId)

  const memberIds = new Set((members || []).map((m: any) => m.user_id))

  // Fetch user profiles using service role client to retrieve email, full_name, and avatar_url
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

  // Filter users to only show members of this workspace
  const workspaceMembers = authUsers
    .filter((u: any) => memberIds.has(u.id))
    .map((u: any) => ({
      id: u.id,
      name: u.user_metadata?.full_name || u.email?.split('@')[0] || 'Anonymous',
      avatarUrl: u.user_metadata?.avatar_url || null,
      email: u.email || ''
    }))

  return (
    <DashboardClient 
      initialReports={initialReports} 
      hasMoreInitial={hasMoreInitial}
      currentUserId={user.id} 
      workspaceId={activeWorkspaceId}
      workspaceMembers={workspaceMembers}
    />
  )
}
