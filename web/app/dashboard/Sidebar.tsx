'use client'

import { useState } from 'react'
import { regenerateInviteCode } from './actions'

export function DashboardSidebar({ workspaces: initialWorkspaces, user }: { workspaces: any[], user: any }) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(initialWorkspaces[0]?.id)

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0]

  return (
    <aside className="w-64 flex flex-col justify-between py-6 px-4 bg-zinc-950">
      <div>
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 shadow-lg shadow-indigo-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
          <span className="font-bold text-lg text-zinc-100 tracking-tight">Reportr</span>
        </div>

        {/* Workspace Switcher */}
        <div className="mb-6">
          <label className="px-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Workspace</label>
          <div className="mt-2 group relative">
            <select
              title="workspace switcher"
              className="w-full appearance-none rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 pl-3 pr-8 text-sm font-medium text-zinc-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={activeWorkspaceId}
              onChange={(e) => setActiveWorkspaceId(e.target.value)}
            >
              {workspaces.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
              </svg>
            </div>
          </div>
          {activeWorkspace.invite_code && (
            <div className="mt-3 px-3 py-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800 flex flex-col gap-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Invite Members</span>
              <div className="flex items-center justify-between gap-2">
                <input 
                  readOnly 
                  value={`${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/invite/${activeWorkspace.invite_code}`}
                  className="bg-transparent text-xs text-zinc-300 outline-none truncate w-full"
                />
                <div className="flex gap-2.5 shrink-0">
                  <button 
                    onClick={() => {
                      const url = `${window.location.origin}/invite/${activeWorkspace.invite_code}`;
                      navigator.clipboard.writeText(url);
                      alert("Invite link copied to clipboard!");
                    }}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer transition-colors"
                  >
                    Copy
                  </button>
                  {activeWorkspace.role === 'owner' && (
                    <button 
                      onClick={async () => {
                        if (confirm("Regenerate invite link? The old link will expire instantly.")) {
                          try {
                            const newCode = await regenerateInviteCode(activeWorkspace.id);
                            setWorkspaces(prev => prev.map(w => w.id === activeWorkspace.id ? { ...w, invite_code: newCode } : w));
                            alert("New invite link generated!");
                          } catch (err: any) {
                            alert(err.message || "Failed to regenerate");
                          }
                        }
                      }}
                      className="text-xs text-zinc-500 hover:text-zinc-400 font-bold cursor-pointer transition-colors"
                    >
                      Regenerate
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <nav className="space-y-1">
          <a href="#" className="flex items-center gap-3 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white">
            <svg className="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            All Recordings
          </a>
          <a href="#" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-900/50 hover:text-white transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Team Members
          </a>
          <a href="#" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-900/50 hover:text-white transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </a>
        </nav>
      </div>

      <div className="flex items-center gap-3 border-t border-zinc-800 pt-4 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-white">
          {user.user_metadata?.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
        </div>
        <div className="overflow-hidden">
          <p className="truncate text-sm font-medium text-zinc-200">{user.user_metadata?.full_name || 'User'}</p>
          <p className="truncate text-xs text-zinc-500">{user.email}</p>
        </div>
      </div>
    </aside>
  )
}
