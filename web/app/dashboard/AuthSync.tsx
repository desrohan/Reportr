'use client'

import { useEffect } from 'react'
import { Session } from '@supabase/supabase-js'

export function AuthSync({ session, workspaces }: { session: Session | null, workspaces?: any[] }) {
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Broadcast the session globally to the window
    // The extension's `authSync.ts` content script listens for this
    window.postMessage({
      type: 'REPORTR_AUTH_SYNC',
      session: session
        ? {
            access_token: session.access_token,
            // refresh_token + expires_at let the extension refresh the access
            // token on its own instead of 401ing once the ~1h token expires.
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
            user: {
              id: session.user.id,
              email: session.user.email,
              name: session.user.user_metadata?.full_name
            },
            workspaces: workspaces || []
          }
        : null
    }, '*')
  }, [session, workspaces])

  return null
}
