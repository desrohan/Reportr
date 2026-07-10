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
