"use client";

import {
  useEffect, useRef, useState, useCallback, useMemo, Suspense,
} from "react";
import { useSearchParams } from "next/navigation";

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
interface ReportDraft {
  status: "uploading" | "ready";
  videoUrl?: string; localVideoBase64?: string;
  events?: RawEvent[]; recordingStartedAt?: number;
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

/* ═══════════════════  chrome.storage bridge  ══════════════════════════════ */

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
        setMissing(false); // Clear missing state if it was transient
        if (ev.data.draft.status === "ready") ready.current = true;
      } else {
        // Only mark as missing if we still don't have a draft. But polling continues!
        setMissing(true);
      }
    };
    window.addEventListener("message", handler);
    poll();
    
    const t = setInterval(() => { if (!ready.current) poll(); }, 1500);
    return () => { window.removeEventListener("message", handler); clearInterval(t); };
  }, [draftId, poll]);

  // Determine if it's truly missing vs just loading initially
  const isTrulyMissing = missing && !draft;

  return { draft, missing: isTrulyMissing };
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

/* ═══════════════════  Inline CSS helpers  ══════════════════════════════════ */

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
      {uploading ? "Uploading…" : "Ready"}
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

/* ═══════════════════  Main component  ═════════════════════════════════════ */

function NewReportInner() {
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draftId");

  // Fix hydration — only render after mount so server/client output matches
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { draft, missing } = useDraft(mounted ? draftId : null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [tab, setTab] = useState<"console" | "network">("console");
  const [filter, setFilter] = useState("");
  const [netTypeFilter, setNetTypeFilter] = useState<string>("All");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [categories, setCategories] = useState<Set<ConsoleCat>>(new Set(["nav","netError","activity","console"]));
  const [expandedNet, setExpandedNet] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  const start = draft?.recordingStartedAt ?? 0;
  const allEvents = draft?.events ?? [];
  const isUploading = !draft || draft.status !== "ready";
  // Always prefer local Base64 for the video player to save bandwidth and bypass adblockers
  const videoSrc = draft?.localVideoBase64 || draft?.videoUrl;
  const shareUrl = draft?.videoUrl ?? null;

  const consoleLog = useMemo(() => buildConsoleLog(allEvents, start), [allEvents, start]);
  const netRows = useMemo(() => buildNetRows(allEvents), [allEvents]);

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

  // Pre-mount loading state (matches server render = no hydration mismatch)
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

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh",
                  background: "#fff", fontFamily: "system-ui, -apple-system, sans-serif", color: "#111" }}>

      {/* ─── Header ─── */}
      <header style={{ height: 48, borderBottom: "1px solid #e5e7eb", display: "flex",
                       alignItems: "center", justifyContent: "space-between", padding: "0 20px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>Reportr</span>
          <StatusBadge uploading={isUploading} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {shareUrl && (
            <button onClick={() => {
              navigator.clipboard.writeText(`${shareUrl}#t=${Math.floor(currentTime)}`);
              setCopied(true); setTimeout(() => setCopied(false), 2000);
            }} style={{ fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 6,
                        border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", color: "#374151" }}>
              🔗 {copied ? "Copied!" : `Share at ${fmtMs(currentTime * 1000)}`}
            </button>
          )}
          {shareUrl && (
            <a href={shareUrl} download="recording.webm"
               style={{ fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 6,
                        border: "1px solid #d1d5db", background: "#fff", textDecoration: "none",
                        color: "#374151", display: "flex", alignItems: "center" }}>
              ↓ Download
            </a>
          )}
        </div>
      </header>

      {/* ─── Body ─── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Video panel */}
        <div style={{ flex: "0 0 60%", background: "#0d0d0d", display: "flex",
                      alignItems: "center", justifyContent: "center" }}>
          {videoSrc ? (
            <video ref={videoRef} src={videoSrc} controls
                   onTimeUpdate={e => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
                   style={{ width: "100%", maxHeight: "100%", display: "block" }} />
          ) : (
            <div style={{ textAlign: "center", color: "#666" }}>
              <div style={{ width: 40, height: 40, margin: "0 auto 12px",
                            border: "3px solid #333", borderTopColor: "#fff",
                            borderRadius: "50%", animation: "spin .7s linear infinite" }} />
              <p style={{ fontSize: 13 }}>Processing video…</p>
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
                    {consoleLog.length === 0 ? "No events captured yet." : "No events match the current filter."}
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

/* ═══════════════════  Root export  ═════════════════════════════════════════ */

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
