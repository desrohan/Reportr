"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { saveReport } from "../actions";
import { ScreenshotAnnotator } from "./ScreenshotAnnotator";
import { uploadToStorage, dataUrlToBlob, proxyUrl, triggerDownload } from "../../../lib/reportMedia";

/* ═══════════════════  Types  ═══════════════════════════════════════════════ */

interface NetworkPayload {
  type?: string; url: string; method?: string; status?: number;
  duration?: number; error?: string; size?: number; contentType?: string;
  requestHeaders?: Record<string, string>; requestBody?: string;
  responseHeaders?: Record<string, string>; responseBody?: string;
}
interface ConsolePayload { level: string; message: string; }
interface ClickPayload { tagName: string; text: string; outerHTML: string; }

type Plugin = "network" | "console" | "click";
interface RawEvent {
  type: number;
  data: { plugin?: Plugin; payload?: any; href?: string };
  timestamp: number;
}

/* ═══════════════════  Helpers  ═════════════════════════════════════════════ */

const fmtMs = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const tsToOffset = (ts: number, start: number) => fmtMs(ts - start);

function urlName(u: string) {
  try { return new URL(u).pathname.split("/").filter(Boolean).pop() || u; }
  catch { return u.split("/").pop() || u; }
}
function urlDomain(u: string) {
  try { return new URL(u).hostname; } catch { return ""; }
}
function inferType(url: string, ct: string): string {
  const c = (ct || "").toLowerCase(); const ext = url.split("?")[0].split(".").pop()?.toLowerCase() || "";
  if (c.includes("javascript") || ext === "js" || ext === "mjs") return "js";
  if (c.includes("css") || ext === "css") return "css";
  if (c.includes("image") || ["png","jpg","jpeg","gif","svg","webp","ico"].includes(ext)) return "img";
  if (c.includes("font") || ["woff","woff2","ttf","otf","eot"].includes(ext)) return "font";
  if (c.includes("html") || ext === "html") return "doc";
  return "xhr";
}
function fmtSize(b: number) {
  if (!b) return "–";
  if (b < 1024) return `${b} B`;
  return `${(b / 1024).toFixed(1)} KB`;
}
function tryPrettyJson(s: string) {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}

/* ═══════════════════  Console helpers  ═════════════════════════════════════ */

type ConsoleCat = "nav" | "netError" | "activity" | "console";
interface ConsoleEntry { id: string; ts: number; cat: ConsoleCat; raw: RawEvent; }

function buildConsoleLog(events: RawEvent[], start: number): ConsoleEntry[] {
  const out: ConsoleEntry[] = [];
  events.forEach((e, i) => {
    if (e.timestamp < start) return;
    let cat: ConsoleCat | null = null;
    if (e.type === 4) cat = "nav";
    else if (e.data?.plugin === "click") cat = "activity";
    else if (e.data?.plugin === "console") cat = "console";
    else if (e.data?.plugin === "network") {
      const p = e.data.payload as NetworkPayload;
      if (p.error || (p.status && p.status >= 400)) cat = "netError";
    }
    if (cat) out.push({ id: String(i), ts: e.timestamp, cat, raw: e });
  });
  return out;
}

/* ═══════════════════  Network helpers  ═════════════════════════════════════ */

interface NetRow extends NetworkPayload { ts: number; idx: number; resourceType: string; }

function buildNetRows(events: RawEvent[]): NetRow[] {
  let idx = 0;
  return events
    .filter(e => e.data?.plugin === "network")
    .map(e => {
      const p = e.data.payload as NetworkPayload;
      idx++;
      return {
        ...p, ts: e.timestamp, idx,
        resourceType: inferType(p.url || "", p.contentType || ""),
      };
    });
}

const NET_FILTERS = ["All", "Fetch/XHR"] as const;
const mono = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

/* ═══════════════════  Sub-components  ══════════════════════════════════════ */

