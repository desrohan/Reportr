'use client'

import { useEffect } from 'react'
import { Session } from '@supabase/supabase-js'

export function AuthSync({ session, workspaces }: { session: Session, workspaces?: any[] }) {
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Broadcast the session globally to the window
    // The extension's `authSync.ts` content script listens for this
    window.postMessage({
      type: 'REPORTR_AUTH_SYNC',
      session: {
        access_token: session.access_token,
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.full_name
        },
        workspaces: workspaces || []
      }
    }, '*')
  }, [session, workspaces])

  return null
}
