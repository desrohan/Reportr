import Link from 'next/link'
import {
  Camera,
  ScrollText,
  Crop,
  Video,
  PenTool,
  History,
  Users,
  Database,
  Download,
  ArrowRight,
  MousePointerClick,
  ToggleRight,
  FolderOpen,
  Pin,
} from 'lucide-react'
import { createClient } from '../utils/supabase/server'
import { AuthSync } from './dashboard/AuthSync'
import { Logo } from './components/Logo'
import { Reveal } from './components/landing/Reveal'
import { CopyCommand } from './components/landing/CopyCommand'

const EXTENSION_VERSION = 'v1.0.0'
const EXTENSION_SIZE = '170 KB'
const DOWNLOAD_HREF = '/reportr-extension.zip'

const CAPTURE_FEATURES = [
  {
    icon: Camera,
    title: 'Visible screenshot',
    body: 'Grab exactly what’s on screen in a single click — no cropping, no setup.',
  },
  {
    icon: ScrollText,
    title: 'Full-page capture',
    body: 'Reportr scrolls the whole page and stitches it into one tall, pixel-perfect image.',
  },
  {
    icon: Crop,
    title: 'Select an area',
    body: 'Drag a box around the exact region that’s broken and capture just that.',
  },
  {
    icon: Video,
    title: 'Screen recording',
    body: 'Record this tab or your whole desktop, with tab audio, to show the bug in motion.',
  },
]

const REVIEW_FEATURES = [
  {
    icon: PenTool,
    title: 'Annotate',
    body: 'Mark up screenshots with arrows, boxes, and highlights before you share.',
  },
  {
    icon: History,
    title: 'Session replay',
    body: 'Every click and DOM change is captured, so teammates can replay the bug step by step.',
  },
  {
    icon: Users,
    title: 'Team workspaces',
    body: 'Invite your team, share a link, and keep every report in one place.',
  },
  {
    icon: Database,
    title: 'Your own storage',
    body: 'Bring your Cloudflare R2 bucket. Recordings live on infrastructure you control.',
  },
]

const STEPS = [
  {
    icon: Download,
    title: 'Download & unzip',
    body: 'Grab the .zip above and unzip it. You’ll get a folder named reportr-extension.',
  },
  {
    icon: MousePointerClick,
    title: 'Open the extensions page',
    body: 'Paste this into a new Chrome tab and press Enter:',
    command: 'chrome://extensions',
  },
  {
    icon: ToggleRight,
    title: 'Turn on Developer mode',
    body: 'Flip the Developer mode switch in the top-right corner of that page.',
  },
  {
    icon: FolderOpen,
    title: 'Load unpacked',
    body: 'Click Load unpacked, then select the reportr-extension folder you unzipped.',
  },
  {
    icon: Pin,
    title: 'Pin & sign in',
    body: 'Pin Reportr to your toolbar, then sign in from your dashboard so recordings upload to your workspace.',
  },
]

