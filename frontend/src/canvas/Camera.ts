import type { BoundingBox, Camera } from "../types/document";
import { MAX_ZOOM, MIN_ZOOM } from "../types/tools";
import { boundsHeight, boundsWidth, clamp, unionBounds } from "./CoordinateSystem";

export function createDefaultCamera(): Camera {
  return { x: 0, y: 0, zoom: 1 };
}

/** Pan the camera by a screen-space delta (converted using current zoom). */
export function panCamera(camera: Camera, dxScreen: number, dyScreen: number): Camera {
  return {
    ...camera,
    x: camera.x - dxScreen / camera.zoom,
    y: camera.y - dyScreen / camera.zoom,
  };
}

export function clampZoom(zoom: number): number {
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}

export interface FocusCameraOptions {
  viewportWidth: number;
  viewportHeight: number;
  currentCamera: Camera;
  sourceBounds?: BoundingBox;
  paddingFraction?: number;
  minZoom?: number;
  maxZoom?: number;
}

/**
 * Calculates a smooth, context-preserving camera view to focus generated AI content.
 * Respects user's current zoom if content fits; zooms in/out gracefully if content is off-screen.
 */
export function calculateFocusCamera(
  targetBounds: BoundingBox,
  options: FocusCameraOptions
): Camera {
  const {
    viewportWidth,
    viewportHeight,
    currentCamera,
    sourceBounds,
    paddingFraction = 0.22,
    minZoom = 0.55,
    maxZoom = 1.3,
  } = options;

  let framingBounds = targetBounds;
  if (sourceBounds) {
    const dist = Math.hypot(
      (targetBounds.minX + targetBounds.maxX) / 2 - (sourceBounds.minX + sourceBounds.maxX) / 2,
      (targetBounds.minY + targetBounds.maxY) / 2 - (sourceBounds.minY + sourceBounds.maxY) / 2
    );
    if (dist < 2500) {
      framingBounds = unionBounds(targetBounds, sourceBounds);
    }
  }

  const contentW = Math.max(80, boundsWidth(framingBounds));
  const contentH = Math.max(80, boundsHeight(framingBounds));
  const targetCenterX = (framingBounds.minX + framingBounds.maxX) / 2;
  const targetCenterY = (framingBounds.minY + framingBounds.maxY) / 2;

  const availW = Math.max(200, viewportWidth * (1 - paddingFraction * 2));
  const availH = Math.max(200, viewportHeight * (1 - paddingFraction * 2));
  const fitZoom = Math.min(availW / contentW, availH / contentH);

  let targetZoom = currentCamera.zoom;
  const contentPixelsW = contentW * currentCamera.zoom;
  const contentPixelsH = contentH * currentCamera.zoom;

  if (contentPixelsW > viewportWidth * 0.88 || contentPixelsH > viewportHeight * 0.88) {
    targetZoom = clamp(fitZoom, minZoom, maxZoom);
  } else if (currentCamera.zoom < 0.5 && fitZoom > 0.75) {
    targetZoom = clamp(fitZoom, 0.75, 1.15);
  } else {
    targetZoom = clamp(currentCamera.zoom, minZoom, maxZoom);
  }

  return {
    x: targetCenterX,
    y: targetCenterY,
    zoom: targetZoom,
  };
}

