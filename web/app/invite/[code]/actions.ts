'use server'

import { createClient } from '../../../utils/supabase/server'
import { redirect } from 'next/navigation'

export async function acceptInvite(code: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Find the workspace by invite code
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id')
    .eq('invite_code', code)
    .single()

  if (!workspace || workspaceError) {
    throw new Error('Invalid or expired invite link.')
  }

  // Join the workspace
  const { error: joinError } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: 'member'
    })

  // If already joined, it will violate unique constraint (which is fine, we just redirect)
  if (joinError && joinError.code !== '23505') {
    throw new Error('Failed to join workspace.')
  }

  // Redirect to dashboard (or home) on success
  redirect('/?joined=true')
}
