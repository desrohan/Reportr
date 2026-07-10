export type Tool = "select" | "pen" | "rect" | "arrow" | "text";

// Resize handle identifiers: rectangle corners and arrow endpoints.
export type Handle = "tl" | "tr" | "bl" | "br" | "start" | "end";

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

// Axis-aligned bounding box of an annotation, in natural pixel coords.
export function annotationBBox(a: Annotation): { x: number; y: number; w: number; h: number } {
  if (a.kind === "rect") {
    return { x: Math.min(a.x, a.x + a.w), y: Math.min(a.y, a.y + a.h), w: Math.abs(a.w), h: Math.abs(a.h) };
  }
  if (a.kind === "arrow") {
    return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
  }
  if (a.kind === "pen") {
    const xs = a.points.map((p) => p.x), ys = a.points.map((p) => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  // text: approximate box from character count and font size
  const lines = a.text.split("\n");
  const w = Math.max(1, ...lines.map((l) => l.length)) * a.fontSize * 0.6;
  return { x: a.x, y: a.y, w, h: lines.length * a.fontSize * 1.25 };
}

// Moves an annotation by (dx, dy).
export function translateAnnotation(a: Annotation, dx: number, dy: number): Annotation {
  if (a.kind === "pen") return { ...a, points: a.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  if (a.kind === "rect") return { ...a, x: a.x + dx, y: a.y + dy };
  if (a.kind === "arrow") return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
  return { ...a, x: a.x + dx, y: a.y + dy }; // text
}

// Resizes a rectangle (by corner) or moves an arrow endpoint to (x, y).
// Other kinds are returned unchanged (move-only).
export function resizeAnnotation(a: Annotation, handle: Handle, x: number, y: number): Annotation {
  if (a.kind === "rect") {
    const minX = Math.min(a.x, a.x + a.w), maxX = Math.max(a.x, a.x + a.w);
    const minY = Math.min(a.y, a.y + a.h), maxY = Math.max(a.y, a.y + a.h);
    let x1 = minX, y1 = minY, x2 = maxX, y2 = maxY;
    if (handle === "tl") { x1 = x; y1 = y; }
    else if (handle === "tr") { x2 = x; y1 = y; }
    else if (handle === "bl") { x1 = x; y2 = y; }
    else if (handle === "br") { x2 = x; y2 = y; }
    return { ...a, x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  if (a.kind === "arrow") {
    if (handle === "start") return { ...a, x1: x, y1: y };
    if (handle === "end") return { ...a, x2: x, y2: y };
  }
  return a;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// True if the natural-coord point (x, y) hits the annotation within `tol` px.
// Outline shapes (rect/arrow/pen) hit near their strokes; text hits its box.
export function hitTest(a: Annotation, x: number, y: number, tol: number): boolean {
  if (a.kind === "rect") {
    const b = annotationBBox(a);
    const onV = (Math.abs(x - b.x) <= tol || Math.abs(x - (b.x + b.w)) <= tol) && y >= b.y - tol && y <= b.y + b.h + tol;
    const onH = (Math.abs(y - b.y) <= tol || Math.abs(y - (b.y + b.h)) <= tol) && x >= b.x - tol && x <= b.x + b.w + tol;
    return onV || onH;
  }
  if (a.kind === "arrow") return distToSegment(x, y, a.x1, a.y1, a.x2, a.y2) <= tol;
  if (a.kind === "pen") {
    for (let i = 1; i < a.points.length; i++) {
      if (distToSegment(x, y, a.points[i - 1].x, a.points[i - 1].y, a.points[i].x, a.points[i].y) <= tol) return true;
    }
    return false;
  }
  const b = annotationBBox(a);
  return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol;
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
