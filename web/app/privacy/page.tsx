import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '../components/Logo'

export const metadata: Metadata = {
  title: 'Privacy Policy · Reportr',
  description:
    'How the Reportr browser extension and web app collect, use, store, and protect your data.',
}

// Keep this in sync with the extension's actual behavior (see
// extension/src/content/monkeypatch.ts, recorder.ts, and background.ts).
const LAST_UPDATED = 'July 12, 2026'
const CONTACT_EMAIL = 'rohan.shah.design@gmail.com'

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg font-semibold text-white sm:text-xl">{title}</h2>
      <div className="mt-3 space-y-4 text-sm leading-relaxed text-zinc-400">{children}</div>
    </section>
  )
}

export default function PrivacyPolicyPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-zinc-950 text-zinc-100">
      {/* Ambient background to match the landing page */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-10%] h-[520px] w-[900px] max-w-full -translate-x-1/2 rounded-full bg-blue-600/12 blur-[130px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_60%,transparent_100%)]" />
      </div>

      <div className="relative z-10">
        {/* Nav */}
        <header className="sticky top-0 z-50 border-b border-zinc-800/70 bg-zinc-950/70 backdrop-blur-xl">
          <nav className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
            <Logo href="/" />
            <Link href="/" className="text-sm text-zinc-400 transition-colors hover:text-white">
              Back to home
            </Link>
          </nav>
        </header>

        <main className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-xs font-medium uppercase tracking-wider text-blue-400">Legal</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-zinc-500">Last updated: {LAST_UPDATED}</p>

          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm leading-relaxed text-zinc-300">
            Reportr is a bug-reporting and session-capture tool. It is{' '}
            <span className="font-medium text-white">local-first</span>: screenshots, recordings, and
            diagnostic data stay on your device until you explicitly choose to save a report to your
            workspace. We do not sell your data, and we do not use it for advertising.
          </div>

          <div className="mt-12 space-y-12">
            <Section id="scope" title="1. Who this applies to">
              <p>
                This policy covers the Reportr browser extension (the “Extension”) and the Reportr web
                dashboard at reportr.tools.rohan-shah.in (the “Dashboard”), together the “Service.”
                By installing the Extension or using the Dashboard, you agree to the practices
                described here.
              </p>
            </Section>

            <Section id="what-we-collect" title="2. What the Extension collects">
              <p>
                The Extension only captures data while you actively use one of its capture tools
                (screenshot, full-page capture, area selection, or screen/tab recording). It does not
                run silent background collection or track your browsing across sites for its own
                purposes. When a capture is active, it may collect:
              </p>
              <ul className="list-disc space-y-2 pl-5 marker:text-zinc-600">
                <li>
                  <span className="font-medium text-zinc-200">Screenshots and screen/tab recordings</span>{' '}
                  of the page or screen area you choose to capture, including tab audio for
                  recordings.
                </li>
                <li>
                  <span className="font-medium text-zinc-200">Page interaction data</span> — DOM
                  changes, clicks, and scrolls on the recorded tab — so a report can be replayed
                  step by step.
                </li>
                <li>
                  <span className="font-medium text-zinc-200">Console logs</span> emitted by the page
                  during the recording, to help diagnose errors.
                </li>
                <li>
                  <span className="font-medium text-zinc-200">Network request metadata</span> for
                  requests the recorded page makes — URL, method, status, timing, and a truncated
                  copy of request/response headers and bodies. Common sensitive headers (such as
                  <code className="mx-1 rounded bg-zinc-800 px-1 py-0.5 text-[12px] text-zinc-300">Authorization</code>
                  and
                  <code className="mx-1 rounded bg-zinc-800 px-1 py-0.5 text-[12px] text-zinc-300">Cookie</code>)
                  are redacted before the data leaves the page. Request and response bodies are
                  truncated and may still contain information you submit to the site you are
                  recording; only record pages whose contents you are comfortable including in the
                  report.
                </li>
                <li>
                  <span className="font-medium text-zinc-200">Account information</span> — your email,
                  user ID, and workspace membership — synced from the Dashboard so captures can be
                  attributed to your account and workspace.
                </li>
              </ul>
            </Section>

            <Section id="how-we-use" title="3. How we use it">
              <p>The captured data is used solely to provide the Service — specifically to:</p>
              <ul className="list-disc space-y-2 pl-5 marker:text-zinc-600">
                <li>build the bug report, screenshot, or session replay you are creating;</li>
                <li>let you review, annotate, and edit that report before saving it;</li>
                <li>
                  upload the report to your workspace storage when you choose to save it, so your
                  teammates can view it;
                </li>
                <li>authenticate you and associate reports with the correct workspace.</li>
              </ul>
              <p>
                We do <span className="font-medium text-white">not</span> sell your data, transfer it
                to third parties except as needed to run the Service (see Storage below), or use it
                for advertising, credit assessment, or any purpose unrelated to bug reporting.
              </p>
            </Section>

            <Section id="storage" title="4. Where your data is stored">
              <p>
                Captures are held locally in your browser&apos;s extension storage as drafts. Nothing
                is uploaded automatically. A report only leaves your device when you click{' '}
                <span className="font-medium text-zinc-200">“Save to Dashboard,”</span> at which point:
              </p>
              <ul className="list-disc space-y-2 pl-5 marker:text-zinc-600">
                <li>
                  media and report data are uploaded to the object storage configured for your
                  workspace (Cloudflare R2);
                </li>
                <li>
                  report metadata is stored in our database provider (Supabase), which also handles
                  authentication.
                </li>
              </ul>
              <p>
                These providers process data on our behalf to operate the Service. Drafts you never
                save are discarded and are not uploaded.
              </p>
            </Section>

            <Section id="permissions" title="5. Browser permissions">
              <p>
                The Extension requests broad host access (<code className="rounded bg-zinc-800 px-1 py-0.5 text-[12px] text-zinc-300">&lt;all_urls&gt;</code>)
                and tab, scripting, and screen/tab capture permissions because bug reports can be
                created on any website you visit. These permissions are used only to power the
                capture features described above and are exercised only when you initiate a capture.
              </p>
            </Section>

            <Section id="retention" title="6. Data retention and deletion">
              <p>
                Local drafts remain in your browser until you save or discard them, or until you
                remove the Extension. Saved reports remain in your workspace until you or a workspace
                admin deletes them. You can delete individual reports from the Dashboard at any time.
                To delete your account and associated data, contact us at the address below.
              </p>
            </Section>

            <Section id="children" title="7. Children">
              <p>
                The Service is not directed to children under 13, and we do not knowingly collect
                personal information from them.
              </p>
            </Section>

            <Section id="changes" title="8. Changes to this policy">
              <p>
                We may update this policy as the Service evolves. Material changes will be reflected
                by updating the “Last updated” date above. Continued use of the Service after an
                update constitutes acceptance of the revised policy.
              </p>
            </Section>

            <Section id="contact" title="9. Contact">
              <p>
                Questions about this policy or your data? Email us at{' '}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="font-medium text-blue-400 underline-offset-4 hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            </Section>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-zinc-800/70">
          <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row sm:px-8">
            <Logo href="/" size="sm" />
            <p className="text-xs text-zinc-600">
              Local-first · Your storage · © {new Date().getFullYear()} Reportr
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
