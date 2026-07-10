import { createClient } from '../../../utils/supabase/server'
import { redirect } from 'next/navigation'
import { acceptInvite } from './actions'

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code
  
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 1. If not signed in, redirect to login with a next parameter
  if (!user) {
    redirect(`/login?next=/invite/${code}`)
  }

  // 2. Fetch workspace name (Assumes RLS allows fetching by invite_code)
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('name')
    .eq('invite_code', code)
    .single()

  if (!workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-rose-500/20 bg-zinc-900/50 p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white">Invalid Invite</h2>
          <p className="text-zinc-400">This invite link is invalid or has expired.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 shadow-2xl backdrop-blur-xl">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-xl shadow-blue-500/20">
            <span className="text-2xl font-bold text-white tracking-widest">{workspace.name.substring(0, 2).toUpperCase()}</span>
          </div>
          <h2 className="text-2xl font-bold text-white">You've been invited</h2>
          <p className="mt-2 text-zinc-400">
            Join <strong className="text-white">{workspace.name}</strong> on Reportr
          </p>
        </div>

        <form action={acceptInvite.bind(null, code)}>
          <button
            type="submit"
            className="w-full rounded-xl bg-white px-4 py-3 font-semibold text-zinc-900 transition-all hover:bg-zinc-100 active:scale-[0.98]"
          >
            Accept Invite
          </button>
        </form>
        
        <div className="text-center">
          <button className="text-sm font-medium text-zinc-500 hover:text-zinc-300 transition-colors">
            Decline
          </button>
        </div>
      </div>
    </div>
  )
}
