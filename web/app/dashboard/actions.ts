'use server'

import { createClient } from '../../utils/supabase/server'
import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'

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
