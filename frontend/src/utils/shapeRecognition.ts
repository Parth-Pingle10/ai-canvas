import type { BoundingBox, CanvasShape, Point, ShapeType, Stroke } from "../types/document";
import { generateId } from "./id";
import { boundsOfShape } from "../canvas/ShapeRenderer";

/**
 * Geometric analysis for rough freehand strokes.
 * Uses Douglas-Peucker polygon simplification, circularity, and vertex analysis
 * to recognize intended geometric shapes generically.
 */

export interface RecognizedShapeResult {
  shapeType: ShapeType;
  confidence: number;
  bounds: BoundingBox;
}

export function detectRoughShape(strokes: Stroke[]): RecognizedShapeResult | null {
  if (strokes.length === 0) return null;

  const allPoints: Point[] = [];
  for (const s of strokes) {
    allPoints.push(...s.points);
  }

  if (allPoints.length < 3) return null;

  const bbox = computePointsBounds(allPoints);
  const width = bbox.maxX - bbox.minX;
  const height = bbox.maxY - bbox.minY;

  if (width < 8 || height < 8) return null;

  const firstPt = allPoints[0];
  const lastPt = allPoints[allPoints.length - 1];
  const endDistance = Math.hypot(firstPt.x - lastPt.x, firstPt.y - lastPt.y);
  const perimeter = computePolylineLength(allPoints);
  const isClosed = endDistance < Math.max(30, perimeter * 0.3);

  const area = computePolygonArea(allPoints);
  const circularity = perimeter > 0 ? (4 * Math.PI * Math.abs(area)) / (perimeter * perimeter) : 0;
  const aspectRatio = width / Math.max(1, height);

  // 1. Polygon simplification
  const epsilon = Math.max(4, perimeter * 0.04);
  const simplified = ramerDouglasPeucker(allPoints, epsilon);
  const vertexCount = simplified.length - (isClosed ? 1 : 0);

  if (vertexCount === 3) {
    return { shapeType: "triangle", confidence: 0.9, bounds: bbox };
  }

  if (vertexCount === 4) {
    const isDiamond = checkIsDiamond(simplified, bbox);
    return {
      shapeType: isDiamond ? "diamond" : "rectangle",
      confidence: 0.88,
      bounds: bbox,
    };
  }

  // 2. Circle / Ellipse test (high circularity for smooth round curves)
  if (isClosed && circularity > 0.78 && allPoints.length >= 8) {
    const isCircle = aspectRatio >= 0.75 && aspectRatio <= 1.35;
    return {
      shapeType: isCircle ? "circle" : "ellipse",
      confidence: Math.min(0.95, circularity),
      bounds: bbox,
    };
  }

  if (vertexCount >= 5 && isClosed) {
    if (circularity > 0.65) {
      return {
        shapeType: aspectRatio >= 0.75 && aspectRatio <= 1.35 ? "circle" : "rounded_rectangle",
        confidence: 0.82,
        bounds: bbox,
      };
    }
    return { shapeType: "rectangle", confidence: 0.78, bounds: bbox };
  }

  return { shapeType: "rectangle", confidence: 0.7, bounds: bbox };
}

export function createCleanShape(
  shapeType: ShapeType,
  bounds: BoundingBox,
  strokeColor = "#1e1e1e",
  label = "",
  isDraft = true,
  draftGroupId?: string,
  sourceStrokeIds?: string[],
  sourceBounds?: BoundingBox
): CanvasShape {
  const width = Math.max(40, bounds.maxX - bounds.minX);
  const height = Math.max(40, bounds.maxY - bounds.minY);
  const shape: CanvasShape = {
    id: generateId("shape"),
    type: "shape",
    shapeType,
    x: bounds.minX,
    y: bounds.minY,
    width,
    height,
    strokeColor,
    fillColor: "#ffffff",
    strokeWidth: 2.5,
    opacity: 1,
    text: label || undefined,
    textColor: strokeColor,
    fontSize: 14,
    bounds: { minX: bounds.minX, minY: bounds.minY, maxX: bounds.minX + width, maxY: bounds.minY + height },
    status: isDraft ? "draft" : "confirmed",
    draftGroupId,
    sourceStrokeIds,
    sourceBounds: sourceBounds ?? bounds,
    createdAt: Date.now(),
    version: 1,
  };
  shape.bounds = boundsOfShape(shape);
  return shape;
}

function computePointsBounds(pts: Point[]): BoundingBox {
  let minX = pts[0].x;
  let minY = pts[0].y;
  let maxX = pts[0].x;
  let maxY = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].x < minX) minX = pts[i].x;
    if (pts[i].y < minY) minY = pts[i].y;
    if (pts[i].x > maxX) maxX = pts[i].x;
    if (pts[i].y > maxY) maxY = pts[i].y;
  }
  return { minX, minY, maxX, maxY };
}

function computePolylineLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

function computePolygonArea(pts: Point[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

function ramerDouglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const rec1 = ramerDouglasPeucker(points.slice(0, index + 1), epsilon);
    const rec2 = ramerDouglasPeucker(points.slice(index), epsilon);
    return rec1.slice(0, rec1.length - 1).concat(rec2);
  } else {
    return [points[0], points[end]];
  }
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

function checkIsDiamond(vertices: Point[], bbox: BoundingBox): boolean {
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;

  // In a diamond, vertices are near top-center, right-center, bottom-center, left-center
  let nearCardinal = 0;
  for (const v of vertices) {
    const isTopOrBottom = Math.abs(v.x - cx) < w * 0.25 && (Math.abs(v.y - bbox.minY) < h * 0.25 || Math.abs(v.y - bbox.maxY) < h * 0.25);
    const isLeftOrRight = Math.abs(v.y - cy) < h * 0.25 && (Math.abs(v.x - bbox.minX) < w * 0.25 || Math.abs(v.x - bbox.maxX) < w * 0.25);
    if (isTopOrBottom || isLeftOrRight) nearCardinal++;
  }
  return nearCardinal >= 3;
}