export default async function LandingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // If a signed-in user lands here, sync their workspaces to the extension too.
  // Without this, AuthSync would push an empty workspace list and wipe the
  // dropdown in the extension popup (breaking capture's workspace context).
  let workspaces: any[] = []
  if (user) {
    const { data: userWorkspaces } = await supabase
      .from('workspace_members')
      .select('*, workspaces(*)')
      .eq('user_id', user.id)
    workspaces = (userWorkspaces || []).map((wm: any) => ({
      id: wm.workspace_id,
      name: wm.workspaces?.name,
      role: wm.role,
      invite_code: wm.workspaces?.invite_code,
    }))
  }

  const primaryHref = user ? '/dashboard' : '/login'
  const primaryLabel = user ? 'Open dashboard' : 'Sign in'

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-zinc-950 text-zinc-100">
      <AuthSync session={session} workspaces={workspaces} />

      {/* Ambient background: blue spotlight + faint grid */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-10%] h-[520px] w-[900px] max-w-full -translate-x-1/2 rounded-full bg-blue-600/18 blur-[130px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_60%,transparent_100%)]" />
      </div>

      <div className="relative z-10">
        {/* ───────────────────────── Nav ───────────────────────── */}
        <header className="sticky top-0 z-50 border-b border-zinc-800/70 bg-zinc-950/70 backdrop-blur-xl">
          <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
            <Logo href="/" />
            <div className="hidden items-center gap-8 text-sm text-zinc-400 md:flex">
              <a href="#features" className="transition-colors hover:text-white">Features</a>
              <a href="#install" className="transition-colors hover:text-white">How it works</a>
              <Link href={primaryHref} className="transition-colors hover:text-white">
                {user ? 'Dashboard' : 'Sign in'}
              </Link>
            </div>
            <a
              href={DOWNLOAD_HREF}
              download
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-500 active:scale-[0.98]"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download</span>
            </a>
          </nav>
        </header>

        {/* ───────────────────────── Hero ───────────────────────── */}
        <section className="mx-auto max-w-6xl px-5 pb-8 pt-20 text-center sm:px-8 sm:pt-28">
          <div className="reveal">
            <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3.5 py-1.5 text-xs font-medium text-zinc-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
              </span>
              Chrome extension for bug reports
            </span>
          </div>

          <h1 className="reveal mx-auto mt-7 max-w-3xl text-balance text-5xl font-semibold tracking-tight text-white sm:text-6xl md:text-7xl" style={{ animationDelay: '80ms' }}>
            Report a bug in one click.
          </h1>

          <p className="reveal mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-zinc-400" style={{ animationDelay: '160ms' }}>
            Reportr captures annotated screenshots, screen recordings, and full session
            replays — then shares them with your team on storage you own.
          </p>

          <div className="reveal mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row" style={{ animationDelay: '240ms' }}>
            <a
              href={DOWNLOAD_HREF}
              download
              className="group inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-blue-600/25 transition-all hover:bg-blue-500 active:scale-[0.98] sm:w-auto"
            >
              <Download className="h-4.5 w-4.5" />
              Download extension
            </a>
            <Link
              href={primaryHref}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/60 px-6 py-3.5 text-sm font-semibold text-zinc-200 transition-all hover:border-zinc-600 hover:bg-zinc-800 active:scale-[0.98] sm:w-auto"
            >
              {primaryLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <p className="reveal mt-5 text-xs text-zinc-500" style={{ animationDelay: '300ms' }}>
            {EXTENSION_VERSION} · {EXTENSION_SIZE} · Loads unpacked in Chrome — no web store required
          </p>

          {/* Product mockup */}
          <div className="reveal mt-16" style={{ animationDelay: '360ms' }}>
            <HeroMockup />
          </div>
        </section>

        {/* ───────────────────────── Features ───────────────────────── */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24 sm:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Everything in one click</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Capture it. Mark it up. Ship it.
            </h2>
            <p className="mt-5 text-lg text-zinc-400">
              Four ways to capture the bug, four ways to make it impossible to ignore.
            </p>
          </Reveal>

          <div className="mt-14 space-y-14">
            <FeatureCluster label="Capture" features={CAPTURE_FEATURES} />
            <FeatureCluster label="Review & share" features={REVIEW_FEATURES} />
          </div>
        </section>

        {/* ───────────────────────── Install steps ───────────────────────── */}
        <section id="install" className="scroll-mt-20 border-y border-zinc-800/70 bg-zinc-900/20">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Installation</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Up and running in about a minute.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-zinc-400">
                Reportr installs straight from the .zip — no Chrome Web Store, no review queue.
                Five short steps and you’re capturing.
              </p>
              <a
                href={DOWNLOAD_HREF}
                download
                className="mt-8 inline-flex items-center gap-2.5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-500 active:scale-[0.98]"
              >
                <Download className="h-4 w-4" />
                Download the .zip
              </a>
            </Reveal>

            <ol className="relative space-y-2">
              {STEPS.map((step, i) => (
                <Reveal as="li" key={step.title} delay={i * 70} className="relative flex gap-5 rounded-2xl border border-transparent p-4 transition-colors hover:border-zinc-800 hover:bg-zinc-900/40">
                  <div className="flex flex-col items-center">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-sm font-semibold text-blue-400">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {i < STEPS.length - 1 && <span className="mt-1 w-px flex-1 bg-zinc-800" />}
                  </div>
                  <div className="pb-4">
                    <div className="flex items-center gap-2">
                      <step.icon className="h-4 w-4 text-zinc-500" />
                      <h3 className="text-base font-semibold text-white">{step.title}</h3>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{step.body}</p>
                    {step.command && (
                      <div className="mt-3">
                        <CopyCommand value={step.command} />
                      </div>
                    )}
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ───────────────────────── Final CTA ───────────────────────── */}
        <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
          <Reveal className="relative overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-b from-blue-600/15 to-zinc-900/40 px-6 py-16 text-center sm:px-16">
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-64 w-[600px] max-w-full -translate-x-1/2 rounded-full bg-blue-600/20 blur-[100px]" />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Ready to squash some bugs?
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-300">
                Download the extension, load it in Chrome, and file your first report in under a minute.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href={DOWNLOAD_HREF}
                  download
                  className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-blue-600/30 transition-all hover:bg-blue-500 active:scale-[0.98] sm:w-auto"
                >
                  <Download className="h-4.5 w-4.5" />
                  Download extension
                </a>
                <Link
                  href={primaryHref}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950/40 px-6 py-3.5 text-sm font-semibold text-zinc-200 transition-all hover:border-zinc-600 hover:bg-zinc-900 active:scale-[0.98] sm:w-auto"
                >
                  {primaryLabel}
                </Link>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ───────────────────────── Footer ───────────────────────── */}
        <footer className="border-t border-zinc-800/70">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 py-10 sm:flex-row sm:px-8">
            <Logo href="/" size="sm" />
            <div className="flex items-center gap-7 text-sm text-zinc-400">
              <a href="#features" className="transition-colors hover:text-white">Features</a>
              <a href="#install" className="transition-colors hover:text-white">How it works</a>
              <Link href="/privacy" className="transition-colors hover:text-white">Privacy</Link>
              <Link href={primaryHref} className="transition-colors hover:text-white">
                {user ? 'Dashboard' : 'Sign in'}
              </Link>
            </div>
            <p className="text-xs text-zinc-600">Local-first · Your storage · © {new Date().getFullYear()} Reportr</p>
          </div>
        </footer>
      </div>
    </div>
  )
}

/* ─────────────────────────── Feature cluster ─────────────────────────── */
function FeatureCluster({
  label,
  features,
}: {
  label: string
  features: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }[]
}) {
  return (
    <Reveal>
      <div className="mb-5 flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{label}</span>
        <span className="h-px flex-1 bg-zinc-800" />
      </div>
      <div className="grid overflow-hidden rounded-2xl border border-zinc-800 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <div
            key={f.title}
            className="group border-b border-r border-zinc-800/70 bg-zinc-900/20 p-6 transition-colors last:border-r-0 hover:bg-zinc-900/60"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-blue-400 transition-colors group-hover:border-blue-500/40 group-hover:text-blue-300">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-white">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.body}</p>
          </div>
        ))}
      </div>
    </Reveal>
  )
}

