# Screenshot Annotation Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For screenshot reports, replace the empty Console/Network sidebar with a top-toolbar image annotation editor whose annotations are flattened into the image on Save/Download.

**Architecture:** A new `ScreenshotAnnotator` component renders when the report is an image. It shows a toolbar on top and the image centered, with an SVG overlay (in the image's natural pixel coordinates) for drawing. On Save/Download the annotations are redrawn onto a `<canvas>` with the image to produce a flattened PNG, uploaded via the existing `/api/upload` route (cookie-authed from the web page). Video recordings keep the existing `ReportReplayViewer` behavior unchanged.

**Tech Stack:** Next 16, React 19, TypeScript, inline styles (matching `ReportReplayViewer`), `lucide-react` icons. No new runtime dependencies.

## Global Constraints

- No new runtime dependencies (SVG + canvas only).
- **No test runner exists** in `web/` (scripts: `dev`, `build`, `lint`). Verification for every task is: `npx tsc --noEmit` (from `web/`), and where noted `npm run build`, plus the manual checklist in the task. Pure logic is isolated so it is correct by inspection.
- Match existing style: `ReportReplayViewer.tsx` uses **inline styles**, not Tailwind — follow that in the new components.
- Annotation coordinates are always stored in the image's **natural pixel space**.
- The annotation editor only applies to **draft screenshots** (`isImage && isDraft`). Saved screenshots render read-only; video recordings are untouched.
- Flatten/export must read the image from the **`localVideoBase64` data URL** to avoid canvas cross-origin taint; if it is absent, disable export and fall back to the original URL.
- Run all commands from `/Users/shahrohan/Projects/reportr/web`.

---

### Task 1: Annotation types, geometry helper, and flatten util

**Files:**
- Create: `web/lib/annotations.ts`
- Create: `web/lib/flattenAnnotations.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Tool = "pen" | "rect" | "arrow" | "text"`
  - `type Annotation` (discriminated union, see code)
  - `arrowHead(x1:number,y1:number,x2:number,y2:number,len?:number): {left:{x:number;y:number}; right:{x:number;y:number}}`
  - `drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation): void`
  - `flattenAnnotations(img: HTMLImageElement, annotations: Annotation[]): Promise<Blob>`

- [ ] **Step 1: Create `web/lib/annotations.ts`**

```ts
export type Tool = "pen" | "rect" | "arrow" | "text";

export type Annotation =
  | { id: string; kind: "pen"; color: string; width: number; points: { x: number; y: number }[] }
  | { id: string; kind: "rect"; color: string; width: number; x: number; y: number; w: number; h: number }
  | { id: string; kind: "arrow"; color: string; width: number; x1: number; y1: number; x2: number; y2: number }
  | { id: string; kind: "text"; color: string; x: number; y: number; text: string; fontSize: number };

// Preset color swatches for the toolbar.
export const SWATCHES = ["#ef4444", "#eab308", "#22c55e", "#3b82f6", "#111111", "#ffffff"];

// Computes the two barb endpoints of an arrowhead at (x2,y2) pointing away from (x1,y1).
export function arrowHead(
  x1: number, y1: number, x2: number, y2: number, len = 18
): { left: { x: number; y: number }; right: { x: number; y: number } } {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7; // ~25 degrees
  return {
    left: { x: x2 - len * Math.cos(angle - spread), y: y2 - len * Math.sin(angle - spread) },
    right: { x: x2 - len * Math.cos(angle + spread), y: y2 - len * Math.sin(angle + spread) },
  };
}

// Draws a single annotation onto a 2D canvas context (used by flattenAnnotations).
export function drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (a.kind === "pen") {
    if (a.points.length < 2) return;
    ctx.strokeStyle = a.color;
    ctx.lineWidth = a.width;
    ctx.beginPath();
    ctx.moveTo(a.points[0].x, a.points[0].y);
    for (let i = 1; i < a.points.length; i++) ctx.lineTo(a.points[i].x, a.points[i].y);
    ctx.stroke();
  } else if (a.kind === "rect") {
    ctx.strokeStyle = a.color;
    ctx.lineWidth = a.width;
    ctx.strokeRect(a.x, a.y, a.w, a.h);
  } else if (a.kind === "arrow") {
    ctx.strokeStyle = a.color;
    ctx.lineWidth = a.width;
    ctx.beginPath();
    ctx.moveTo(a.x1, a.y1);
    ctx.lineTo(a.x2, a.y2);
    ctx.stroke();
    const { left, right } = arrowHead(a.x1, a.y1, a.x2, a.y2, Math.max(12, a.width * 4));
    ctx.beginPath();
    ctx.moveTo(a.x2, a.y2);
    ctx.lineTo(left.x, left.y);
    ctx.moveTo(a.x2, a.y2);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
  } else if (a.kind === "text") {
    ctx.fillStyle = a.color;
    ctx.font = `600 ${a.fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "top";
    a.text.split("\n").forEach((line, i) => ctx.fillText(line, a.x, a.y + i * a.fontSize * 1.25));
  }
}
```

- [ ] **Step 2: Create `web/lib/flattenAnnotations.ts`**

```ts
import { Annotation, drawAnnotation } from "./annotations";

