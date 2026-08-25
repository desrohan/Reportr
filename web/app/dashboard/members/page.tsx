import { createClient } from '../../../utils/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

interface Member {
  member_id: string
  user_id: string
  email: string
  role: string
  joined_at: string
}

export default async function TeamMembersPage({
  searchParams
}: {
  searchParams: Promise<{ workspace_id?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const resolvedParams = await searchParams
  let activeWorkspaceId = resolvedParams.workspace_id

  // If no workspace_id is provided, find the user's first workspace
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

  // Fetch workspace details
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('name, invite_code')
    .eq('id', activeWorkspaceId)
    .single()

  // Fetch detailed members using security definer RPC
  const { data: members, error: membersError } = await supabase
    .rpc('get_workspace_members_detailed', { w_id: activeWorkspaceId })

  if (membersError) {
    console.error('Failed to fetch detailed members:', membersError)
  }

  const workspaceName = workspace?.name || 'Workspace'

  // This is a Server Component, so `window` isn't available — derive the real
  // origin from the request headers so the invite link isn't a hardcoded
  // localhost fallback (works on both local and production).
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  const proto = headersList.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
  const origin = `${proto}://${host}`
  const inviteUrl = workspace?.invite_code ? `${origin}/invite/${workspace.invite_code}` : ''

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-900 p-8 text-zinc-100">
      <div className="mx-auto max-w-4xl space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-white">{workspaceName} Team</h1>
              <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-0.5 text-xs font-semibold text-zinc-400">
                {members?.length || 0} {members?.length === 1 ? 'member' : 'members'}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-zinc-400">Manage who has access to this workspace&apos;s bug reports.</p>
          </div>
        </div>

        {/* Invite Link Banner */}
        {workspace?.invite_code && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white">Invite new teammates</h3>
              <p className="text-xs text-zinc-400">Share this link with your team to invite them to this workspace.</p>
            </div>
            <div className="flex items-center gap-2 max-w-md w-full md:w-auto">
              <input
                readOnly
                value={inviteUrl}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs text-zinc-300 outline-none w-full md:w-80 truncate"
              />
            </div>
          </div>
        )}

        {/* Members Table */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-950/50">
            <h3 className="text-sm font-semibold text-white">Active Members</h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] uppercase font-bold tracking-wider text-zinc-500 bg-zinc-950/20">
                  <th className="px-6 py-3">Email Address</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Joined At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {(members || []).map((m: Member) => (
                  <tr key={m.member_id} className="hover:bg-zinc-900/20 transition-colors text-sm">
                    <td className="px-6 py-4 font-medium text-zinc-200">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-xs font-bold uppercase text-white shadow-sm shadow-blue-600/20">
                          {m.email?.charAt(0) || 'U'}
                        </div>
                        <span className="truncate">{m.email}</span>
                        {m.user_id === user.id && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/15">You</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${
                        m.role === 'owner' 
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/15' 
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      }`}>
                        {m.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-zinc-400">
                      {new Date(m.joined_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {(!members || members.length === 0) && (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-zinc-500 text-sm">
                      No members found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
