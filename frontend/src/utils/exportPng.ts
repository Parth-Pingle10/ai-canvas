import type { BoundingBox, Stroke } from "../types/document";
import { unionBounds, expandBounds, boundsWidth, boundsHeight } from "../canvas/CoordinateSystem";
import { drawStroke } from "../canvas/StrokeRenderer";

const EXPORT_MARGIN = 40;
const MAX_EXPORT_DIMENSION = 8000; // guard against pathologically huge exports

export class EmptyCanvasExportError extends Error {
  constructor() {
    super("There is nothing to export yet — draw something first.");
    this.name = "EmptyCanvasExportError";
  }
}

export function computeContentBounds(strokes: Stroke[]): BoundingBox | null {
  if (strokes.length === 0) return null;
  return strokes.reduce<BoundingBox>(
    (acc, s) => (acc ? unionBounds(acc, s.bounds) : s.bounds),
    strokes[0].bounds
  );
}

export interface ExportPngOptions {
  scale?: number;
  background?: string;
}

/**
 * Renders only the strokes that make up the confirmed document (never
 * unconfirmed drafts, since those aren't part of `strokes` yet) to a
 * standalone canvas cropped to their bounding box, and returns a PNG blob.
 * Guards against exporting an enormous empty image when the canvas is
 * logically huge but sparsely used.
 */
export async function exportCanvasToPng(
  strokes: Stroke[],
  options: ExportPngOptions = {}
): Promise<Blob> {
  const bounds = computeContentBounds(strokes);
  if (!bounds) throw new EmptyCanvasExportError();

  const expanded = expandBounds(bounds, EXPORT_MARGIN);
  const scale = options.scale ?? 2;
  const background = options.background ?? "#ffffff";

  let outW = Math.round(boundsWidth(expanded) * scale);
  let outH = Math.round(boundsHeight(expanded) * scale);

  // Clamp very large exports rather than trying (and failing) to allocate a
  // huge canvas; scale down proportionally instead.
  const largest = Math.max(outW, outH);
  if (largest > MAX_EXPORT_DIMENSION) {
    const clampFactor = MAX_EXPORT_DIMENSION / largest;
    outW = Math.round(outW * clampFactor);
    outH = Math.round(outH * clampFactor);
  }

  const effectiveScale = outW / boundsWidth(expanded);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, outW);
  canvas.height = Math.max(1, outH);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable — export failed.");

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(
    effectiveScale,
    0,
    0,
    effectiveScale,
    -expanded.minX * effectiveScale,
    -expanded.minY * effectiveScale
  );

  for (const stroke of strokes) {
    drawStroke(ctx, stroke);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG export failed — the browser could not encode the image."));
    }, "image/png");
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
