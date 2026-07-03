'use server'

import { redirect } from 'next/navigation'
import { createClient } from '../../utils/supabase/server'
import { randomBytes } from 'crypto'

export async function createWorkspace(formData: FormData) {
  const name = formData.get('name') as string
  if (!name || name.trim() === '') return

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  // Generate unique invite code
  const inviteCode = randomBytes(4).toString('hex')

  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .insert({
      name: name.trim(),
      invite_code: inviteCode,
      created_by: user.id
    })
    .select('id')
    .single()

  if (workspaceError || !workspace) {
    console.error('Failed to create workspace:', workspaceError)
    return
  }

  const { error: memberError } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: 'owner'
    })

  if (memberError) {
    console.error('Failed to add workspace owner:', memberError)
    return
  }

  redirect('/dashboard')
}

export async function joinWorkspaceAction(inviteCode: string) {
  if (!inviteCode || inviteCode.trim() === '') {
    throw new Error('Invite code is required')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  // Find the workspace by invite code
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id')
    .eq('invite_code', inviteCode.trim())
    .single()

  if (workspaceError || !workspace) {
    throw new Error('Workspace not found or invalid invite code.')
  }

  // Add the member
  const { error: memberError } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: 'member'
    })

  // 23505 is unique constraint violation (already a member)
  if (memberError && memberError.code !== '23505') {
    console.error('Failed to join workspace:', memberError)
    throw new Error('Failed to join workspace.')
  }

  redirect('/dashboard')
}
