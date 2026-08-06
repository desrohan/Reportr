import Link from 'next/link'
import { redirect } from 'next/navigation'
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

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  // If an OAuth code lands on the site root (Supabase Site URL fallback when
  // redirect_to doesn't match the allow list), forward it to the callback
  // route so the session still gets established instead of dead-ending here.
  const { code } = await searchParams
  if (code) {
    redirect(`/auth/callback?code=${code}&next=/dashboard`)
  }

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
