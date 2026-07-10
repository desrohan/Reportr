# Screenshot Annotation Editor — Design

**Date:** 2026-07-05
**Status:** Approved

## Problem

When a report is a **screenshot** (not a video recording), the review page
(`/reports/new` → `ReportReplayViewer`) still shows the Console/Network sidebar,
which is always empty ("No events captured yet") because screenshots carry no
events. That space is wasted, and there's no way to mark up the screenshot to
point at the bug.

## Goal

For screenshots, replace the empty Console/Network sidebar with an **image
annotation editor**: a toolbar on top, the image centered and large, Core
annotation tools, and annotations **flattened into the image** on Save/Download.
Video recordings are untouched.

## Scope (v1)

**In scope — Core tool set:**
- Draw tools: **Pen** (freehand), **Rectangle**, **Arrow**, **Text**
- **Color** picker: preset swatches (red, yellow, green, blue, black, white)
- History: **Undo**, **Redo**, **Reset** (clear all)
- Flatten annotations into a PNG on **Save to Dashboard** and **Download**

**Out of scope (deferred):** Crop, Resize/move of existing shapes, Highlighter,
per-shape Eraser, stroke-width control, re-editable saved annotations.

## Approach

**SVG overlay for editing + canvas for export** (no new dependencies).

- Annotations are React state rendered as **SVG elements** laid exactly over the
  `<img>`.
- On Save/Download, annotations are **redrawn onto a `<canvas>`** together with
  the image to produce a flattened PNG.

Rejected alternatives: react-konva (adds ~100KB+ dependency, unneeded for Core);
pure hand-rolled canvas (painful text editing / re-render on undo).

## Architecture

### Components
- **`ScreenshotAnnotator.tsx`** (new) — owns the entire screenshot experience:
  header actions, toolbar, SVG editor, and flatten/upload/download. Full-height
  column layout.
- **`ReportReplayViewer.tsx`** — renders `<ScreenshotAnnotator />` when
  `isImage` is true; otherwise renders the existing video + Console/Network
  sidebar path **unchanged**.
- **`lib/flattenAnnotations.ts`** (new) — pure-ish util:
  `flattenAnnotations(image: HTMLImageElement, annotations: Annotation[]): Promise<Blob>`.
  The one unit-testable unit.

### Data model
```ts
type Tool = "pen" | "rect" | "arrow" | "text";
type Annotation =
  | { id: string; kind: "pen"; color: string; points: {x:number;y:number}[] }
  | { id: string; kind: "rect"; color: string; x:number; y:number; w:number; h:number }
  | { id: string; kind: "arrow"; color: string; x1:number; y1:number; x2:number; y2:number }
  | { id: string; kind: "text"; color: string; x:number; y:number; text:string; fontSize:number };
```
All coordinates are in the image's **natural pixel space**.

### Coordinate handling
- The overlay `<svg>` uses `viewBox="0 0 naturalW naturalH"` and is positioned to
  exactly cover the rendered `<img>` (same `object-fit: contain` box).
- Pointer events are mapped from displayed coordinates to natural coordinates via
  the SVG's own coordinate system (`getScreenCTM().inverse()` or a scale factor
  from `getBoundingClientRect`).
- Because storage is in natural coords, export is 1:1 with no scaling math.

### Interaction
- Select a tool in the toolbar (active tool highlighted). Selected color applies
  to newly drawn shapes.
- **Pen:** pointerdown → collect points on pointermove → commit polyline on
  pointerup.
- **Rectangle:** drag from corner to corner (live preview).
- **Arrow:** drag tail→head; rendered as a line plus an arrowhead at the head.
- **Text:** click to place → an absolutely-positioned HTML `<input>`/`<textarea>`
  appears at that point → typing → commit on blur/Enter as a text annotation.
- **Undo/Redo:** history stack of annotation-array snapshots. **Reset:** clears
  all annotations (pushes onto history so it can be undone).

### Export / flatten
1. Create `<canvas>` at natural W×H.
2. Draw the source image at (0,0). **Source is the `localVideoBase64` data URL**
   to avoid canvas cross-origin taint.
3. Draw each annotation with the 2D API: `stroke`/`strokeRect` for rect,
   polyline via `moveTo/lineTo` for pen, line + computed arrowhead triangle for
   arrow, `fillText` for text (font size from annotation).
4. `canvas.toBlob(..., "image/png")`.

### Save flow
- **Save to Dashboard:** if annotations exist → flatten → upload the PNG via
  `POST /api/upload` (the route already accepts the dashboard **cookie** session,
  so the page uploads directly) → `PUT` to the presigned URL → call
  `saveReport({ workspaceId, title, videoUrl: annotatedUrl, events: [] })`. If no
  annotations → save the original `videoUrl` unchanged.
- **Download:** flatten (or original if no annotations) → trigger a PNG download.

## Error handling / edge cases
- **Image not ready** (still uploading, no `localVideoBase64`): show the existing
  "Processing media…" spinner; annotation tools disabled until the image loads.
- **Saved (non-draft) screenshot** (`isImage && !isDraft`): show the
  already-flattened image read-only, no toolbar.
- **Missing `localVideoBase64`**: disable annotation export and fall back to the
  original image URL (avoids exporting from a possibly-tainted cross-origin URL).
- **Upload failure on Save:** surface an alert (consistent with existing
  `handleSave` behavior) and keep the user on the page.

## Testing
- Unit-test `flattenAnnotations` against a small stub image + a few annotations,
  asserting the produced blob is a non-empty PNG and (where feasible) that draw
  calls are issued per annotation.
- Manual verification in-app: take a screenshot via the extension, annotate with
  each tool, undo/redo/reset, Save, and confirm the saved/downloaded image shows
  the annotations.

## Out of scope / future
Crop (changes exported bounds), resize/move handles, highlighter, per-shape
eraser, stroke-width control, and re-editable (vector) saved annotations.