function StatusBadge({ uploading }: { uploading: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5,
                   fontSize: 12, fontWeight: 500, padding: "2px 10px", borderRadius: 20,
                   color: uploading ? "#6b7280" : "#16a34a",
                   background: uploading ? "#f3f4f6" : "#f0fdf4" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block",
                     background: uploading ? "#9ca3af" : "#16a34a" }} />
      {uploading ? "Processing…" : "Ready"}
    </span>
  );
}

function ConsoleRow({ entry, start, onSeek }: {
  entry: ConsoleEntry; start: number; onSeek: (ts: number) => void
}) {
  const Icons: Record<ConsoleCat, { icon: string; color: string }> = {
    nav:      { icon: "●", color: "#2563eb" },
    netError: { icon: "↗", color: "#dc2626" },
    activity: { icon: "↖", color: "#6b7280" },
    console:  { icon: "›", color: "#6b7280" },
  };
  const meta = Icons[entry.cat];
  let text = "";
  const p = entry.raw.data?.payload;
  if (entry.cat === "nav") text = `Navigated to ${entry.raw.data?.href ?? "–"}`;
  else if (entry.cat === "activity") {
    const cp = p as ClickPayload;
    text = `Clicked ${(cp.outerHTML || `<${cp.tagName}>`).slice(0, 120)}`;
  } else if (entry.cat === "netError") {
    const np = p as NetworkPayload;
    text = np.error ? `${np.method} ${np.url} — ${np.error}` : `${np.method} ${np.url} ${np.status}`;
  } else {
    const cp = p as ConsolePayload;
    text = cp?.message || "";
  }

  const levelColors: Record<string, string> = { error: "#dc2626", warn: "#d97706", info: "#2563eb" };
  const iconColor = entry.cat === "console" && p
    ? (levelColors[(p as ConsolePayload).level] || meta.color) : meta.color;

  return (
    <div onClick={() => onSeek(entry.ts)}
         style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 16px",
                  borderBottom: "1px solid #f3f4f6", cursor: "pointer", fontSize: 12, lineHeight: 1.5 }}
         onMouseEnter={e => (e.currentTarget.style.background = "#fafafa")}
         onMouseLeave={e => (e.currentTarget.style.background = "")}>
      <span style={{ flexShrink: 0, fontFamily: mono, fontSize: 11, color: "#2563eb",
                     textDecoration: "underline", whiteSpace: "nowrap", paddingTop: 1 }}>
        {tsToOffset(entry.ts, start)}
      </span>
      <span style={{ flexShrink: 0, width: 14, textAlign: "center", fontSize: 11,
                     color: iconColor, paddingTop: 1 }}>{meta.icon}</span>
      <span style={{ fontFamily: mono, fontSize: 11, color: "#374151",
                     wordBreak: "break-all", lineHeight: 1.55 }}>{text}</span>
    </div>
  );
}

