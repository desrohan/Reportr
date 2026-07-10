import { createClient } from '../../../utils/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsForm } from './SettingsForm'

export default async function SettingsPage({
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

  // Fetch workspace details and check user role
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('name, r2_endpoint, r2_access_key_id, r2_secret_access_key, r2_bucket_name, r2_public_domain')
    .eq('id', activeWorkspaceId)
    .single()

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', activeWorkspaceId)
    .eq('user_id', user.id)
    .single()

  const isOwner = member?.role === 'owner'

  // Fetch personal R2 settings
  const { data: personal } = await supabase
    .from('user_r2_settings')
    .select('r2_endpoint, r2_access_key_id, r2_secret_access_key, r2_bucket_name, r2_public_domain')
    .eq('user_id', user.id)
    .maybeSingle()

  const workspaceName = workspace?.name || 'Workspace'

  const workspaceSettings = {
    r2_endpoint: workspace?.r2_endpoint || null,
    r2_access_key_id: workspace?.r2_access_key_id || null,
    r2_secret_access_key: workspace?.r2_secret_access_key || null,
    r2_bucket_name: workspace?.r2_bucket_name || null,
    r2_public_domain: workspace?.r2_public_domain || null,
  }

  const personalSettings = {
    r2_endpoint: personal?.r2_endpoint || null,
    r2_access_key_id: personal?.r2_access_key_id || null,
    r2_secret_access_key: personal?.r2_secret_access_key || null,
    r2_bucket_name: personal?.r2_bucket_name || null,
    r2_public_domain: personal?.r2_public_domain || null,
  }

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-900 p-8 text-zinc-100">
      <div className="mx-auto max-w-4xl space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-5">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">{workspaceName} Settings</h1>
            <p className="mt-1.5 text-sm text-zinc-400">Configure Cloudflare R2 bucket integrations for your workspace and personal recording uploads.</p>
          </div>
        </div>

        <SettingsForm
          workspaceId={activeWorkspaceId}
          isOwner={isOwner}
          initialWorkspaceSettings={workspaceSettings}
          initialPersonalSettings={personalSettings}
        />

      </div>
    </div>
  )
}
