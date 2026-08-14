import type { BoundingBox, Stroke } from "../types/document";
import { boundsIntersect, boundsWidth, boundsHeight, expandBounds, unionBounds } from "./CoordinateSystem";
import { drawStroke } from "./StrokeRenderer";

/**
 * RegionExtractor — future AI compatibility layer.
 *
 * This module does NOT call any model. It only crops and rasterizes a region
 * of the structured document to a standalone canvas/blob, and reports the
 * geometry alongside it. A future backend integration sends this payload
 * (image + bounds + zoom + nearby strokes) to a multimodal model; nothing in
 * this file needs to change when that integration is added.
 */

export interface ExtractRegionOptions {
  bounds: BoundingBox;
  /** Extra world-space padding added around `bounds` before rasterizing. */
  margin?: number;
  /** Target output resolution (longest side, in pixels). Aspect ratio is preserved. */
  resolution?: number;
  /** Background fill color for the exported region. */
  background?: string;
  /** Device pixel ratio to render at, for crisper output. */
  pixelRatio?: number;
  /** Output image format. "webp" is preferred for AI requests (smaller
   *  payload at comparable visual quality, which matters for the latency/
   *  cost measurements the AI integration instruments); "png" remains the
   *  default for lossless use (e.g. a future non-AI export path reusing
   *  this function). */
  format?: "png" | "webp";
  /** Encoder quality for lossy formats (0–1). Ignored for png. */
  quality?: number;
}

export interface ExtractedRegion {
  /** Rasterized image blob of the region, or null if the canvas/toBlob API is unavailable. */
  imageBlob: Blob | null;
  /** MIME type of `imageBlob` ("image/png" | "image/webp"). */
  mimeType: string;
  /** The (margin-expanded) world-space bounds that were rasterized. */
  bounds: BoundingBox;
  width: number;
  height: number;
  zoom: number;
  strokeCount: number;
  objectTypes: string[];
}

const DEFAULT_MARGIN = 48;
const DEFAULT_RESOLUTION = 1024;

/**
 * Extract and rasterize a world-space region of the document, along with
 * lightweight metadata about what's in it. Strokes are queried against the
 * expanded bounds so context just outside the literal selection is still
 * captured (a stroke that clips the edge of a selection is still relevant).
 */
export async function extractRegion(
  strokes: Stroke[],
  options: ExtractRegionOptions
): Promise<ExtractedRegion> {
  const margin = options.margin ?? DEFAULT_MARGIN;
  const resolution = options.resolution ?? DEFAULT_RESOLUTION;
  const background = options.background ?? "#ffffff";
  const pixelRatio = options.pixelRatio ?? 1;
  const format = options.format ?? "png";
  const mimeType = format === "webp" ? "image/webp" : "image/png";

  const expanded = expandBounds(options.bounds, margin);
  const worldW = Math.max(1, boundsWidth(expanded));
  const worldH = Math.max(1, boundsHeight(expanded));

  const scale = resolution / Math.max(worldW, worldH);
  const outW = Math.max(1, Math.round(worldW * scale * pixelRatio));
  const outH = Math.max(1, Math.round(worldH * scale * pixelRatio));

  const relevant = strokes.filter((s) => boundsIntersect(s.bounds, expanded));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, outW, outH);
    ctx.setTransform(
      scale * pixelRatio,
      0,
      0,
      scale * pixelRatio,
      -expanded.minX * scale * pixelRatio,
      -expanded.minY * scale * pixelRatio
    );
    for (const stroke of relevant) {
      drawStroke(ctx, stroke);
    }
  }

  const imageBlob = ctx ? await canvasToBlob(canvas, mimeType, options.quality) : null;

  const objectTypes = Array.from(new Set(relevant.map((s) => s.tool)));

  return {
    imageBlob,
    mimeType: imageBlob?.type || mimeType,
    bounds: expanded,
    width: outW,
    height: outH,
    zoom: scale * pixelRatio,
    strokeCount: relevant.length,
    objectTypes,
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number | undefined
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality ?? 0.85);
  });
}

/**
 * Region-of-interest strategy (see docs/AI_INTEGRATION.md for the full
 * writeup). Tried in order, first match wins:
 *
 *   1. recent-strokes — bounding box of strokes drawn/edited since the last
 *      AI dispatch (the strongest signal of "what the user is working on").
 *   2. selection — if nothing was recently drawn but something is selected,
 *      use that.
 *   3. viewport — fallback: whatever is currently visible on screen.
 *
 * Kept here (not in the trigger hook) so the strategy itself stays a pure,
 * directly-testable function independent of timers/network/React.
 */
export function computeRoi(params: {
  strokes: Stroke[];
  recentStrokeIds: Set<string>;
  selectedIds: string[];
  viewportWorldBounds: BoundingBox;
}): { bounds: BoundingBox; source: "recent-strokes" | "selection" | "viewport"; strokeIds: string[] } {
  const { strokes, recentStrokeIds, selectedIds, viewportWorldBounds } = params;

  if (recentStrokeIds.size > 0) {
    const recent = strokes.filter((s) => recentStrokeIds.has(s.id));
    if (recent.length > 0) {
      return {
        bounds: recent.reduce<BoundingBox>((acc, s) => unionBounds(acc, s.bounds), recent[0].bounds),
        source: "recent-strokes",
        strokeIds: recent.map((s) => s.id),
      };
    }
  }

  if (selectedIds.length > 0) {
    const selected = strokes.filter((s) => selectedIds.includes(s.id));
    if (selected.length > 0) {
      return {
        bounds: selected.reduce<BoundingBox>((acc, s) => unionBounds(acc, s.bounds), selected[0].bounds),
        source: "selection",
        strokeIds: selected.map((s) => s.id),
      };
    }
  }

  return { bounds: viewportWorldBounds, source: "viewport", strokeIds: [] };
}

/**
 * Deterministic signature of a computed ROI, used for request de-duplication
 * (see docs/AI_INTEGRATION.md "Avoiding duplicate requests"). Two ROI
 * computations that touch the same strokes at the same versions — or the
 * same fallback source with no strokes at all — produce the same signature,
 * regardless of object insertion order.
 */
export function roiSignature(roi: {
  source: "recent-strokes" | "selection" | "viewport";
  strokeIds: string[];
}, strokes: Stroke[]): string {
  const versioned = roi.strokeIds
    .map((id) => {
      const s = strokes.find((st) => st.id === id);
      return `${id}@${s?.version ?? 0}`;
    })
    .sort();
  return `${roi.source}:${versioned.join(",")}`;
}

/**
 * Convenience helper: strokes near a "recent activity" point, useful as a
 * default region-of-interest strategy (recent-ink bounding box).
 */
export function findNearbyStrokes(
  strokes: Stroke[],
  center: { x: number; y: number },
  radius: number
): Stroke[] {
  const box: BoundingBox = {
    minX: center.x - radius,
    minY: center.y - radius,
    maxX: center.x + radius,
    maxY: center.y + radius,
  };
  return strokes.filter((s) => boundsIntersect(s.bounds, box));
}
