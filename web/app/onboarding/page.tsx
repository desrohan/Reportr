import { redirect } from 'next/navigation'
import { createClient } from '../../utils/supabase/server'
import { OnboardingForm } from './OnboardingForm'

export default async function OnboardingPage({
  searchParams
}: {
  searchParams: Promise<{ code?: string; invite_code?: string }>
}) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    redirect('/')
  }

  // Check if they already have an organization
  const { data: workspaces } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', session.user.id)
    .limit(1)

  // Extract invite code from search params (supports ?code=xxx or ?invite_code=xxx)
  const resolvedParams = await searchParams
  const code = resolvedParams.code || resolvedParams.invite_code || ''

  // If they already have a workspace, and didn't explicitly request to join/create (no code in URL), redirect to dashboard
  if (workspaces && workspaces.length > 0 && !code) {
    redirect('/dashboard')
  }

  const fullName = session.user.user_metadata?.full_name || 'Personal'
  const defaultOrgName = `${fullName.split(' ')[0]}'s Organization`

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <OnboardingForm defaultOrgName={defaultOrgName} initialInviteCode={code} />
    </div>
  )
}
