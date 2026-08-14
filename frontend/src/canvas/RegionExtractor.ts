import type { BoundingBox, CanvasConnector, CanvasShape, CanvasText, Stroke } from "../types/document";
import { boundsIntersect, boundsWidth, boundsHeight, expandBounds, unionBounds } from "./CoordinateSystem";
import { drawStroke } from "./StrokeRenderer";
import { drawCanvasText, drawConnector, drawShape } from "./ShapeRenderer";

/**
 * RegionExtractor — AI vision and context extraction layer.
 *
 * Crops and rasterizes a region of the structured whiteboard document (strokes,
 * native shapes, connectors, and typed text objects) to a standalone canvas/blob,
 * extracting both visual pixel content and semantic canvas text objects.
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
  /** Output image format. */
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
  canvasTexts: string[];
}

const DEFAULT_MARGIN = 48;
const DEFAULT_RESOLUTION = 1024;

/**
 * Extract and rasterize a world-space region of the document, along with
 * structured text and lightweight metadata about what's in it.
 */
export async function extractRegion(
  strokes: Stroke[],
  options: ExtractRegionOptions,
  extra?: {
    shapes?: CanvasShape[];
    connectors?: CanvasConnector[];
    textObjects?: CanvasText[];
  }
): Promise<ExtractedRegion> {
  const margin = options.margin ?? DEFAULT_MARGIN;
  const resolution = options.resolution ?? DEFAULT_RESOLUTION;
  const background = options.background ?? "#ffffff";
  const pixelRatio = options.pixelRatio ?? 1;
  const format = options.format ?? "png";
  const mimeType = format === "webp" ? "image/webp" : "image/png";

  const shapes = extra?.shapes ?? [];
  const connectors = extra?.connectors ?? [];
  const textObjects = extra?.textObjects ?? [];

  const expanded = expandBounds(options.bounds, margin);
  const worldW = Math.max(1, boundsWidth(expanded));
  const worldH = Math.max(1, boundsHeight(expanded));

  const scale = resolution / Math.max(worldW, worldH);
  const outW = Math.max(1, Math.round(worldW * scale * pixelRatio));
  const outH = Math.max(1, Math.round(worldH * scale * pixelRatio));

  const relevantStrokes = strokes.filter((s) => boundsIntersect(s.bounds, expanded));
  const relevantShapes = shapes.filter((s) => boundsIntersect(s.bounds, expanded));
  const relevantConnectors = connectors.filter((c) => boundsIntersect(c.bounds, expanded));
  const relevantTexts = textObjects.filter((t) => boundsIntersect(t.bounds, expanded));

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

    // Draw full scene layers in order: shapes -> connectors -> strokes -> text
    for (const shape of relevantShapes) {
      drawShape(ctx, shape);
    }
    for (const connector of relevantConnectors) {
      drawConnector(ctx, connector);
    }
    for (const stroke of relevantStrokes) {
      drawStroke(ctx, stroke);
    }
    for (const textObj of relevantTexts) {
      drawCanvasText(ctx, textObj);
    }
  }

  const imageBlob = ctx ? await canvasToBlob(canvas, mimeType, options.quality) : null;

  const objectTypes = Array.from(
    new Set([
      ...relevantStrokes.map((s) => s.tool),
      ...relevantShapes.map((s) => `shape:${s.shapeType}`),
      ...relevantConnectors.map(() => "connector"),
      ...relevantTexts.map(() => "text"),
    ])
  );

  const canvasTexts = relevantTexts
    .map((t) => t.text)
    .filter((txt) => Boolean(txt && txt.trim().length > 0));

  return {
    imageBlob,
    mimeType: imageBlob?.type || mimeType,
    bounds: expanded,
    width: outW,
    height: outH,
    zoom: scale * pixelRatio,
    strokeCount: relevantStrokes.length,
    objectTypes,
    canvasTexts,
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
 * Region-of-interest strategy:
 * Evaluates active strokes, text objects, and shapes to determine what the user is working on.
 */
export function computeRoi(params: {
  strokes: Stroke[];
  shapes?: CanvasShape[];
  connectors?: CanvasConnector[];
  textObjects?: CanvasText[];
  recentStrokeIds: Set<string>;
  recentTextIds?: Set<string>;
  recentShapeIds?: Set<string>;
  selectedIds: string[];
  viewportWorldBounds: BoundingBox;
}): {
  bounds: BoundingBox;
  source: "recent-strokes" | "selection" | "viewport";
  strokeIds: string[];
  textIds: string[];
  shapeIds: string[];
} {
  const {
    strokes,
    shapes = [],
    textObjects = [],
    recentStrokeIds,
    recentTextIds = new Set(),
    recentShapeIds = new Set(),
    selectedIds,
    viewportWorldBounds,
  } = params;

  // 1. Check recent activity
  const recentStrokes = strokes.filter((s) => recentStrokeIds.has(s.id));
  const recentTexts = textObjects.filter((t) => recentTextIds.has(t.id));
  const recentShapes = shapes.filter((s) => recentShapeIds.has(s.id));

  const allRecentBounds: BoundingBox[] = [
    ...recentStrokes.map((s) => s.bounds),
    ...recentTexts.map((t) => t.bounds),
    ...recentShapes.map((s) => s.bounds),
  ];

  if (allRecentBounds.length > 0) {
    return {
      bounds: allRecentBounds.reduce<BoundingBox>((acc, b) => unionBounds(acc, b), allRecentBounds[0]),
      source: "recent-strokes",
      strokeIds: recentStrokes.map((s) => s.id),
      textIds: recentTexts.map((t) => t.id),
      shapeIds: recentShapes.map((s) => s.id),
    };
  }

  // 2. Check selection
  if (selectedIds.length > 0) {
    const selStrokes = strokes.filter((s) => selectedIds.includes(s.id));
    const selTexts = textObjects.filter((t) => selectedIds.includes(t.id));
    const selShapes = shapes.filter((s) => selectedIds.includes(s.id));

    const allSelBounds: BoundingBox[] = [
      ...selStrokes.map((s) => s.bounds),
      ...selTexts.map((t) => t.bounds),
      ...selShapes.map((s) => s.bounds),
    ];

    if (allSelBounds.length > 0) {
      return {
        bounds: allSelBounds.reduce<BoundingBox>((acc, b) => unionBounds(acc, b), allSelBounds[0]),
        source: "selection",
        strokeIds: selStrokes.map((s) => s.id),
        textIds: selTexts.map((t) => t.id),
        shapeIds: selShapes.map((s) => s.id),
      };
    }
  }

  // 3. Fallback to viewport
  return {
    bounds: viewportWorldBounds,
    source: "viewport",
    strokeIds: [],
    textIds: [],
    shapeIds: [],
  };
}

/**
 * Deterministic signature of a computed ROI, used for request de-duplication.
 */
export function roiSignature(
  roi: {
    source: "recent-strokes" | "selection" | "viewport";
    strokeIds: string[];
    textIds?: string[];
    shapeIds?: string[];
  },
  strokes: Stroke[],
  textObjects: CanvasText[] = [],
  shapes: CanvasShape[] = []
): string {
  const versionedStrokes = roi.strokeIds
    .map((id) => {
      const s = strokes.find((st) => st.id === id);
      return `s:${id}@${s?.version ?? 0}`;
    })
    .sort();

  const versionedTexts = (roi.textIds ?? [])
    .map((id) => {
      const t = textObjects.find((txt) => txt.id === id);
      return `t:${id}@${t?.version ?? 0}`;
    })
    .sort();

  const versionedShapes = (roi.shapeIds ?? [])
    .map((id) => {
      const sh = shapes.find((shp) => shp.id === id);
      return `sh:${id}@${sh?.version ?? 0}`;
    })
    .sort();

  return `${roi.source}:${[...versionedStrokes, ...versionedTexts, ...versionedShapes].join(",")}`;
}

/**
 * Convenience helper: strokes near a "recent activity" point.
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