// Composites annotations onto the image and returns a PNG blob at natural size.
export function flattenAnnotations(img: HTMLImageElement, annotations: Annotation[]): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas 2D context unavailable"));

  ctx.drawImage(img, 0, 0);
  for (const a of annotations) drawAnnotation(ctx, a);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/lib/annotations.ts web/lib/flattenAnnotations.ts
git commit -m "feat(reports): annotation types, geometry, and flatten util"
```

---

### Task 2: ScreenshotAnnotator skeleton + wire into ReportReplayViewer

Renders the header, an (inert) toolbar, and the centered image with no drawing yet. `ReportReplayViewer` delegates to it for images.

**Files:**
- Create: `web/app/reports/components/ScreenshotAnnotator.tsx`
- Modify: `web/app/reports/components/ReportReplayViewer.tsx`

**Interfaces:**
- Consumes: `Tool`, `SWATCHES` from `web/lib/annotations.ts`.
- Produces: `ScreenshotAnnotator` React component with props:
  ```ts
  interface ScreenshotAnnotatorProps {
    initialTitle: string;
    videoUrl: string;
    localVideoBase64?: string;
    workspaceId?: string;
    isDraft?: boolean;
    isUploading?: boolean;
  }
  ```

- [ ] **Step 1: Create `web/app/reports/components/ScreenshotAnnotator.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Undo2, Redo2, RotateCcw, Trash2, Pen, Square, ArrowUpRight, Type } from "lucide-react";
import { Tool, SWATCHES } from "../../../lib/annotations";

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

