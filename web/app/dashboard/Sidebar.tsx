'use client'

import { useState, useRef, useEffect } from 'react'
import { regenerateInviteCode } from './actions'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../utils/supabase/client'
import { Logo } from '../components/Logo'
import type { User } from '@supabase/supabase-js'
import {
  LayoutList,
  Users,
  Settings,
  ChevronsUpDown,
  Copy,
  RefreshCw,
  LogOut,
  Check,
} from 'lucide-react'

interface SidebarWorkspace {
  id: string
  name: string
  role: string
  invite_code: string
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'All Recordings', icon: LayoutList, match: (p: string) => p === '/dashboard' || p === '/' },
  { href: '/dashboard/members', label: 'Team Members', icon: Users, match: (p: string) => p === '/dashboard/members' },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, match: (p: string) => p === '/dashboard/settings' },
]

export function DashboardSidebar({ workspaces: initialWorkspaces, user }: { workspaces: SidebarWorkspace[]; user: User }) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowProfileMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const urlWorkspaceId = searchParams.get('workspace_id')
  const activeWorkspaceId =
    urlWorkspaceId && workspaces.some((w) => w.id === urlWorkspaceId)
      ? urlWorkspaceId
      : workspaces[0]?.id || ''

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0]
  const inviteUrl =
    typeof window !== 'undefined' && activeWorkspace?.invite_code
      ? `${window.location.origin}/invite/${activeWorkspace.invite_code}`
      : ''

  const copyInvite = () => {
    if (!inviteUrl) return
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col justify-between bg-zinc-950 px-4 py-6">
      <div className="min-h-0">
        <div className="px-2">
          <Logo href="/dashboard" />
        </div>

        {/* Workspace switcher */}
        <div className="mt-8">
          <label className="px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Workspace</label>
          <div className="relative mt-2">
            <select
              title="workspace switcher"
              className="w-full cursor-pointer appearance-none rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 pl-3 pr-9 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={activeWorkspaceId}
              onChange={(e) => {
                const params = new URLSearchParams(window.location.search)
                params.set('workspace_id', e.target.value)
                router.push(`${pathname}?${params.toString()}`)
              }}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          </div>

          {activeWorkspace?.invite_code && (
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Invite link</span>
              <div className="flex items-center justify-between gap-2">
                <input readOnly value={inviteUrl} className="w-full truncate bg-transparent text-xs text-zinc-300 outline-none" />
                <div className="flex shrink-0 items-center gap-2.5">
                  <button
                    onClick={copyInvite}
                    className="text-zinc-400 transition-colors hover:text-blue-400"
                    title="Copy invite link"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  {activeWorkspace.role === 'owner' && (
                    <button
                      onClick={async () => {
                        if (confirm('Regenerate invite link? The old link will expire instantly.')) {
                          try {
                            const newCode = await regenerateInviteCode(activeWorkspace.id)
                            setWorkspaces((prev) => prev.map((w) => (w.id === activeWorkspace.id ? { ...w, invite_code: newCode } : w)))
                          } catch (err: unknown) {
                            alert(err instanceof Error && err.message ? err.message : 'Failed to regenerate')
                          }
                        }
                      }}
                      className="text-zinc-500 transition-colors hover:text-zinc-300"
                      title="Regenerate invite link"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="mt-7 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname)
            return (
              <Link
                key={item.href}
                href={`${item.href}?workspace_id=${activeWorkspaceId}`}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? 'bg-zinc-900 text-white' : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-white'
                }`}
              >
                {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-blue-500" />}
                <item.icon className={`h-4.5 w-4.5 ${active ? 'text-blue-400' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Profile */}
      <div ref={menuRef} className="relative border-t border-zinc-800 pt-4">
        {showProfileMenu && (
          <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 py-1 shadow-xl">
            <button
              onClick={handleLogout}
              className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-rose-400 transition-colors hover:bg-zinc-800 hover:text-rose-300"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        )}
        <button
          onClick={() => setShowProfileMenu((v) => !v)}
          className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-zinc-900/60 focus:outline-none"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-sm font-semibold text-white shadow-md shadow-blue-600/20">
            {user.user_metadata?.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-semibold text-zinc-200">{user.user_metadata?.full_name || 'User'}</p>
            <p className="truncate text-xs text-zinc-500">{user.email}</p>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-zinc-500" />
        </button>
      </div>
    </aside>
  )
}
