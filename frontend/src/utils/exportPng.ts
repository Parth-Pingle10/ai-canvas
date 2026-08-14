import type { BoundingBox, CanvasConnector, CanvasShape, CanvasText, Stroke } from "../types/document";
import { unionBounds, expandBounds, boundsWidth, boundsHeight } from "../canvas/CoordinateSystem";
import { drawStroke } from "../canvas/StrokeRenderer";
import { drawShape, drawConnector, drawCanvasText } from "../canvas/ShapeRenderer";

const EXPORT_MARGIN = 40;
const MAX_EXPORT_DIMENSION = 8000; // guard against pathologically huge exports

export class EmptyCanvasExportError extends Error {
  constructor() {
    super("There is nothing to export yet — draw something first.");
    this.name = "EmptyCanvasExportError";
  }
}

export function computeContentBounds(
  strokes: Stroke[],
  shapes?: CanvasShape[],
  connectors?: CanvasConnector[],
  textObjects?: CanvasText[]
): BoundingBox | null {
  const allBounds: BoundingBox[] = [];
  for (const s of strokes) allBounds.push(s.bounds);
  for (const s of shapes ?? []) if (s.status !== "draft") allBounds.push(s.bounds);
  for (const c of connectors ?? []) if (c.status !== "draft") allBounds.push(c.bounds);
  for (const t of textObjects ?? []) if (t.status !== "draft") allBounds.push(t.bounds);

  if (allBounds.length === 0) return null;
  return allBounds.reduce<BoundingBox>((acc, b) => unionBounds(acc, b), allBounds[0]);
}

export interface ExportPngOptions {
  scale?: number;
  background?: string;
}

/**
 * Renders all confirmed strokes, shapes, connectors, and text to a
 * standalone canvas cropped to their combined bounding box, and returns
 * a PNG blob. Draft objects are intentionally excluded.
 */
export async function exportCanvasToPng(
  strokes: Stroke[],
  options: ExportPngOptions = {},
  shapes: CanvasShape[] = [],
  connectors: CanvasConnector[] = [],
  textObjects: CanvasText[] = []
): Promise<Blob> {
  const bounds = computeContentBounds(strokes, shapes, connectors, textObjects);
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

  // Build shapes map for connector endpoint resolution
  const shapesMap = new Map(shapes.filter((s) => s.status !== "draft").map((s) => [s.id, s]));

  // Draw connectors first (behind shapes)
  for (const c of connectors) {
    if (c.status === "draft") continue;
    drawConnector(ctx, c, shapesMap, 1, false);
  }

  // Draw shapes
  for (const shape of shapes) {
    if (shape.status === "draft") continue;
    drawShape(ctx, shape, 1, false);
  }

  // Draw text
  for (const t of textObjects) {
    if (t.status === "draft") continue;
    drawCanvasText(ctx, t, 1, false);
  }

  // Draw strokes
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
