import type { BoundingBox, Camera, Point } from "../types/document";

/**
 * Screen coordinates -> Viewport transform (Camera) -> World coordinates.
 *
 * The camera describes where the world-space point (camera.x, camera.y) sits
 * at the center of the viewport, at the given zoom level. This is the single
 * source of truth for every conversion in the app: pointer input, hit
 * testing, region extraction and rendering all go through these functions so
 * that "world space" never drifts between subsystems.
 */

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface WorldPoint {
  x: number;
  y: number;
}

/** Convert a point from screen space (relative to the canvas element) to world space. */
export function screenToWorld(
  screen: ScreenPoint,
  camera: Camera,
  viewportWidth: number,
  viewportHeight: number
): WorldPoint {
  return {
    x: (screen.x - viewportWidth / 2) / camera.zoom + camera.x,
    y: (screen.y - viewportHeight / 2) / camera.zoom + camera.y,
  };
}

/** Convert a point from world space to screen space (relative to the canvas element). */
export function worldToScreen(
  world: WorldPoint,
  camera: Camera,
  viewportWidth: number,
  viewportHeight: number
): ScreenPoint {
  return {
    x: (world.x - camera.x) * camera.zoom + viewportWidth / 2,
    y: (world.y - camera.y) * camera.zoom + viewportHeight / 2,
  };
}

/** Zoom the camera by `factor`, keeping `pivotScreen` fixed on screen (cursor-anchored zoom). */
export function zoomCameraAtPoint(
  camera: Camera,
  factor: number,
  pivotScreen: ScreenPoint,
  viewportWidth: number,
  viewportHeight: number,
  minZoom: number,
  maxZoom: number
): Camera {
  const newZoom = clamp(camera.zoom * factor, minZoom, maxZoom);
  const actualFactor = newZoom / camera.zoom;
  if (actualFactor === 1) return camera;

  // World point currently under the cursor, before zoom.
  const worldBefore = screenToWorld(pivotScreen, camera, viewportWidth, viewportHeight);

  const nextCamera: Camera = { ...camera, zoom: newZoom };

  // World point under the cursor, after naively applying the new zoom.
  const worldAfter = screenToWorld(pivotScreen, nextCamera, viewportWidth, viewportHeight);

  // Shift camera so the same world point stays under the cursor.
  nextCamera.x += worldBefore.x - worldAfter.x;
  nextCamera.y += worldBefore.y - worldAfter.y;

  return nextCamera;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Axis-aligned bounding box of a set of points, in whatever space they are given. */
export function boundsOfPoints(points: Point[]): BoundingBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function expandBounds(b: BoundingBox, margin: number): BoundingBox {
  return {
    minX: b.minX - margin,
    minY: b.minY - margin,
    maxX: b.maxX + margin,
    maxY: b.maxY + margin,
  };
}

export function unionBounds(a: BoundingBox, b: BoundingBox): BoundingBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function boundsIntersect(a: BoundingBox, b: BoundingBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function boundsContainsPoint(b: BoundingBox, p: WorldPoint): boolean {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

export function boundsWidth(b: BoundingBox): number {
  return b.maxX - b.minX;
}

export function boundsHeight(b: BoundingBox): number {
  return b.maxY - b.minY;
}

/** World-space rectangle currently visible in the viewport, given the
 * camera and viewport size. Used both by CanvasRenderer's culling and by
 * the AI trigger's viewport-fallback ROI strategy — one implementation,
 * not two independently-maintained copies of the same math. */
export function viewportWorldBounds(
  camera: Camera,
  viewportWidth: number,
  viewportHeight: number
): BoundingBox {
  const halfW = viewportWidth / 2 / camera.zoom;
  const halfH = viewportHeight / 2 / camera.zoom;
  return {
    minX: camera.x - halfW,
    minY: camera.y - halfH,
    maxX: camera.x + halfW,
    maxY: camera.y + halfH,
  };
}