export function ScreenshotAnnotator({
  initialTitle, videoUrl, localVideoBase64, workspaceId, isDraft = false, isUploading = false,
}: ScreenshotAnnotatorProps) {
  const router = useRouter();
  const imgRef = useRef<HTMLImageElement>(null);
  const [title, setTitle] = useState(initialTitle);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState(SWATCHES[0]);
  const [imgLoaded, setImgLoaded] = useState(false);

  const src = localVideoBase64 || videoUrl;
  const editable = isDraft && imgLoaded;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh",
                  background: "#fff", fontFamily: "system-ui, -apple-system, sans-serif", color: "#111" }}>
      {/* Header */}
      <header style={{ height: 48, borderBottom: "1px solid #e5e7eb", display: "flex",
                       alignItems: "center", justifyContent: "space-between", padding: "0 20px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, cursor: "pointer" }}
                onClick={() => router.push("/dashboard")}>Reportr</span>
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
        </div>
      </header>

      {/* Toolbar (inert for now) */}
      {isDraft && (
        <div style={{ height: 46, background: "#3a3f4b", display: "flex", alignItems: "center",
                      gap: 6, padding: "0 16px", flexShrink: 0, opacity: editable ? 1 : 0.5,
                      pointerEvents: editable ? "auto" : "none" }}>
          <div style={btn(false)}><Undo2 size={17} /></div>
          <div style={btn(false)}><Redo2 size={17} /></div>
          <div style={btn(false)}><RotateCcw size={17} /></div>
          <div style={btn(false)}><Trash2 size={17} /></div>
          <div style={{ width: 1, height: 20, background: "#565c6a", margin: "0 8px" }} />
          <div style={btn(tool === "pen")} onClick={() => setTool("pen")}><Pen size={17} /></div>
          <div style={btn(tool === "rect")} onClick={() => setTool("rect")}><Square size={17} /></div>
          <div style={btn(tool === "arrow")} onClick={() => setTool("arrow")}><ArrowUpRight size={17} /></div>
          <div style={btn(tool === "text")} onClick={() => setTool("text")}><Type size={17} /></div>
          <div style={{ width: 1, height: 20, background: "#565c6a", margin: "0 8px" }} />
          {SWATCHES.map((c) => (
            <div key={c} onClick={() => setColor(c)}
              style={{ width: 20, height: 20, borderRadius: "50%", cursor: "pointer", background: c,
                       border: color === c ? "2px solid #fff" : "2px solid #565c6a",
                       boxShadow: color === c ? "0 0 0 1px #2563eb" : "none" }} />
          ))}
        </div>
      )}

      {/* Canvas area */}
      <div style={{ flex: 1, background: "#0d0d0d", display: "flex", alignItems: "center",
                    justifyContent: "center", overflow: "hidden", position: "relative" }}>
        {src ? (
          <img ref={imgRef} src={src} alt="Screenshot" onLoad={() => setImgLoaded(true)}
               style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
        ) : (
          <div style={{ textAlign: "center", color: "#666" }}>
            <div style={{ width: 40, height: 40, margin: "0 auto 12px", border: "3px solid #333",
                          borderTopColor: "#fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
            <p style={{ fontSize: 13 }}>Processing media…</p>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `ReportReplayViewer.tsx`**

Add the import at the top of `web/app/reports/components/ReportReplayViewer.tsx` (after the existing imports on lines 3-5):

```tsx
import { ScreenshotAnnotator } from "./ScreenshotAnnotator";
```

Then, immediately after the `isImage` `useMemo` block (currently ending at line 286 with `}, [videoUrl, localVideoBase64]);`), add an early return:

```tsx
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
```

Note: this return sits before the other hooks (`useEffect`, `useMemo` for `start`, etc.). To satisfy React's rules-of-hooks, move this `if (isImage) return ...` block to the **very end**, just before the existing `return (` on line 382 — i.e., keep all hooks above it. Place it directly above `return (` at line 382.

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: compiles with no errors.

- [ ] **Step 4: Manual verification**

Run `npm run dev`. Take a screenshot via the extension (any capture type) so `/reports/new` opens with an image draft.
- Confirm: dark toolbar appears on top, image is centered and large, **no** Console/Network sidebar.
- Confirm: tool buttons highlight when clicked; color swatch shows selection ring.
- Confirm: a normal **video** recording still shows the Console/Network sidebar (unchanged).

- [ ] **Step 5: Commit**

```bash
git add web/app/reports/components/ScreenshotAnnotator.tsx web/app/reports/components/ReportReplayViewer.tsx
git commit -m "feat(reports): screenshot annotator skeleton with top toolbar"
```

---

### Task 3: Drawing — pen, rectangle, arrow (SVG overlay + coordinate mapping)

**Files:**
- Modify: `web/app/reports/components/ScreenshotAnnotator.tsx`

**Interfaces:**
- Consumes: `Annotation`, `arrowHead` from `web/lib/annotations.ts`.
- Produces: local `annotations` state of type `Annotation[]`; SVG overlay rendering; pointer handlers `toNatural`, `onPointerDown/Move/Up`.

- [ ] **Step 1: Add state and a natural-coordinate mapper**

In `ScreenshotAnnotator`, add imports and state. Update the import line to include the annotation type and helper:

```tsx
import { Tool, SWATCHES, Annotation, arrowHead } from "../../../lib/annotations";
```

Add near the other `useState` hooks:

```tsx
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);
  const STROKE = 4;

  // Maps a pointer event to the image's natural pixel coordinates via the SVG CTM.
  const toNatural = (e: React.PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const uid = () => Math.random().toString(36).slice(2);
```

- [ ] **Step 2: Add pointer handlers (pen/rect/arrow)**

Add these handlers inside the component (text handled in Task 4 — `tool === "text"` is ignored here):

```tsx
  const onPointerDown = (e: React.PointerEvent) => {
    if (!editable || tool === "text") return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const { x, y } = toNatural(e);
    if (tool === "pen") setDraft({ id: uid(), kind: "pen", color, width: STROKE, points: [{ x, y }] });
    else if (tool === "rect") setDraft({ id: uid(), kind: "rect", color, width: STROKE, x, y, w: 0, h: 0 });
    else if (tool === "arrow") setDraft({ id: uid(), kind: "arrow", color, width: STROKE, x1: x, y1: y, x2: x, y2: y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current || !draft) return;
    const { x, y } = toNatural(e);
    if (draft.kind === "pen") setDraft({ ...draft, points: [...draft.points, { x, y }] });
    else if (draft.kind === "rect") setDraft({ ...draft, w: x - draft.x, h: y - draft.y });
    else if (draft.kind === "arrow") setDraft({ ...draft, x2: x, y2: y });
  };

  const onPointerUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (draft) {
      // Discard zero-size shapes.
      const keep =
        (draft.kind === "pen" && draft.points.length > 1) ||
        (draft.kind === "rect" && (Math.abs(draft.w) > 3 || Math.abs(draft.h) > 3)) ||
        (draft.kind === "arrow" && (Math.abs(draft.x2 - draft.x1) > 3 || Math.abs(draft.y2 - draft.y1) > 3));
      if (keep) setAnnotations((prev) => [...prev, draft]);
    }
    setDraft(null);
  };
```

- [ ] **Step 3: Add an SVG renderer for annotations**

Add this helper component at the bottom of the file (outside `ScreenshotAnnotator`):

```tsx
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
```

- [ ] **Step 4: Render the overlay over the image**

Replace the `<img ... />` element in the canvas area with a wrapper that overlays the SVG exactly on the image. Change the canvas-area block so the image is wrapped and an SVG sits on top sized to the image's rendered box:

```tsx
        {src ? (
          <div style={{ position: "relative", display: "inline-block", maxWidth: "100%", maxHeight: "100%" }}>
            <img ref={imgRef} src={src} alt="Screenshot" onLoad={() => setImgLoaded(true)}
                 style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
            {imgLoaded && imgRef.current && (
              <svg ref={svgRef}
                   viewBox={`0 0 ${imgRef.current.naturalWidth} ${imgRef.current.naturalHeight}`}
                   onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                   style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
                            cursor: editable ? "crosshair" : "default", touchAction: "none" }}>
                {annotations.map((a) => <AnnotationShape key={a.id} a={a} />)}
                {draft && <AnnotationShape a={draft} />}
              </svg>
            )}
          </div>
        ) : (
```

Note: because the SVG only mounts after `imgLoaded` flips true, add a re-render nudge so `imgRef.current` is populated when the SVG first renders — set a state flag in `onLoad`:

```tsx
// onLoad already calls setImgLoaded(true), which re-renders; imgRef.current is
// populated by then, so naturalWidth/Height are available. No extra flag needed.
```

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: compiles with no errors.

- [ ] **Step 6: Manual verification**

`npm run dev`, open a screenshot draft.
- Select **Arrow**, drag on the image → an arrow with a head is drawn where you dragged.
- Select **Rectangle**, drag → a rectangle appears; dragging in any direction works.
- Select **Pen**, draw a squiggle → freehand line follows the cursor.
- Switch **color** and draw again → new shapes use the new color; existing shapes keep theirs.
- Confirm shapes stay aligned to the image when the window is resized.

- [ ] **Step 7: Commit**

```bash
git add web/app/reports/components/ScreenshotAnnotator.tsx
git commit -m "feat(reports): pen, rectangle, and arrow drawing on screenshots"
```

---

### Task 4: Text tool

**Files:**
- Modify: `web/app/reports/components/ScreenshotAnnotator.tsx`

**Interfaces:**
- Consumes: `toNatural`, `annotations` state, `Annotation` type.
- Produces: `textDraft` state and an overlaid HTML `<textarea>` that commits a `text` annotation.

- [ ] **Step 1: Add text-placement state**

Add near the other state:

```tsx
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);
  const FONT = 28; // natural-pixel font size for text annotations
```

- [ ] **Step 2: Place a text box on click**

Extend `onPointerDown` to handle the text tool at the very top (before the `tool === "text"` early return that Task 3 added). Replace the first two lines of `onPointerDown` with:

```tsx
  const onPointerDown = (e: React.PointerEvent) => {
    if (!editable) return;
    if (tool === "text") {
      const { x, y } = toNatural(e);
      setTextDraft({ x, y, value: "" });
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    // ...rest unchanged
```

- [ ] **Step 3: Render the text input overlay and commit handler**

Add a commit helper:

```tsx
  const commitText = () => {
    if (textDraft && textDraft.value.trim()) {
      setAnnotations((prev) => [
        ...prev,
        { id: uid(), kind: "text", color, x: textDraft.x, y: textDraft.y, text: textDraft.value, fontSize: FONT },
      ]);
    }
    setTextDraft(null);
  };
```

Render an editable textarea positioned in natural coords. Because the overlay div is in CSS pixels but text coords are natural pixels, compute the scale from the rendered image. Add inside the image wrapper, after the `<svg>`:

```tsx
            {textDraft && imgRef.current && (() => {
              const scale = imgRef.current.clientWidth / imgRef.current.naturalWidth;
              return (
                <textarea
                  autoFocus
                  value={textDraft.value}
                  onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
                  onBlur={commitText}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText(); } }}
                  style={{ position: "absolute", left: textDraft.x * scale, top: textDraft.y * scale,
                           color, fontSize: FONT * scale, fontWeight: 600, lineHeight: 1.25,
                           fontFamily: "system-ui, -apple-system, sans-serif", background: "transparent",
                           border: "1px dashed rgba(255,255,255,0.6)", outline: "none", resize: "none",
                           padding: 0, minWidth: 40, overflow: "hidden" }}
                />
              );
            })()}
```

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 5: Manual verification**

- Select **Text**, click on the image → a dashed input appears at that spot.
- Type text, press **Enter** → text commits as an annotation at that position in the chosen color.
- Click elsewhere with Text tool while editing → previous text commits on blur.
- Confirm committed text stays aligned to the image on window resize.

- [ ] **Step 6: Commit**

```bash
git add web/app/reports/components/ScreenshotAnnotator.tsx
git commit -m "feat(reports): text annotation tool"
```

---

### Task 5: Undo / Redo / Reset

**Files:**
- Modify: `web/app/reports/components/ScreenshotAnnotator.tsx`

**Interfaces:**
- Consumes: `annotations`, `setAnnotations`.
- Produces: `undo()`, `redo()`, `reset()` wired to the toolbar buttons; `redoStack` state.

- [ ] **Step 1: Add a redo stack and history operations**

Add state and handlers:

```tsx
  const [redoStack, setRedoStack] = useState<Annotation[]>([]);

  const undo = () => {
    setAnnotations((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      return prev.slice(0, -1);
    });
  };
  const redo = () => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const item = r[r.length - 1];
      setAnnotations((prev) => [...prev, item]);
      return r.slice(0, -1);
    });
  };
  const reset = () => {
    setAnnotations((prev) => { if (prev.length) setRedoStack([]); return []; });
  };
```

Clear the redo stack whenever a new shape is committed. In `onPointerUp` (Task 3) after `setAnnotations((prev) => [...prev, draft]);` add `setRedoStack([]);`, and in `commitText` (Task 4) after the `setAnnotations` call add `setRedoStack([]);`.

- [ ] **Step 2: Wire the toolbar buttons**

Replace the four inert history buttons from Task 2 with wired versions (Reset and Clear both clear all; keep both icons but point both at `reset` — "Reset" undoes to original, "Clear" removes all; for Core they are the same action):

```tsx
          <div style={btn(false)} title="Undo" onClick={undo}><Undo2 size={17} /></div>
          <div style={btn(false)} title="Redo" onClick={redo}><Redo2 size={17} /></div>
          <div style={btn(false)} title="Clear all" onClick={reset}><RotateCcw size={17} /></div>
          <div style={btn(false)} title="Clear all" onClick={reset}><Trash2 size={17} /></div>
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 4: Manual verification**

- Draw three shapes. **Undo** removes them one at a time (last-first).
- **Redo** re-adds them in order.
- Draw a new shape after undoing → redo stack clears (redo does nothing after).
- **Clear all** removes every annotation.

- [ ] **Step 5: Commit**

```bash
git add web/app/reports/components/ScreenshotAnnotator.tsx
git commit -m "feat(reports): undo, redo, and clear for annotations"
```

---

### Task 6: Flatten on Save + Download

**Files:**
- Modify: `web/app/reports/components/ScreenshotAnnotator.tsx`

**Interfaces:**
- Consumes: `flattenAnnotations` from `web/lib/flattenAnnotations.ts`; `saveReport` from `../actions`.
- Produces: `handleSave()`, `handleDownload()`, plus Save-to-Dashboard and Download buttons in the header.

- [ ] **Step 1: Add imports and an upload helper**

Add imports:

```tsx
import { flattenAnnotations } from "../../../lib/flattenAnnotations";
import { saveReport } from "../actions";
```

Add state and helpers inside the component:

```tsx
  const [isSaving, setIsSaving] = useState(false);

  // Produces the URL to save: if annotated, flatten -> upload a new PNG; else the original.
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

  const handleSave = async () => {
    if (isUploading || !videoUrl) { alert("Upload is still in progress. Please wait."); return; }
    if (!workspaceId) { alert("Workspace context is missing. Record via the extension with a workspace selected."); return; }
    setIsSaving(true);
    try {
      const finalUrl = await resolveImageUrl();
      await saveReport({ workspaceId, title, videoUrl: finalUrl, events: [] });
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
```

- [ ] **Step 2: Add Save + Download buttons to the header**

In the header's right-side `<div style={{ display: "flex", gap: 8 }}>`, after the Cancel/Back button add:

```tsx
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
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 4: Manual verification (end-to-end)**

- Annotate a screenshot with an arrow + text. Click **Download** → the downloaded PNG contains the annotations baked in at full resolution.
- Click **Save to Dashboard** → returns to dashboard; open the saved report → the stored image shows the annotations.
- Save a screenshot with **no** annotations → the original image is saved unchanged (no extra upload).
- While the image is still "Uploading…", confirm Save is disabled.

- [ ] **Step 5: Commit**

```bash
git add web/app/reports/components/ScreenshotAnnotator.tsx
git commit -m "feat(reports): flatten annotations on save and download"
```

---

### Task 7: Edge cases & polish

**Files:**
- Modify: `web/app/reports/components/ScreenshotAnnotator.tsx`

**Interfaces:**
- Consumes: existing state.
- Produces: read-only saved view, export-disabled fallback, and a status badge.

- [ ] **Step 1: Read-only saved screenshots**

For a saved (non-draft) screenshot the toolbar is already hidden (`isDraft &&`). Confirm the SVG overlay does not capture pointer events when not editable — the `<svg>` `onPointerDown` already returns early via `if (!editable) return;`. Additionally set `pointerEvents` so the cursor is normal: change the svg `style` to include `pointerEvents: editable ? "auto" : "none"`.

- [ ] **Step 2: Export fallback + status badge**

`resolveImageUrl` and `handleDownload` already fall back to the original URL when `localVideoBase64` is missing (annotations can't be flattened safely). Add a small status badge to the header for drafts, mirroring `ReportReplayViewer`'s `StatusBadge`. Add inline in the header, after the logo span:

```tsx
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
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 4: Manual verification**

- Open a saved screenshot report (non-draft) → image shows, no toolbar, cursor is normal, no accidental drawing.
- During the brief "Uploading…" window on a fresh draft, the badge shows "Uploading…" and tools are dimmed/disabled; after upload it flips to "Ready".

- [ ] **Step 5: Commit**

```bash
git add web/app/reports/components/ScreenshotAnnotator.tsx
git commit -m "feat(reports): read-only saved view, export fallback, status badge"
```

---

## Self-Review

**Spec coverage:**
- Toolbar-on-top + centered image → Task 2. ✓
- Core tools (pen/rect/arrow/text/color) → Tasks 3–4. ✓
- Undo/Redo/Reset → Task 5. ✓
- Flatten into PNG on Save/Download → Task 6. ✓
- Upload via `/api/upload` cookie auth → Task 6. ✓
- Video path unchanged; only `isImage` delegates → Task 2. ✓
- Natural-coordinate storage + SVG viewBox → Task 3. ✓
- Data-URL source to avoid taint; fallback when missing → Tasks 6–7. ✓
- Uploading disables tools; saved read-only → Tasks 2 & 7. ✓

**Type consistency:** `Annotation` union, `arrowHead`, `drawAnnotation`, `flattenAnnotations` defined in Task 1 and used with identical signatures in Tasks 3/6. `toNatural`, `annotations`, `redoStack` names consistent across Tasks 3–6. Toolbar `btn()` and `SWATCHES` consistent.

**Placeholder scan:** No TBD/TODO; every code step contains full code.

**Note on TDD:** the project has no test runner and this feature is canvas/DOM-bound; verification is `tsc --noEmit` + `next build` + explicit manual checklists per task, and pure geometry (`arrowHead`) is isolated in Task 1 for correctness by inspection.