function NetworkRowExpanded({ row }: { row: NetRow }) {
  const [tab, setTab] = useState<"headers" | "request" | "response">("headers");

  const s_tab = { padding: "6px 12px", fontSize: 11, fontWeight: 500 as const, cursor: "pointer" as const,
                  background: "none", border: "none", borderBottom: "2px solid transparent" };
  const s_tabActive = { ...s_tab, borderBottom: "2px solid #111", color: "#111" };
  const s_kv = { display: "flex" as const, gap: 8, padding: "3px 0", fontSize: 11,
                 borderBottom: "1px solid #f9fafb" };

  const reqH = row.requestHeaders || {};
  const resH = row.responseHeaders || {};

  return (
    <div style={{ background: "#fafafa", borderBottom: "2px solid #e5e7eb", padding: "0 12px 12px" }}>
      <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", marginBottom: 8 }}>
        {(["headers", "request", "response"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
                  style={tab === t ? s_tabActive : { ...s_tab, color: "#6b7280" }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "headers" && (
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 4 }}>General</div>
            <div style={s_kv}><span style={{ color: "#6b7280", minWidth: 100 }}>URL</span>
              <span style={{ fontFamily: mono, fontSize: 11, wordBreak: "break-all" }}>{row.url}</span></div>
            <div style={s_kv}><span style={{ color: "#6b7280", minWidth: 100 }}>Method</span>
              <span>{row.method}</span></div>
            <div style={s_kv}><span style={{ color: "#6b7280", minWidth: 100 }}>Status</span>
              <span style={{ color: (row.status || 0) >= 400 ? "#dc2626" : "#16a34a" }}>{row.status ?? "–"}</span></div>
            <div style={s_kv}><span style={{ color: "#6b7280", minWidth: 100 }}>Content-Type</span>
              <span>{row.contentType || "–"}</span></div>
          </div>
          {Object.keys(resH).length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Response Headers</div>
              {Object.entries(resH).map(([k, v]) => (
                <div key={k} style={s_kv}>
                  <span style={{ color: "#6b7280", minWidth: 100, fontFamily: mono }}>{k}</span>
                  <span style={{ fontFamily: mono, wordBreak: "break-all" }}>{v}</span>
                </div>
              ))}
            </div>
          )}
          {Object.keys(reqH).length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Request Headers</div>
              {Object.entries(reqH).map(([k, v]) => (
                <div key={k} style={s_kv}>
                  <span style={{ color: "#6b7280", minWidth: 100, fontFamily: mono }}>{k}</span>
                  <span style={{ fontFamily: mono, wordBreak: "break-all" }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "request" && (
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          {row.requestBody ? (
            <pre style={{ fontFamily: mono, fontSize: 11, whiteSpace: "pre-wrap",
                          wordBreak: "break-all", color: "#374151", margin: 0 }}>
              {tryPrettyJson(row.requestBody)}
            </pre>
          ) : <span style={{ fontSize: 12, color: "#9ca3af" }}>No request body</span>}
        </div>
      )}

      {tab === "response" && (
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          {row.responseBody ? (
            <pre style={{ fontFamily: mono, fontSize: 11, whiteSpace: "pre-wrap",
                          wordBreak: "break-all", color: "#374151", margin: 0 }}>
              {tryPrettyJson(row.responseBody)}
            </pre>
          ) : <span style={{ fontSize: 12, color: "#9ca3af" }}>No response body</span>}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════  Main Component  ═════════════════════════════════════ */

interface ReportReplayViewerProps {
  initialTitle: string;
  videoUrl: string;
  localVideoBase64?: string;
  events: RawEvent[];
  workspaceId?: string;
  isDraft?: boolean;
  isUploading?: boolean;
}

export function ReportReplayViewer({
  initialTitle,
  videoUrl,
  localVideoBase64,
  events,
  workspaceId,
  isDraft = false,
  isUploading = false,
}: ReportReplayViewerProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [title, setTitle] = useState(initialTitle);
  const [currentTime, setCurrentTime] = useState(0);
  const [tab, setTab] = useState<"console" | "network">("console");
  const [filter, setFilter] = useState("");
  const [netTypeFilter, setNetTypeFilter] = useState<string>("All");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [categories, setCategories] = useState<Set<ConsoleCat>>(new Set(["nav", "netError", "activity", "console"]));
  const [expandedNet, setExpandedNet] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isImage = useMemo(() => {
    const url = localVideoBase64 || videoUrl || '';
    return url.startsWith('data:image/') || url.includes('.png') || url.includes('.jpg') || url.includes('.jpeg') || url.includes('screenshot.png');
  }, [videoUrl, localVideoBase64]);

  // Seek to hash timestamp on load
  useEffect(() => {
    if (typeof window === "undefined" || !videoRef.current) return;
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#t=")) {
        const seconds = parseInt(hash.replace("#t=", ""), 10);
        if (!isNaN(seconds) && videoRef.current) {
          videoRef.current.currentTime = seconds;
        }
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    
    const videoElement = videoRef.current;
    const onLoadedMetadata = () => {
      handleHashChange();
    };
    
    videoElement.addEventListener("loadedmetadata", onLoadedMetadata);
    if (videoElement.readyState >= 1) {
      handleHashChange();
    }

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      videoElement.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [videoUrl]);

  // In rrweb, the recording starts at the first event's timestamp
  const start = useMemo(() => {
    if (events.length === 0) return 0;
    return Math.min(...events.map(e => e.timestamp));
  }, [events]);

  const consoleLog = useMemo(() => buildConsoleLog(events, start), [events, start]);
  const netRows = useMemo(() => buildNetRows(events), [events]);

  const filteredConsole = useMemo(() => consoleLog.filter(e => {
    if (!categories.has(e.cat)) return false;
    if (!filter) return true;
    return JSON.stringify(e.raw.data?.payload ?? "").toLowerCase().includes(filter.toLowerCase());
  }), [consoleLog, categories, filter]);

  const filteredNet = useMemo(() => netRows.filter(r => {
    if (errorsOnly && !r.error && (r.status ?? 0) < 400) return false;
    if (netTypeFilter !== "All" && netTypeFilter === "Fetch/XHR" &&
        r.resourceType !== "xhr" && r.type !== "fetch" && r.type !== "xhr") return false;
    if (filter && !r.url?.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  }), [netRows, netTypeFilter, errorsOnly, filter]);

  const seekTo = useCallback((ts: number) => {
    if (!videoRef.current || !start) return;
    videoRef.current.currentTime = Math.max(0, (ts - start) / 1000);
    videoRef.current.play().catch(() => {});
  }, [start]);

  const toggleCat = (c: ConsoleCat) => setCategories(prev => {
    const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n;
  });
  
  const toggleNetRow = (idx: number) => setExpandedNet(prev => {
    const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n;
  });

  const generateVideoThumbnail = (videoEl: HTMLVideoElement, targetWidth = 320): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      const width = videoEl.videoWidth || 640;
      const height = videoEl.videoHeight || 360;
      const scale = targetWidth / width;
      canvas.width = targetWidth;
      canvas.height = height * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas context failed"));

      try {
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
          "image/jpeg",
          0.7
        );
      } catch (err) {
        reject(err);
      }
    });
  };

  const resolveVideoThumbnailUrl = async (): Promise<string | undefined> => {
    if (!videoRef.current) return undefined;
    try {
      const blob = await generateVideoThumbnail(videoRef.current, 320);
      return await uploadToStorage(blob, "thumbnail.jpg", "image/jpeg", workspaceId);
    } catch (e) {
      console.error("Failed to generate video thumbnail:", e);
      return undefined;
    }
  };

  const handleSave = async () => {
    if (isUploading) {
      alert("The recording is still processing. Please wait a moment.");
      return;
    }
    if (!workspaceId) {
      alert("Workspace context is missing. Make sure you recorded using the extension with a selected workspace.");
      return;
    }
    if (!videoUrl && !localVideoBase64) {
      alert("No recording to save.");
      return;
    }
    setIsSaving(true);
    try {
      // Upload the local recording to storage now. Drafts are kept local until
      // this moment, so saving is what actually puts the file in R2.
      let finalUrl = videoUrl;
      if (!finalUrl && localVideoBase64) {
        const blob = await dataUrlToBlob(localVideoBase64);
        finalUrl = await uploadToStorage(blob, "recording.webm", "video/webm", workspaceId);
      }
      const thumbnailUrl = await resolveVideoThumbnailUrl();
      await saveReport({
        workspaceId,
        title,
        videoUrl: finalUrl,
        thumbnailUrl,
        events,
      });
      router.push("/dashboard");
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save report: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    if (localVideoBase64) {
      triggerDownload(localVideoBase64, "recording.webm");
    } else if (videoUrl) {
      // Cross-origin R2 ignores the download attribute, so route through the
      // same-origin proxy which sets Content-Disposition: attachment.
      triggerDownload(proxyUrl(videoUrl, { download: "recording.webm" }), "recording.webm");
    }
  };

  // A recorded video can't be placed on the clipboard (browsers have no video
  // clipboard type), so "copy" copies the direct file link instead.
  const handleCopyLink = async () => {
    if (!videoUrl) return;
    try {
      await navigator.clipboard.writeText(videoUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  if (isImage) {
    return (
      <ScreenshotAnnotator
        initialTitle={initialTitle}
        videoUrl={videoUrl}
        localVideoBase64={localVideoBase64}
        workspaceId={workspaceId}
        isDraft={isDraft}
        isUploading={isUploading}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh",
                  background: "#fff", fontFamily: "system-ui, -apple-system, sans-serif", color: "#111" }}>

      {/* ─── Header ─── */}
      <header style={{ height: 48, borderBottom: "1px solid #e5e7eb", display: "flex",
                       alignItems: "center", justifyContent: "space-between", padding: "0 20px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3, cursor: "pointer" }} onClick={() => router.push("/dashboard")}>Reportr</span>
          {isDraft && <StatusBadge uploading={isUploading} />}
          {isDraft ? (
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                outline: "none",
                padding: "4px 8px",
                minWidth: 240,
                background: "#fafafa"
              }}
              placeholder="Enter report title..."
            />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", borderLeft: "1px solid #e5e7eb", paddingLeft: 12 }}>{title}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => router.push("/dashboard")}
            style={{ fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 6,
                     border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", color: "#374151" }}
          >
            {isDraft ? "Cancel" : "Back to Dashboard"}
          </button>
          
          {isDraft && (
            <button
              onClick={handleSave}
              disabled={isSaving || isUploading}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "5px 14px",
                borderRadius: 6,
                background: (isSaving || isUploading) ? "#9ca3af" : "#2563eb",
                color: "#fff",
                border: "none",
                cursor: (isSaving || isUploading) ? "not-allowed" : "pointer"
              }}
            >
              {isSaving ? "Saving..." : "Save to Dashboard"}
            </button>
          )}

          {!isDraft && (
            <button onClick={() => {
              const url = window.location.href.split('#')[0] + `#t=${Math.floor(currentTime)}`;
              navigator.clipboard.writeText(url);
              setCopied(true); setTimeout(() => setCopied(false), 2000);
            }} style={{ fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 6,
                        border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", color: "#374151" }}>
              🔗 {copied ? "Copied!" : `Share at ${fmtMs(currentTime * 1000)}`}
            </button>
          )}
          {videoUrl && (
            <button onClick={handleCopyLink}
               style={{ fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 6,
                        border: "1px solid #d1d5db", background: "#fff", cursor: "pointer",
                        color: "#374151" }}>
              {copiedLink ? "Link copied!" : "⧉ Copy link"}
            </button>
          )}
          {(videoUrl || localVideoBase64) && (
            <button onClick={handleDownload}
               style={{ fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 6,
                        border: "1px solid #d1d5db", background: "#fff", cursor: "pointer",
                        color: "#374151", display: "flex", alignItems: "center" }}>
              ↓ Download
            </button>
          )}
        </div>
      </header>

      {/* ─── Body ─── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Video panel */}
        <div style={{ flex: "0 0 60%", background: "#0d0d0d", display: "flex",
                      alignItems: "center", justifyContent: "center" }}>
          {(videoUrl || localVideoBase64) ? (
            isImage ? (
              <img src={localVideoBase64 || videoUrl} alt="Screenshot Capture"
                   style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
            ) : (
              <video ref={videoRef} src={localVideoBase64 || videoUrl} controls
                     onTimeUpdate={e => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
                     style={{ width: "100%", maxHeight: "100%", display: "block" }} />
            )
          ) : (
            <div style={{ textAlign: "center", color: "#666" }}>
              <div style={{ width: 40, height: 40, margin: "0 auto 12px",
                            border: "3px solid #333", borderTopColor: "#fff",
                            borderRadius: "50%", animation: "spin .7s linear infinite" }} />
              <p style={{ fontSize: 13 }}>Processing media…</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ flex: 1, borderLeft: "1px solid #e5e7eb", display: "flex",
                      flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", padding: "0 16px", flexShrink: 0 }}>
            {(["console", "network"] as const).map(t => {
              const cnt = t === "console" ? consoleLog.length : netRows.length;
              const hasErrors = t === "network" && netRows.some(r => r.error || (r.status && r.status >= 400));
              return (
                <button key={t} onClick={() => setTab(t)}
                        style={{ padding: "10px 14px 8px", fontSize: 13, fontWeight: 500, background: "none",
                                 border: "none", cursor: "pointer", marginRight: 4, position: "relative",
                                 borderBottom: tab === t ? "2px solid #111" : "2px solid transparent",
                                 color: tab === t ? "#111" : "#6b7280", textTransform: "capitalize" }}>
                  {t}
                  {hasErrors && (
                    <span style={{ position: "absolute", top: 8, right: 2, width: 6, height: 6,
                                   borderRadius: "50%", background: "#dc2626" }} />
                  )}
                  {cnt > 0 && (
                    <span style={{ marginLeft: 5, fontSize: 10, background: tab === t ? "#111" : "#e5e7eb",
                                   color: tab === t ? "#fff" : "#6b7280", borderRadius: 10,
                                   padding: "1px 6px" }}>{cnt}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filter */}
          <div style={{ padding: "8px 16px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#9ca3af", fontSize: 13 }}>🔍</span>
              <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter"
                     style={{ flex: 1, padding: "5px 8px", fontSize: 12, border: "1px solid #e5e7eb",
                              borderRadius: 6, outline: "none", fontFamily: "inherit", background: "#fafafa" }} />
              {tab === "network" && (
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11,
                                color: "#6b7280", cursor: "pointer", whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={errorsOnly}
                         onChange={e => setErrorsOnly(e.target.checked)} />
                  Errors only
                </label>
              )}
            </div>
          </div>

          {/* ─── Console tab ─── */}
          {tab === "console" && (
            <>
              <div style={{ display: "flex", gap: 6, padding: "8px 16px",
                            borderBottom: "1px solid #f3f4f6", flexShrink: 0, flexWrap: "wrap" }}>
                {([
                  { cat: "nav" as ConsoleCat, label: "Page navigations", dot: "#2563eb" },
                  { cat: "netError" as ConsoleCat, label: "Network errors", dot: "#dc2626" },
                  { cat: "activity" as ConsoleCat, label: "User activity", dot: "#6b7280" },
                  { cat: "console" as ConsoleCat, label: "Console logs", dot: "#9ca3af" },
                ]).map(({ cat, label, dot }) => (
                  <button key={cat} onClick={() => toggleCat(cat)}
                          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11,
                                   padding: "3px 10px", borderRadius: 14, cursor: "pointer",
                                   border: `1px solid ${categories.has(cat) ? dot : "#e5e7eb"}`,
                                   background: categories.has(cat) ? dot + "15" : "#fff",
                                   color: categories.has(cat) ? dot : "#9ca3af", fontWeight: 500 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block",
                                   background: categories.has(cat) ? dot : "#d1d5db" }} />
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {filteredConsole.length === 0 ? (
                  <div style={{ padding: "40px 16px", textAlign: "center", fontSize: 13, color: "#9ca3af" }}>
                    {events.length === 0 ? "No events captured yet." : "No events match the current filter."}
                  </div>
                ) : filteredConsole.map(entry => (
                  <ConsoleRow key={entry.id} entry={entry} start={start} onSeek={seekTo} />
                ))}
              </div>
            </>
          )}

          {/* ─── Network tab ─── */}
          {tab === "network" && (
            <>
              <div style={{ display: "flex", gap: 6, padding: "8px 16px",
                            borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
                {NET_FILTERS.map(f => (
                  <button key={f} onClick={() => setNetTypeFilter(f)}
                          style={{ fontSize: 11, padding: "4px 12px", borderRadius: 6, fontWeight: 500,
                                   cursor: "pointer",
                                   border: netTypeFilter === f ? "1px solid #111" : "1px solid #e5e7eb",
                                   background: netTypeFilter === f ? "#111" : "#fff",
                                   color: netTypeFilter === f ? "#fff" : "#6b7280" }}>
                    {f}
                  </button>
                ))}
              </div>

              <div style={{ flex: 1, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                  <thead>
                    <tr style={{ background: "#fafafa", position: "sticky", top: 0, zIndex: 1 }}>
                      {[
                        { label: "#", w: 32 }, { label: "Name", w: undefined },
                        { label: "Method", w: 60 }, { label: "Status", w: 52 },
                        { label: "Domain", w: 100 }, { label: "Type", w: 48 },
                        { label: "Size", w: 56 }, { label: "Time", w: 60 },
                      ].map(h => (
                        <th key={h.label} style={{ padding: "6px 8px", textAlign: "left",
                                                   borderBottom: "1px solid #e5e7eb", fontWeight: 600,
                                                   color: "#6b7280", fontSize: 10, whiteSpace: "nowrap",
                                                   width: h.w }}>
                          {h.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNet.length === 0 ? (
                      <tr><td colSpan={8} style={{ padding: "40px 8px", textAlign: "center",
                                                    color: "#9ca3af", fontSize: 13 }}>
                        No network requests recorded.
                      </td></tr>
                    ) : filteredNet.map(r => {
                      const isErr = Boolean(r.error) || (r.status && r.status >= 400);
                      const expanded = expandedNet.has(r.idx);
                      return (
                        <tr key={r.idx} style={{ cursor: "pointer" }}>
                          <td colSpan={8} style={{ padding: 0, border: "none" }}>
                            <div onClick={() => toggleNetRow(r.idx)}
                                 style={{ display: "flex", borderBottom: expanded ? "none" : "1px solid #f3f4f6" }}
                                 onMouseEnter={e => (e.currentTarget.style.background = "#fafafa")}
                                 onMouseLeave={e => (e.currentTarget.style.background = "")}>
                              <span style={{ width: 32, padding: "6px 8px", fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>
                                {r.idx}
                              </span>
                              <span style={{ flex: 1, padding: "6px 8px", fontFamily: mono, fontSize: 11,
                                             overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                             color: "#374151" }} title={r.url}>
                                {urlName(r.url)}
                              </span>
                              <span style={{ width: 60, padding: "6px 8px", fontSize: 11, fontFamily: mono,
                                             fontWeight: 600, color: isErr ? "#dc2626" : "#374151", flexShrink: 0 }}>
                                {r.method || "–"}
                              </span>
                              <span style={{ width: 52, padding: "6px 8px", fontSize: 11, fontWeight: 600,
                                             color: isErr ? "#dc2626" : "#16a34a", flexShrink: 0 }}>
                                {r.error ? "ERR" : (r.status ?? "–")}
                              </span>
                              <span style={{ width: 100, padding: "6px 8px", fontSize: 10, color: "#6b7280",
                                             overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
                                {urlDomain(r.url)}
                              </span>
                              <span style={{ width: 48, padding: "6px 8px", fontSize: 10, color: "#6b7280", flexShrink: 0 }}>
                                {r.resourceType}
                              </span>
                              <span style={{ width: 56, padding: "6px 8px", fontSize: 10, color: "#6b7280",
                                             fontFamily: mono, flexShrink: 0 }}>
                                {fmtSize(r.size || 0)}
                              </span>
                              <span style={{ width: 60, padding: "6px 8px", fontSize: 11, color: "#2563eb",
                                             fontFamily: mono, textDecoration: "underline", flexShrink: 0,
                                             cursor: "pointer" }}
                                    onClick={e => { e.stopPropagation(); seekTo(r.ts); }}>
                                {tsToOffset(r.ts, start)}
                              </span>
                            </div>
                            {expanded && <NetworkRowExpanded row={r} />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
