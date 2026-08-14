import type { BoundingBox, Point, Stroke } from "../types/document";
import { boundsContainsPoint, boundsIntersect } from "../canvas/CoordinateSystem";

/** Minimum distance from a point to a stroke's polyline, in world units. */
export function distanceToStroke(px: number, py: number, stroke: Stroke): number {
  const pts = stroke.points;
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) return distance(px, py, pts[0].x, pts[0].y);

  let min = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const d = distanceToSegment(px, py, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    if (d < min) min = d;
  }
  return min;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq === 0) return distance(px, py, ax, ay);
  let t = ((px - ax) * abx + (py - ay) * aby) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * abx;
  const projY = ay + t * aby;
  return distance(px, py, projX, projY);
}

/** Hit test: is world point (x,y) "on" this stroke, given a pick radius in world units? */
export function hitTestStroke(x: number, y: number, stroke: Stroke, pickRadius: number): boolean {
  return distanceToStroke(x, y, stroke) <= Math.max(pickRadius, stroke.width / 2 + pickRadius * 0.5);
}

/** Does a segment (p1..p2) cross an axis-aligned box, in whole or in part?
 *  Standard slab/parametric clipping test. */
function segmentIntersectsBox(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  box: BoundingBox
): boolean {
  let tMin = 0;
  let tMax = 1;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  for (const [d, origin, min, max] of [
    [dx, p1.x, box.minX, box.maxX],
    [dy, p1.y, box.minY, box.maxY],
  ] as const) {
    if (d === 0) {
      if (origin < min || origin > max) return false;
      continue;
    }
    let t1 = (min - origin) / d;
    let t2 = (max - origin) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

/** Does a stroke intersect a marquee/lasso rectangle (world space)? Bounds
 *  overlap first as a cheap reject, then each segment is tested against the
 *  box so a stroke that only clips through (or fully encloses) the box is
 *  still detected, not just strokes with a sampled point inside it. */
export function strokeIntersectsBox(stroke: Stroke, box: BoundingBox): boolean {
  if (!boundsIntersect(stroke.bounds, box)) return false;

  if (stroke.points.length === 1) {
    return boundsContainsPoint(box, stroke.points[0]);
  }

  for (let i = 1; i < stroke.points.length; i++) {
    if (segmentIntersectsBox(stroke.points[i - 1], stroke.points[i], box)) return true;
  }
  return false;
}

export function translatePoints(points: Point[], dx: number, dy: number): Point[] {
  return points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

export function scalePoints(
  points: Point[],
  origin: { x: number; y: number },
  scaleX: number,
  scaleY: number
): Point[] {
  return points.map((p) => ({
    ...p,
    x: origin.x + (p.x - origin.x) * scaleX,
    y: origin.y + (p.y - origin.y) * scaleY,
  }));
}
