'use client'

import { useState, useEffect } from 'react'
import { saveWorkspaceR2Settings, savePersonalR2Settings } from './actions'
import { Cloud, Key, Lock, Database, Globe, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

interface R2Settings {
  r2_endpoint: string | null
  r2_access_key_id: string | null
  r2_secret_access_key: string | null
  r2_bucket_name: string | null
  r2_public_domain: string | null
}

interface SettingsFormProps {
  workspaceId: string
  isOwner: boolean
  initialWorkspaceSettings: R2Settings
  initialPersonalSettings: R2Settings
}

export function SettingsForm({
  workspaceId,
  isOwner,
  initialWorkspaceSettings,
  initialPersonalSettings,
}: SettingsFormProps) {
  // Workspace Form State
  const [workspaceEndpoint, setWorkspaceEndpoint] = useState(initialWorkspaceSettings.r2_endpoint || '')
  const [workspaceAccessKey, setWorkspaceAccessKey] = useState(initialWorkspaceSettings.r2_access_key_id || '')
  const [workspaceSecretKey, setWorkspaceSecretKey] = useState(initialWorkspaceSettings.r2_secret_access_key || '')
  const [workspaceBucket, setWorkspaceBucket] = useState(initialWorkspaceSettings.r2_bucket_name || '')
  const [workspaceDomain, setWorkspaceDomain] = useState(initialWorkspaceSettings.r2_public_domain || '')

  // Personal Form State
  const [personalEndpoint, setPersonalEndpoint] = useState(initialPersonalSettings.r2_endpoint || '')
  const [personalAccessKey, setPersonalAccessKey] = useState(initialPersonalSettings.r2_access_key_id || '')
  const [personalSecretKey, setPersonalSecretKey] = useState(initialPersonalSettings.r2_secret_access_key || '')
  const [personalBucket, setPersonalBucket] = useState(initialPersonalSettings.r2_bucket_name || '')
  const [personalDomain, setPersonalDomain] = useState(initialPersonalSettings.r2_public_domain || '')

  // UI state
  const [showWorkspaceSecret, setShowWorkspaceSecret] = useState(false)
  const [showPersonalSecret, setShowPersonalSecret] = useState(false)

  const [savingWorkspace, setSavingWorkspace] = useState(false)
  const [savingPersonal, setSavingPersonal] = useState(false)

  const [workspaceFeedback, setWorkspaceFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [personalFeedback, setPersonalFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Origin to show in the CORS example (the address the browser uploads from).
  // Starts as the production URL so server and first client render match, then
  // resolves to the real origin after mount (covers localhost / self-hosting).
  const [appOrigin, setAppOrigin] = useState('https://reportr.tools.rohan-shah.in')
  useEffect(() => { setAppOrigin(window.location.origin) }, [])

  const handleWorkspaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isOwner) return

    setSavingWorkspace(true)
    setWorkspaceFeedback(null)

    try {
      await saveWorkspaceR2Settings(workspaceId, {
        r2_endpoint: workspaceEndpoint,
        r2_access_key_id: workspaceAccessKey,
        r2_secret_access_key: workspaceSecretKey,
        r2_bucket_name: workspaceBucket,
        r2_public_domain: workspaceDomain,
      })
      setWorkspaceFeedback({ type: 'success', message: 'Workspace R2 settings saved successfully!' })
    } catch (err: any) {
      setWorkspaceFeedback({ type: 'error', message: err.message || 'Failed to save workspace settings.' })
    } finally {
      setSavingWorkspace(false)
    }
  }

  const handlePersonalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingPersonal(true)
    setPersonalFeedback(null)

    try {
      await savePersonalR2Settings({
        r2_endpoint: personalEndpoint,
        r2_access_key_id: personalAccessKey,
        r2_secret_access_key: personalSecretKey,
        r2_bucket_name: personalBucket,
        r2_public_domain: personalDomain,
      })
      setPersonalFeedback({ type: 'success', message: 'Personal R2 settings updated successfully!' })
    } catch (err: any) {
      setPersonalFeedback({ type: 'error', message: err.message || 'Failed to save personal settings.' })
    } finally {
      setSavingPersonal(false)
    }
  }

  const handleClearPersonal = () => {
    setPersonalEndpoint('')
    setPersonalAccessKey('')
    setPersonalSecretKey('')
    setPersonalBucket('')
    setPersonalDomain('')
  }

  return (
    <div className="space-y-12">
      {/* Cloudflare R2 Setup Guide Card */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 md:p-8 shadow-xl">
        <details className="group" open>
          <summary className="text-lg font-bold text-white flex items-center justify-between gap-2 cursor-pointer list-none select-none">
            <span className="flex items-center gap-2">
              <Database className="text-blue-400 h-5 w-5 animate-pulse" />
              Cloudflare R2 Setup Guide & Documentation
            </span>
            <span className="transition-transform group-open:rotate-180 text-zinc-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </summary>
          
          <div className="mt-6 pt-6 border-t border-zinc-800 space-y-6 text-sm text-zinc-300">
            <div className="space-y-2">
              <h3 className="font-bold text-zinc-200">1. Sign Up / Log In to Cloudflare</h3>
              <p>Go to <a href="https://cloudflare.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline font-semibold">cloudflare.com</a>, create a free account, or log in if you already have one.</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-zinc-200">2. Locate your Account ID and R2 Endpoint</h3>
              <p>Navigate to <strong>R2 Object Storage</strong> in the Cloudflare sidebar. Look on the right-hand side of the page for your <strong>Account ID</strong>. Use this ID to construct your Endpoint: </p>
              <code className="block bg-zinc-900 border border-zinc-800 p-2.5 rounded-lg font-mono text-xs text-blue-300 select-all">
                https://&lt;ACCOUNT_ID&gt;.r2.cloudflarestorage.com
              </code>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-zinc-200">3. Create a Bucket</h3>
              <p>In R2, click <strong>Create bucket</strong>. Choose a unique bucket name (e.g. <code className="bg-zinc-900 border border-zinc-800 px-1 py-0.5 rounded text-zinc-300 font-mono text-xs">reportr-videos</code>) and click <strong>Create bucket</strong>. This name goes into <strong>Bucket Name</strong>.</p>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-zinc-200">4. Enable Public Access & Get Public Domain</h3>
              <p>Within your bucket details page, select the <strong>Settings</strong> tab. Scroll down to the <strong>Public Access</strong> section. You have two options:</p>
              <ul className="list-disc pl-5 space-y-1.5 mt-1.5">
                <li><strong>Custom Domain:</strong> Click <strong>Connect Domain</strong> and map a subdomain of yours (e.g., <code className="bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono text-xs">cdn.yourdomain.com</code>). Enter this URL into <strong>Public Domain</strong>.</li>
                <li><strong>R2.dev Subdomain:</strong> Click <strong>Allow Access</strong> to enable the read-only Cloudflare subdomain. Copy the generated domain (e.g., <code className="bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono text-xs">https://pub-xxxxxxxx.r2.dev</code>) and paste it into <strong>Public Domain</strong>.</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-zinc-200">5. Generate API Keys (Access Key ID & Secret Access Key)</h3>
              <p>Navigate back to the main <strong>R2 Overview</strong> page. Click <strong>Manage R2 API Tokens</strong> on the right side. Click <strong>Create API token</strong> and follow these configuration settings:</p>
              <ul className="list-disc pl-5 space-y-1.5 mt-1.5">
                <li><strong>Permissions:</strong> Choose <strong>Edit</strong> (required so the application can write/upload videos).</li>
                <li><strong>Bucket Scope:</strong> Limit scope to the bucket you created, or choose all buckets.</li>
                <li>Click <strong>Create API Token</strong>.</li>
              </ul>
              <p className="mt-2 text-zinc-400">Copy the generated tokens immediately as they will not be shown again:</p>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>Copy <strong>Access Key ID</strong> and insert it into the <strong>Access Key ID</strong> field.</li>
                <li>Copy <strong>Secret Access Key</strong> and insert it into the <strong>Secret Access Key</strong> field.</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-zinc-200">6. Add a CORS Policy (Required for Uploads)</h3>
              <p>Recordings and screenshots upload straight from your browser to R2, so the bucket must allow cross-origin <strong>PUT</strong> requests from Reportr. Without this, saving a report will fail.</p>
              <p>Open your bucket&apos;s <strong>Settings</strong> tab, find the <strong>CORS Policy</strong> section, click <strong>Edit</strong>, and paste:</p>
              <code className="block whitespace-pre bg-zinc-900 border border-zinc-800 p-3 rounded-lg font-mono text-xs text-blue-300 overflow-x-auto select-all">{`[
  {
    "AllowedOrigins": ["${appOrigin}"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]`}</code>
              <p className="text-[11px] text-zinc-500 mt-1"><code className="bg-zinc-900 border border-zinc-800 px-1 py-0.5 rounded text-zinc-300 font-mono">AllowedOrigins</code> is the address where you use Reportr (shown above for this deployment). It saves within about a minute.</p>
            </div>
          </div>
        </details>
      </section>

      {/* Workspace Settings Card */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 md:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-zinc-800 pb-6 mb-8">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Cloud className="text-blue-400 h-5 w-5" />
              Workspace R2 Storage
            </h2>
            <p className="text-sm text-zinc-400 max-w-2xl">
              Connect your own Cloudflare R2 bucket. All workspace members' recordings will be uploaded here by default.
            </p>
          </div>
          {!isOwner && (
            <div className="inline-flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/15 px-3 py-1.5 text-xs text-amber-400 font-medium">
              <AlertCircle size={14} />
              Read-Only (Owner only)
            </div>
          )}
        </div>

        <form onSubmit={handleWorkspaceSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">R2 Endpoint</label>
              <div className="relative">
                <input
                  type="url"
                  placeholder="https://<account_id>.r2.cloudflarestorage.com"
                  disabled={!isOwner || savingWorkspace}
                  value={workspaceEndpoint}
                  onChange={(e) => setWorkspaceEndpoint(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 pl-10 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
                <Database className="absolute left-3.5 top-3.5 text-zinc-600 h-4 w-4" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Bucket Name</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="my-workspace-bucket"
                  disabled={!isOwner || savingWorkspace}
                  value={workspaceBucket}
                  onChange={(e) => setWorkspaceBucket(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 pl-10 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
                <Cloud className="absolute left-3.5 top-3.5 text-zinc-600 h-4 w-4" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Access Key ID</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Enter R2 Access Key ID"
                  disabled={!isOwner || savingWorkspace}
                  value={workspaceAccessKey}
                  onChange={(e) => setWorkspaceAccessKey(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 pl-10 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
                <Key className="absolute left-3.5 top-3.5 text-zinc-600 h-4 w-4" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Secret Access Key</label>
              <div className="relative">
                <input
                  type={showWorkspaceSecret ? 'text' : 'password'}
                  placeholder="Enter R2 Secret Access Key"
                  disabled={!isOwner || savingWorkspace}
                  value={workspaceSecretKey}
                  onChange={(e) => setWorkspaceSecretKey(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 pl-10 pr-10 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
                <Lock className="absolute left-3.5 top-3.5 text-zinc-600 h-4 w-4" />
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => setShowWorkspaceSecret(!showWorkspaceSecret)}
                    className="absolute right-3 top-3.5 text-zinc-500 hover:text-zinc-300 transition-colors focus:outline-none"
                  >
                    {showWorkspaceSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Public Domain</label>
              <div className="relative">
                <input
                  type="url"
                  placeholder="https://pub-xxxxxxxx.r2.dev or https://cdn.yourdomain.com"
                  disabled={!isOwner || savingWorkspace}
                  value={workspaceDomain}
                  onChange={(e) => setWorkspaceDomain(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 pl-10 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
                <Globe className="absolute left-3.5 top-3.5 text-zinc-600 h-4 w-4" />
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">
                Make sure public access is configured for this bucket on Cloudflare.
              </p>
            </div>
          </div>

          {workspaceFeedback && (
            <div className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm ${
              workspaceFeedback.type === 'success' 
                ? 'bg-emerald-500/10 border-emerald-500/15 text-emerald-400' 
                : 'bg-rose-500/10 border-rose-500/15 text-rose-400'
            }`}>
              {workspaceFeedback.type === 'success' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <AlertCircle size={18} className="mt-0.5 shrink-0" />}
              <span>{workspaceFeedback.message}</span>
            </div>
          )}

          {isOwner && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingWorkspace}
                className="rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] transition-all px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
              >
                {savingWorkspace && <Loader2 className="animate-spin h-4 w-4" />}
                Save Workspace Storage
              </button>
            </div>
          )}
        </form>
      </section>

      {/* Personal Settings Card */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 md:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-zinc-800 pb-6 mb-8">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Cloud className="text-blue-400 h-5 w-5" />
              Personal R2 Storage (Override)
            </h2>
            <p className="text-sm text-zinc-400 max-w-2xl">
              Connect your own personal R2 bucket. If configured, your recordings will get uploaded here instead of the default workspace bucket. Leave all fields empty to clear and use the workspace settings.
            </p>
          </div>
        </div>

        <form onSubmit={handlePersonalSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">R2 Endpoint</label>
              <div className="relative">
                <input
                  type="url"
                  placeholder="https://<account_id>.r2.cloudflarestorage.com"
                  disabled={savingPersonal}
                  value={personalEndpoint}
                  onChange={(e) => setPersonalEndpoint(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 pl-10 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
                <Database className="absolute left-3.5 top-3.5 text-zinc-600 h-4 w-4" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Bucket Name</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="my-personal-bucket"
                  disabled={savingPersonal}
                  value={personalBucket}
                  onChange={(e) => setPersonalBucket(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 pl-10 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
                <Cloud className="absolute left-3.5 top-3.5 text-zinc-600 h-4 w-4" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Access Key ID</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Enter personal R2 Access Key ID"
                  disabled={savingPersonal}
                  value={personalAccessKey}
                  onChange={(e) => setPersonalAccessKey(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 pl-10 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
                <Key className="absolute left-3.5 top-3.5 text-zinc-600 h-4 w-4" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Secret Access Key</label>
              <div className="relative">
                <input
                  type={showPersonalSecret ? 'text' : 'password'}
                  placeholder="Enter personal R2 Secret Access Key"
                  disabled={savingPersonal}
                  value={personalSecretKey}
                  onChange={(e) => setPersonalSecretKey(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 pl-10 pr-10 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
                <Lock className="absolute left-3.5 top-3.5 text-zinc-600 h-4 w-4" />
                <button
                  type="button"
                  onClick={() => setShowPersonalSecret(!showPersonalSecret)}
                  className="absolute right-3 top-3.5 text-zinc-500 hover:text-zinc-300 transition-colors focus:outline-none"
                >
                  {showPersonalSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Public Domain</label>
              <div className="relative">
                <input
                  type="url"
                  placeholder="https://pub-xxxxxxxx.r2.dev or https://cdn.yourdomain.com"
                  disabled={savingPersonal}
                  value={personalDomain}
                  onChange={(e) => setPersonalDomain(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 pl-10 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
                <Globe className="absolute left-3.5 top-3.5 text-zinc-600 h-4 w-4" />
              </div>
            </div>
          </div>

          {personalFeedback && (
            <div className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm ${
              personalFeedback.type === 'success' 
                ? 'bg-emerald-500/10 border-emerald-500/15 text-emerald-400' 
                : 'bg-rose-500/10 border-rose-500/15 text-rose-400'
            }`}>
              {personalFeedback.type === 'success' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <AlertCircle size={18} className="mt-0.5 shrink-0" />}
              <span>{personalFeedback.message}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={handleClearPersonal}
              className="rounded-xl border border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-all px-4 py-2.5 text-xs font-medium cursor-pointer"
            >
              Reset / Clear Fields
            </button>

            <button
              type="submit"
              disabled={savingPersonal}
              className="rounded-xl bg-blue-600 hover:bg-blue-600 active:scale-[0.98] transition-all px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
            >
              {savingPersonal && <Loader2 className="animate-spin h-4 w-4" />}
              Save Personal Storage
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
