'use server'

import { createClient } from '../../../utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveWorkspaceR2Settings(
  workspaceId: string,
  data: {
    r2_endpoint: string
    r2_access_key_id: string
    r2_secret_access_key: string
    r2_bucket_name: string
    r2_public_domain: string
  }
) {
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
    throw new Error('Only workspace owners can configure workspace storage settings.')
  }

  // Update workspace settings
  const { error } = await supabase
    .from('workspaces')
    .update({
      r2_endpoint: data.r2_endpoint?.trim() || null,
      r2_access_key_id: data.r2_access_key_id?.trim() || null,
      r2_secret_access_key: data.r2_secret_access_key?.trim() || null,
      r2_bucket_name: data.r2_bucket_name?.trim() || null,
      r2_public_domain: data.r2_public_domain?.trim() || null,
    })
    .eq('id', workspaceId)

  if (error) {
    console.error('Failed to update workspace R2 settings:', error)
    throw new Error('Failed to save workspace settings.')
  }

  revalidatePath(`/dashboard/settings`)
  return { success: true }
}

export async function savePersonalR2Settings(
  data: {
    r2_endpoint: string
    r2_access_key_id: string
    r2_secret_access_key: string
    r2_bucket_name: string
    r2_public_domain: string
  }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  // If all fields are empty, delete the user's personal R2 settings to fallback
  const allEmpty = !data.r2_endpoint?.trim() && 
                   !data.r2_access_key_id?.trim() && 
                   !data.r2_secret_access_key?.trim() && 
                   !data.r2_bucket_name?.trim() && 
                   !data.r2_public_domain?.trim()

  if (allEmpty) {
    const { error } = await supabase
      .from('user_r2_settings')
      .delete()
      .eq('user_id', user.id)

    if (error) {
      console.error('Failed to delete personal R2 settings:', error)
      throw new Error('Failed to clear personal settings.')
    }
  } else {
    // Upsert personal settings
    const { error } = await supabase
      .from('user_r2_settings')
      .upsert({
        user_id: user.id,
        r2_endpoint: data.r2_endpoint?.trim() || null,
        r2_access_key_id: data.r2_access_key_id?.trim() || null,
        r2_secret_access_key: data.r2_secret_access_key?.trim() || null,
        r2_bucket_name: data.r2_bucket_name?.trim() || null,
        r2_public_domain: data.r2_public_domain?.trim() || null,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      console.error('Failed to upsert personal R2 settings:', error)
      throw new Error('Failed to save personal settings.')
    }
  }

  revalidatePath(`/dashboard/settings`)
  return { success: true }
}