/* ─────────────────────────── Hero mockup ─────────────────────────── */
function HeroMockup() {
  return (
    <div className="relative mx-auto max-w-4xl">
      {/* Browser window */}
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/60">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-950/60 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-zinc-700" />
          <span className="h-3 w-3 rounded-full bg-zinc-700" />
          <span className="h-3 w-3 rounded-full bg-zinc-700" />
          <div className="ml-3 flex h-7 flex-1 items-center rounded-md border border-zinc-800 bg-zinc-900 px-3 text-[11px] text-zinc-500">
            app.acme.com/checkout
          </div>
        </div>
        {/* Canvas */}
        <div className="relative aspect-[16/9] bg-gradient-to-br from-zinc-900 to-zinc-950">
          {/* Fake page content */}
          <div className="absolute inset-0 p-8">
            <div className="h-3 w-32 rounded-full bg-zinc-800" />
            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-3">
                <div className="h-24 rounded-xl border border-zinc-800 bg-zinc-900/60" />
                <div className="h-3 w-4/5 rounded-full bg-zinc-800" />
                <div className="h-3 w-3/5 rounded-full bg-zinc-800" />
                <div className="h-3 w-2/3 rounded-full bg-zinc-800" />
              </div>
              <div className="space-y-3">
                <div className="h-3 w-full rounded-full bg-zinc-800" />
                <div className="h-9 rounded-lg border border-rose-500/40 bg-rose-500/10" />
                <div className="h-9 rounded-lg bg-blue-600/80" />
              </div>
            </div>
          </div>

          {/* Selection marquee */}
          <div className="absolute right-[26%] top-[38%] h-24 w-40 rounded-md border-2 border-blue-500 bg-blue-500/10 shadow-[0_0_0_9999px_rgba(9,9,11,0.45)]">
            <span className="absolute -top-6 left-0 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              160 × 96
            </span>
            {['-left-1 -top-1', '-right-1 -top-1', '-left-1 -bottom-1', '-right-1 -bottom-1'].map((p) => (
              <span key={p} className={`absolute ${p} h-2 w-2 rounded-full border border-white bg-blue-500`} />
            ))}
          </div>

          {/* Annotation pin */}
          <div className="absolute left-[14%] top-[30%] flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white shadow-lg shadow-blue-600/40">1</span>
            <span className="rounded-lg border border-zinc-700 bg-zinc-950/90 px-2.5 py-1 text-[11px] text-zinc-300 shadow-lg">Button misaligned</span>
          </div>
        </div>
      </div>

      {/* Floating extension popup */}
      <div className="absolute -bottom-8 -right-4 hidden w-60 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl shadow-black/70 sm:block">
        <div className="flex items-center gap-2">
          <Logo href={null} size="sm" showWordmark={false} />
          <span className="text-sm font-semibold text-white">Reportr</span>
          <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Ready
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {[
            { icon: Camera, label: 'Visible' },
            { icon: ScrollText, label: 'Full page' },
            { icon: Crop, label: 'Area' },
          ].map((m) => (
            <div key={m.label} className="flex flex-col items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 py-2.5 text-zinc-400">
              <m.icon className="h-4 w-4" />
              <span className="text-[9px]">{m.label}</span>
            </div>
          ))}
        </div>
        <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-xs font-semibold text-white">
          <Video className="h-3.5 w-3.5" />
          Record screen
        </button>
      </div>
    </div>
  )
}
