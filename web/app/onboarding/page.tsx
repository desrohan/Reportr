import { redirect } from 'next/navigation'
import { createClient } from '../../utils/supabase/server'
import { createWorkspace } from './actions'

export default async function OnboardingPage() {
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

  if (workspaces && workspaces.length > 0) {
    redirect('/dashboard')
  }

  const fullName = session.user.user_metadata?.full_name || 'Personal'
  const defaultOrgName = `${fullName.split(' ')[0]}'s Organization`

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 shadow-2xl backdrop-blur-xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-100">Create your Workspace</h2>
          <p className="mt-2 text-sm text-zinc-400">Let's get your organization set up to store bug reports.</p>
        </div>

        <form action={createWorkspace} className="mt-8 space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-zinc-300">
              Workspace Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={defaultOrgName}
              className="mt-2 block w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm transition-colors"
            />
          </div>

          <button
            type="submit"
            className="group relative flex w-full justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-500 active:scale-[0.98]"
          >
            Create Organization
          </button>
        </form>
      </div>
    </div>
  )
}
