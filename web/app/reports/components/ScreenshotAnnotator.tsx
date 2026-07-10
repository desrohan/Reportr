"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MousePointer2, Undo2, Redo2, Trash2, Pen, Square, ArrowUpRight, Type } from "lucide-react";
import {
  Tool, Handle, SWATCHES, Annotation, arrowHead,
  annotationBBox, translateAnnotation, resizeAnnotation, hitTest,
} from "../../../lib/annotations";
import { flattenAnnotations } from "../../../lib/flattenAnnotations";
import { saveReport } from "../actions";

interface ScreenshotAnnotatorProps {
  initialTitle: string;
  videoUrl: string;
  localVideoBase64?: string;
  workspaceId?: string;
  isDraft?: boolean;
  isUploading?: boolean;
}

const btn = (active: boolean) => ({
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 30, height: 30, borderRadius: 7, cursor: "pointer",
  border: "1px solid " + (active ? "#2563eb" : "transparent"),
  background: active ? "#eff6ff" : "transparent",
  color: active ? "#2563eb" : "#e5e7eb",
});

const divider = { width: 1, height: 20, background: "#565c6a", margin: "0 8px" };

export function ScreenshotAnnotator({
  initialTitle, videoUrl, localVideoBase64, workspaceId, isDraft = false, isUploading = false,
}: ScreenshotAnnotatorProps) {
  const router = useRouter();
  const imgRef = useRef<HTMLImageElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [title, setTitle] = useState(initialTitle);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState(SWATCHES[0]);
  const [fontSize, setFontSize] = useState(28); // default size for new text
  const [imgLoaded, setImgLoaded] = useState(false);

  // Annotation state + undo/redo history (full snapshots, so every change —
  // add, move, resize, edit, delete — is a single undoable step).
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [past, setPast] = useState<Annotation[][]>([]);
  const [future, setFuture] = useState<Annotation[][]>([]);

  const [draft, setDraft] = useState<Annotation | null>(null); // shape being drawn
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); // text being re-edited

  const drawing = useRef(false);
  // Active manipulation (move/resize) for the select tool.
  const dragRef = useRef<{
    id: string; mode: "move" | "resize"; handle?: Handle;
    start: { x: number; y: number };
    startShape: Annotation; startAnnotations: Annotation[];
    moved: boolean; pushed: boolean;
  } | null>(null);

  const STROKE = 4;

  const src = localVideoBase64 || videoUrl;
  const editable = isDraft && imgLoaded;

  const selected = tool === "select" && selectedId ? annotations.find((a) => a.id === selectedId) : undefined;
  const selectedText = selected && selected.kind === "text" ? selected : undefined;

  // Screen-px <-> natural-px scale (image is drawn with object-fit: contain).
  const getScale = () => {
    const img = imgRef.current;
    return img && img.naturalWidth ? img.clientWidth / img.naturalWidth : 1;
  };

  // Focus the text box AFTER the current event-loop tick. Focusing during the
  // mousedown that created it (e.g. via autoFocus) makes the browser's default
  // mousedown focus handling immediately blur it — the textarea would flash and
  // vanish. Deferring focuses it once the click is fully processed.
  const hasTextDraft = !!textDraft;
  useEffect(() => {
    if (!hasTextDraft) return;
    const id = setTimeout(() => textareaRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [hasTextDraft]);

  // Leaving the select tool clears the selection.
  useEffect(() => { if (tool !== "select") setSelectedId(null); }, [tool]);

  // Delete/Backspace removes the selected shape (undoable).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tool !== "select" || !selectedId) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        commit(annotations.filter((a) => a.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selectedId, annotations, past]);

  const uid = () => Math.random().toString(36).slice(2);

  // Maps screen coordinates to the image's natural pixel coordinates via the SVG CTM.
  const clientToNatural = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const toNatural = (e: React.PointerEvent) => clientToNatural(e.clientX, e.clientY);

  // ---- history ---------------------------------------------------------------
  const commit = (next: Annotation[]) => {
    setPast([...past, annotations]);
    setFuture([]);
    setAnnotations(next);
  };
  const undo = () => {
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([annotations, ...future]);
    setAnnotations(prev);
    setSelectedId(null);
  };
  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(future.slice(1));
    setPast([...past, annotations]);
    setAnnotations(next);
    setSelectedId(null);
  };
  const clearAll = () => {
    if (annotations.length) commit([]);
    setSelectedId(null);
  };

  // ---- drawing (pen / rect / arrow / text) -----------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    if (!editable) return;

    if (tool === "select") { selectPointerDown(e); return; }

    if (tool === "text") {
      // If an editor is already open, this click just moves focus away — let the
      // textarea's onBlur commit it; don't overwrite textDraft (that would make
      // the blur handler see an empty value and discard the typed text).
      if (textDraft) return;
      const { x, y } = toNatural(e);
      setTextDraft({ x, y, value: "" });
      return;
    }

    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const { x, y } = toNatural(e);
    if (tool === "pen") setDraft({ id: uid(), kind: "pen", color, width: STROKE, points: [{ x, y }] });
    else if (tool === "rect") setDraft({ id: uid(), kind: "rect", color, width: STROKE, x, y, w: 0, h: 0 });
    else if (tool === "arrow") setDraft({ id: uid(), kind: "arrow", color, width: STROKE, x1: x, y1: y, x2: x, y2: y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (tool === "select") { selectPointerMove(e); return; }
    if (!drawing.current || !draft) return;
    const { x, y } = toNatural(e);
    if (draft.kind === "pen") setDraft({ ...draft, points: [...draft.points, { x, y }] });
    else if (draft.kind === "rect") setDraft({ ...draft, w: x - draft.x, h: y - draft.y });
    else if (draft.kind === "arrow") setDraft({ ...draft, x2: x, y2: y });
  };

  const onPointerUp = () => {
    if (tool === "select") { selectPointerUp(); return; }
    if (!drawing.current) return;
    drawing.current = false;
    if (draft) {
      const keep =
        (draft.kind === "pen" && draft.points.length > 1) ||
        (draft.kind === "rect" && (Math.abs(draft.w) > 3 || Math.abs(draft.h) > 3)) ||
        (draft.kind === "arrow" && (Math.abs(draft.x2 - draft.x1) > 3 || Math.abs(draft.y2 - draft.y1) > 3));
      if (keep) commit([...annotations, draft]);
    }
    setDraft(null);
  };

  const commitText = () => {
    if (textDraft) {
      const value = textDraft.value.trim();
      if (editingId) {
        if (value) commit(annotations.map((a) => (a.id === editingId ? { ...a, text: textDraft.value } : a)));
        else commit(annotations.filter((a) => a.id !== editingId)); // cleared -> delete
      } else if (value) {
        commit([...annotations, { id: uid(), kind: "text", color, x: textDraft.x, y: textDraft.y, text: textDraft.value, fontSize }]);
      }
    }
    setTextDraft(null);
    setEditingId(null);
  };

  // ---- selection / manipulation (select tool) --------------------------------
  const selectPointerDown = (e: React.PointerEvent) => {
    const { x, y } = toNatural(e);
    const tol = 8 / getScale();
    let hit: Annotation | undefined;
    for (let i = annotations.length - 1; i >= 0; i--) {
      if (hitTest(annotations[i], x, y, tol)) { hit = annotations[i]; break; }
    }
    if (!hit) { setSelectedId(null); return; }
    setSelectedId(hit.id);
    dragRef.current = {
      id: hit.id, mode: "move", start: { x, y },
      startShape: hit, startAnnotations: annotations, moved: false, pushed: false,
    };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerDown = (e: React.PointerEvent, handle: Handle) => {
    e.stopPropagation();
    const shape = annotations.find((a) => a.id === selectedId);
    if (!shape) return;
    const { x, y } = toNatural(e);
    dragRef.current = {
      id: shape.id, mode: "resize", handle, start: { x, y },
      startShape: shape, startAnnotations: annotations, moved: false, pushed: false,
    };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const selectPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const { x, y } = toNatural(e);
    const dx = x - d.start.x, dy = y - d.start.y;
    // Ignore sub-pixel jitter so a plain click isn't recorded as a move.
    if (!d.moved && Math.hypot(dx, dy) * getScale() < 3) return;
    d.moved = true;
    if (!d.pushed) { setPast([...past, d.startAnnotations]); setFuture([]); d.pushed = true; }
    const nextShape = d.mode === "move"
      ? translateAnnotation(d.startShape, dx, dy)
      : resizeAnnotation(d.startShape, d.handle!, x, y);
    setAnnotations(d.startAnnotations.map((a) => (a.id === d.id ? nextShape : a)));
  };

  const selectPointerUp = () => {
    // A single click just selects (handled on pointer-down); text is edited via
    // double-click. Moves/resizes were applied live during pointer-move.
    dragRef.current = null;
  };

  // Double-click a text shape (in select mode) to re-enter edit mode.
  const onDoubleClick = (e: React.MouseEvent) => {
    if (!editable || tool !== "select") return;
    const { x, y } = clientToNatural(e.clientX, e.clientY);
    const tol = 8 / getScale();
    for (let i = annotations.length - 1; i >= 0; i--) {
      const a = annotations[i];
      if (a.kind === "text" && hitTest(a, x, y, tol)) {
        setSelectedId(a.id);
        setEditingId(a.id);
        setTextDraft({ x: a.x, y: a.y, value: a.text });
        return;
      }
    }
  };

  // Recolor / resize the selected shape (undoable), and update the default for
  // new shapes. Font size only applies to text.
  const changeColor = (c: string) => {
    setColor(c);
    if (selectedId) commit(annotations.map((a) => (a.id === selectedId ? { ...a, color: c } : a)));
  };
  const changeFontSize = (n: number) => {
    setFontSize(n);
    if (selectedText) commit(annotations.map((a) => (a.id === selectedText.id ? { ...a, fontSize: n } : a)));
  };

  // ---- save / download -------------------------------------------------------
  const generateScreenshotThumbnail = async (img: HTMLImageElement, annotations: Annotation[], targetWidth = 320): Promise<Blob> => {
    const canvas = document.createElement("canvas");
    const scale = targetWidth / img.naturalWidth;
    canvas.width = targetWidth;
    canvas.height = img.naturalHeight * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context failed");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const scaledAnnotations = annotations.map(a => {
      if (a.kind === "pen") {
        return { ...a, points: a.points.map(p => ({ x: p.x * scale, y: p.y * scale })), width: Math.max(1, a.width * scale) };
      }
      if (a.kind === "rect") {
        return { ...a, x: a.x * scale, y: a.y * scale, w: a.w * scale, h: a.h * scale, width: Math.max(1, a.width * scale) };
      }
      if (a.kind === "arrow") {
        return { ...a, x1: a.x1 * scale, y1: a.y1 * scale, x2: a.x2 * scale, y2: a.y2 * scale, width: Math.max(1, a.width * scale) };
      }
      if (a.kind === "text") {
        return { ...a, x: a.x * scale, y: a.y * scale, fontSize: Math.max(8, a.fontSize * scale) };
      }
      return a;
    }) as any[];

    const { drawAnnotation } = await import("../../../lib/annotations");
    for (const a of scaledAnnotations) {
      drawAnnotation(ctx, a);
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/jpeg", 0.7);
    });
  };

  const resolveThumbnailUrl = async (): Promise<string | undefined> => {
    if (!imgRef.current) return undefined;
    try {
      const blob = await generateScreenshotThumbnail(imgRef.current, annotations, 320);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "thumbnail.jpg", contentType: "image/jpeg", workspaceId }),
      });
      if (!res.ok) throw new Error(`Upload API failed (${res.status})`);
      const { uploadUrl, publicUrl } = await res.json();
      await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob });
      return publicUrl;
    } catch (e) {
      console.error("Failed to generate thumbnail:", e);
      return undefined;
    }
  };

  const resolveImageUrl = async (): Promise<string> => {
    if (annotations.length === 0 || !localVideoBase64 || !imgRef.current) return videoUrl;
    const blob = await flattenAnnotations(imgRef.current, annotations);
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "annotated.png", contentType: "image/png", workspaceId }),
    });
    if (!res.ok) throw new Error(`Upload API failed (${res.status})`);
    const { uploadUrl, publicUrl } = await res.json();
    await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: blob });
    return publicUrl;
  };

  const [isSaving, setIsSaving] = useState(false);
  const handleSave = async () => {
    if (isUploading || !videoUrl) { alert("Upload is still in progress. Please wait."); return; }
    if (!workspaceId) { alert("Workspace context is missing. Record via the extension with a workspace selected."); return; }
    setIsSaving(true);
    try {
      const [finalUrl, thumbnailUrl] = await Promise.all([
        resolveImageUrl(),
        resolveThumbnailUrl()
      ]);
      await saveReport({ workspaceId, title, videoUrl: finalUrl, thumbnailUrl, events: [] });
      router.push("/dashboard");
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save report: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async () => {
    try {
      let href = videoUrl || localVideoBase64 || "";
      if (annotations.length > 0 && localVideoBase64 && imgRef.current) {
        const blob = await flattenAnnotations(imgRef.current, annotations);
        href = URL.createObjectURL(blob);
      }
      const a = document.createElement("a");
      a.href = href; a.download = "screenshot.png";
      document.body.appendChild(a); a.click(); a.remove();
      if (href.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (err) {
      alert("Download failed: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh",
                  background: "#fff", fontFamily: "system-ui, -apple-system, sans-serif", color: "#111" }}>
      {/* Header */}
      <header style={{ height: 48, borderBottom: "1px solid #e5e7eb", display: "flex",
                       alignItems: "center", justifyContent: "space-between", padding: "0 20px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, cursor: "pointer" }}
                onClick={() => router.push("/dashboard")}>Reportr</span>
          {isDraft && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12,
                           fontWeight: 500, padding: "2px 10px", borderRadius: 20,
                           color: isUploading ? "#6b7280" : "#16a34a",
                           background: isUploading ? "#f3f4f6" : "#f0fdf4" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%",
                             background: isUploading ? "#9ca3af" : "#16a34a" }} />
              {isUploading ? "Uploading…" : "Ready"}
            </span>
          )}
          {isDraft ? (
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter report title..."
              style={{ fontSize: 13, fontWeight: 500, border: "1px solid #e5e7eb", borderRadius: 6,
                       outline: "none", padding: "4px 8px", minWidth: 240, background: "#fafafa" }} />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, color: "#374151",
                           borderLeft: "1px solid #e5e7eb", paddingLeft: 12 }}>{title}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => router.push("/dashboard")}
            style={{ fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 6,
                     border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", color: "#374151" }}>
            {isDraft ? "Cancel" : "Back to Dashboard"}
          </button>
          {isDraft && (
            <button onClick={handleSave} disabled={isSaving || isUploading}
              style={{ fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 6,
                       background: (isSaving || isUploading) ? "#9ca3af" : "#2563eb", color: "#fff",
                       border: "none", cursor: (isSaving || isUploading) ? "not-allowed" : "pointer" }}>
              {isSaving ? "Saving..." : "Save to Dashboard"}
            </button>
          )}
          {src && (
            <button onClick={handleDownload}
              style={{ fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 6,
                       border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", color: "#374151" }}>
              ↓ Download
            </button>
          )}
        </div>
      </header>

      {/* Toolbar */}
      {isDraft && (
        <div style={{ height: 46, background: "#3a3f4b", display: "flex", alignItems: "center",
                      gap: 6, padding: "0 16px", flexShrink: 0, opacity: editable ? 1 : 0.5,
                      pointerEvents: editable ? "auto" : "none" }}>
          <div style={btn(tool === "select")} title="Select & move" onClick={() => setTool("select")}><MousePointer2 size={17} /></div>
          <div style={divider} />
          <div style={btn(false)} title="Undo" onClick={undo}><Undo2 size={17} /></div>
          <div style={btn(false)} title="Redo" onClick={redo}><Redo2 size={17} /></div>
          <div style={btn(false)} title="Clear all" onClick={clearAll}><Trash2 size={17} /></div>
          <div style={divider} />
          <div style={btn(tool === "pen")} title="Pen" onClick={() => setTool("pen")}><Pen size={17} /></div>
          <div style={btn(tool === "rect")} title="Rectangle" onClick={() => setTool("rect")}><Square size={17} /></div>
          <div style={btn(tool === "arrow")} title="Arrow" onClick={() => setTool("arrow")}><ArrowUpRight size={17} /></div>
          <div style={btn(tool === "text")} title="Text" onClick={() => setTool("text")}><Type size={17} /></div>
          <div style={divider} />
          {SWATCHES.map((c) => {
            const activeColor = selected?.color ?? color;
            return (
              <div key={c} title="Color" onClick={() => changeColor(c)}
                style={{ width: 20, height: 20, borderRadius: "50%", cursor: "pointer", background: c,
                         border: activeColor === c ? "2px solid #fff" : "2px solid #565c6a",
                         boxShadow: activeColor === c ? "0 0 0 1px #2563eb" : "none" }} />
            );
          })}
          {(tool === "text" || selectedText) && (
            <>
              <div style={divider} />
              <select title="Font size" value={selectedText ? selectedText.fontSize : fontSize}
                onChange={(e) => changeFontSize(Number(e.target.value))}
                style={{ background: "#2b2f39", color: "#e5e7eb", border: "1px solid #565c6a",
                         borderRadius: 6, fontSize: 12, padding: "3px 6px", cursor: "pointer", outline: "none" }}>
                {[16, 20, 24, 28, 36, 48, 64].map((s) => <option key={s} value={s}>{s}px</option>)}
              </select>
            </>
          )}
        </div>
      )}

      {/* Canvas area — image fits the available width and scrolls vertically
          when taller than the viewport (e.g. full-page captures). */}
      <div style={{ flex: 1, background: "#0d0d0d", overflow: "auto", position: "relative" }}>
        {src ? (
          <div style={{ minHeight: "100%", display: "flex", alignItems: "center",
                        justifyContent: "center", padding: 24, boxSizing: "border-box" }}>
          <div style={{ position: "relative", width: "100%", flexShrink: 0,
                        maxWidth: imgRef.current?.naturalWidth ? `${imgRef.current.naturalWidth}px` : undefined }}>
            <img ref={imgRef} src={src} alt="Screenshot" onLoad={() => setImgLoaded(true)}
                 style={{ display: "block", width: "100%", height: "auto" }} />
            {imgLoaded && imgRef.current && (
              <svg ref={svgRef}
                   viewBox={`0 0 ${imgRef.current.naturalWidth} ${imgRef.current.naturalHeight}`}
                   onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                   onDoubleClick={onDoubleClick}
                   style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
                            cursor: !editable ? "default" : tool === "select" ? "default" : "crosshair",
                            touchAction: "none", pointerEvents: editable ? "auto" : "none" }}>
                {annotations.filter((a) => a.id !== editingId).map((a) => <AnnotationShape key={a.id} a={a} />)}
                {draft && <AnnotationShape a={draft} />}
                {selected && <SelectionOverlay a={selected} scale={getScale()} onHandleDown={handlePointerDown} />}
              </svg>
            )}
            {textDraft && imgRef.current && (() => {
              const scale = getScale();
              const editShape = editingId ? annotations.find((a) => a.id === editingId) : undefined;
              const editColor = editShape?.color ?? color;
              const editFont = editShape && editShape.kind === "text" ? editShape.fontSize : fontSize;
              return (
                <textarea
                  ref={textareaRef}
                  value={textDraft.value}
                  placeholder="Type…"
                  onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
                  onBlur={commitText}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText(); } }}
                  style={{ position: "absolute", left: textDraft.x * scale, top: textDraft.y * scale,
                           zIndex: 20, color: editColor, fontSize: editFont * scale, fontWeight: 600, lineHeight: 1.25,
                           fontFamily: "system-ui, -apple-system, sans-serif",
                           background: "rgba(255,255,255,0.9)",
                           border: "1px solid #2563eb", borderRadius: 3, outline: "none", resize: "none",
                           padding: "2px 4px", minWidth: 80, overflow: "hidden" }}
                />
              );
            })()}
          </div>
          </div>
        ) : (
          <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center", color: "#666" }}>
              <div style={{ width: 40, height: 40, margin: "0 auto 12px", border: "3px solid #333",
                            borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
              <p style={{ fontSize: 13 }}>Processing media…</p>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function AnnotationShape({ a }: { a: Annotation }) {
  if (a.kind === "pen") {
    const d = a.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    return <path d={d} stroke={a.color} strokeWidth={a.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
  }
  if (a.kind === "rect") {
    return <rect x={Math.min(a.x, a.x + a.w)} y={Math.min(a.y, a.y + a.h)}
                 width={Math.abs(a.w)} height={Math.abs(a.h)} stroke={a.color} strokeWidth={a.width} fill="none" />;
  }
  if (a.kind === "arrow") {
    const h = arrowHead(a.x1, a.y1, a.x2, a.y2, Math.max(12, a.width * 4));
    return (
      <g stroke={a.color} strokeWidth={a.width} fill="none" strokeLinecap="round">
        <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} />
        <line x1={a.x2} y1={a.y2} x2={h.left.x} y2={h.left.y} />
        <line x1={a.x2} y1={a.y2} x2={h.right.x} y2={h.right.y} />
      </g>
    );
  }
  return (
    <text x={a.x} y={a.y} fill={a.color} fontSize={a.fontSize}
          fontFamily="system-ui, -apple-system, sans-serif" fontWeight={600} dominantBaseline="hanging">
      {a.text}
    </text>
  );
}

// Selection outline + resize handles for the selected annotation. Sizes are in
// natural px scaled by 1/scale so they render at a constant on-screen size.
function SelectionOverlay({ a, scale, onHandleDown }: {
  a: Annotation; scale: number; onHandleDown: (e: React.PointerEvent, h: Handle) => void;
}) {
  const s = 1 / (scale || 1);
  const r = 6 * s;
  const b = annotationBBox(a);
  const handle = (hx: number, hy: number, id: Handle) => (
    <circle key={id} cx={hx} cy={hy} r={r} fill="#fff" stroke="#2563eb" strokeWidth={1.5 * s}
            style={{ cursor: "pointer" }} onPointerDown={(e) => onHandleDown(e, id)} />
  );
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="#2563eb"
            strokeWidth={1.5 * s} strokeDasharray={`${5 * s} ${4 * s}`} pointerEvents="none" />
      {a.kind === "rect" && [
        handle(b.x, b.y, "tl"), handle(b.x + b.w, b.y, "tr"),
        handle(b.x, b.y + b.h, "bl"), handle(b.x + b.w, b.y + b.h, "br"),
      ]}
      {a.kind === "arrow" && [handle(a.x1, a.y1, "start"), handle(a.x2, a.y2, "end")]}
    </g>
  );
}
