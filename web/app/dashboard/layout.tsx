import { redirect } from 'next/navigation'
import { createClient } from '../../utils/supabase/server'
import { DashboardSidebar } from './Sidebar'
import { AuthSync } from './AuthSync'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  const { data: { session } } = await supabase.auth.getSession()

  // Fetch workspaces for context switcher
  const { data: userWorkspaces } = await supabase
    .from('workspace_members')
    .select('*, workspaces(*)')
    .eq('user_id', user.id)

  if (!userWorkspaces || userWorkspaces.length === 0) {
    redirect('/onboarding')
  }

  // Flatten the workspaces data
  const workspaces = userWorkspaces.map((wm: any) => ({
    id: wm.workspace_id,
    name: wm.workspaces.name,
    role: wm.role,
    invite_code: wm.workspaces.invite_code
  }))

  return (
    <div className="flex h-screen bg-zinc-950 text-white">
      {/* Auth Sync Component - Hidden, pushes token to extension */}
      <AuthSync session={session!} workspaces={workspaces} />
      
      <DashboardSidebar workspaces={workspaces} user={user} />

      <main className="flex-1 overflow-y-auto bg-zinc-900 border-l border-zinc-800">
        {children}
      </main>
    </div>
  )
}
