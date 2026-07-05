"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ReportReplayViewer } from "../components/ReportReplayViewer";

interface RawEvent {
  type: number;
  data: { plugin?: any; payload?: any; href?: string };
  timestamp: number;
}

interface ReportDraft {
  status: "uploading" | "ready" | "error";
  videoUrl?: string;
  localVideoBase64?: string;
  events?: RawEvent[];
  recordingStartedAt?: number;
  workspaceId?: string;
  error?: string;
  authRequired?: boolean;
}

function useDraft(draftId: string | null) {
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [missing, setMissing] = useState(false);
  const ready = useRef(false);

  const poll = useCallback(() => {
    if (draftId) window.postMessage({ type: "REPORTR_GET_DRAFT", draftId }, "*");
  }, [draftId]);

  useEffect(() => {
    if (!draftId) { setMissing(true); return; }
    
    const handler = (ev: MessageEvent) => {
      if (ev.source !== window || ev.data?.type !== "REPORTR_DRAFT_RESULT") return;
      if (ev.data.draft) {
        setDraft(ev.data.draft as ReportDraft);
        setMissing(false);
        // Stop polling once the draft reaches a terminal state.
        if (ev.data.draft.status === "ready" || ev.data.draft.status === "error") {
          ready.current = true;
        }
      } else {
        setMissing(true);
      }
    };
    window.addEventListener("message", handler);
    poll();
    
    const t = setInterval(() => { if (!ready.current) poll(); }, 1500);
    return () => { window.removeEventListener("message", handler); clearInterval(t); };
  }, [draftId, poll]);

  const isTrulyMissing = missing && !draft;
  return { draft, missing: isTrulyMissing };
}

function NewReportInner() {
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draftId");

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { draft, missing } = useDraft(mounted ? draftId : null);

  if (!mounted) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center",
                    justifyContent: "center", background: "#fff" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #e5e7eb",
                      borderTopColor: "#111", borderRadius: "50%",
                      animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (missing) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center",
                    justifyContent: "center", background: "#fff", fontFamily: "system-ui" }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Draft not found</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Make sure the Reportr extension is installed and this page was opened by the extension.
          </p>
        </div>
      </div>
    );
  }

  if (draft?.status === "error") {
    const authRequired = draft.authRequired;
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center",
                    justifyContent: "center", background: "#fff", fontFamily: "system-ui" }}>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>{authRequired ? "🔒" : "⚠️"}</div>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            {authRequired ? "Session expired" : "Recording failed"}
          </h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: authRequired ? 20 : 0, lineHeight: 1.5 }}>
            {draft.error || "The screen capture didn't start, so nothing was recorded. Please try recording again."}
            {authRequired && " Your recording is saved locally — sign in, then record again to upload."}
          </p>
          {authRequired && (
            <a
              href="/dashboard"
              style={{ display: "inline-block", background: "#2563eb", color: "#fff",
                       fontSize: 14, fontWeight: 600, padding: "10px 20px", borderRadius: 10,
                       textDecoration: "none" }}
            >
              Sign in
            </a>
          )}
        </div>
      </div>
    );
  }

  const isUploading = !draft || draft.status !== "ready";
  const videoUrl = draft?.videoUrl || "";
  const localVideoBase64 = draft?.localVideoBase64;

  return (
    <ReportReplayViewer
      initialTitle="Untitled Recording"
      videoUrl={videoUrl}
      localVideoBase64={localVideoBase64}
      events={draft?.events || []}
      workspaceId={draft?.workspaceId}
      isDraft={true}
      isUploading={isUploading}
    />
  );
}

export default function NewReportPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center",
                    justifyContent: "center", background: "#fff" }}>
        <div style={{ width: 32, height: 32, border: "3px solid #e5e7eb",
                      borderTopColor: "#111", borderRadius: "50%",
                      animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <NewReportInner />
    </Suspense>
  );
}
