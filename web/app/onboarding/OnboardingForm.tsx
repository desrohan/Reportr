"use client"

import { useState } from 'react'
import { createWorkspace, joinWorkspaceAction } from './actions'

interface OnboardingFormProps {
  defaultOrgName: string
  initialInviteCode: string
}

export function OnboardingForm({ defaultOrgName, initialInviteCode }: OnboardingFormProps) {
  const [activeTab, setActiveTab] = useState<'create' | 'join'>(initialInviteCode ? 'join' : 'create')
  const [inviteCode, setInviteCode] = useState(initialInviteCode)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await joinWorkspaceAction(inviteCode)
    } catch (err: any) {
      setError(err.message || 'Failed to join workspace')
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md space-y-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 shadow-2xl backdrop-blur-xl">
      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-tight text-zinc-100">Welcome to Reportr</h2>
        <p className="mt-2 text-sm text-zinc-400">Set up a new workspace or join an existing one.</p>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl bg-zinc-950 p-1 border border-zinc-800">
        <button
          onClick={() => { setActiveTab('create'); setError(null); }}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
            activeTab === 'create'
              ? 'bg-zinc-800 text-white shadow'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Create Workspace
        </button>
        <button
          onClick={() => { setActiveTab('join'); setError(null); }}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
            activeTab === 'join'
              ? 'bg-zinc-800 text-white shadow'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Join Workspace
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 text-sm text-rose-400 text-center">
          {error}
        </div>
      )}

      {activeTab === 'create' ? (
        <form action={createWorkspace} className="space-y-6">
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
      ) : (
        <form onSubmit={handleJoin} className="space-y-6">
          <div>
            <label htmlFor="invite_code" className="block text-sm font-medium text-zinc-300">
              Invite Code / Link
            </label>
            <input
              id="invite_code"
              type="text"
              required
              placeholder="e.g. abcd1234"
              value={inviteCode}
              onChange={(e) => {
                // If they paste a full link, extract the code portion (last path segment)
                const val = e.target.value.trim()
                if (val.includes('/invite/')) {
                  const parts = val.split('/invite/')
                  setInviteCode(parts[parts.length - 1])
                } else {
                  setInviteCode(val)
                }
              }}
              className="mt-2 block w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group relative flex w-full justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Joining...' : 'Join Workspace'}
          </button>
        </form>
      )}
    </div>
  )
}
