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
 * Computes the unified bounding box encompassing an array of object bounding boxes.
 */
export function getObjectsBounds(boundsList: BoundingBox[]): BoundingBox {
  if (boundsList.length === 0) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  }
  return boundsList.reduce<BoundingBox>((acc, b) => unionBounds(acc, b), boundsList[0]);
}

/**
 * Calculates an intelligent, adaptive camera view focusing the COMPLETE AI-generated result.
 * Adds visual padding and scales zoom to ensure all generated shapes, connectors, and text fit comfortably.
 */
export function calculateFocusCamera(
  resultBounds: BoundingBox,
  options: FocusCameraOptions
): Camera {
  const {
    viewportWidth,
    viewportHeight,
    paddingFraction = 0.18,
    minZoom = 0.6,
    maxZoom = 1.2,
  } = options;

  const contentW = Math.max(60, boundsWidth(resultBounds));
  const contentH = Math.max(60, boundsHeight(resultBounds));
  const targetCenterX = (resultBounds.minX + resultBounds.maxX) / 2;
  const targetCenterY = (resultBounds.minY + resultBounds.maxY) / 2;

  const availW = Math.max(100, viewportWidth * (1 - paddingFraction * 2));
  const availH = Math.max(100, viewportHeight * (1 - paddingFraction * 2));
  const fitZoom = clamp(Math.min(availW / contentW, availH / contentH), minZoom, maxZoom);

  return {
    x: targetCenterX,
    y: targetCenterY,
    zoom: fitZoom,
  };
}

/**
 * Checks whether the given target bounds are already fully and comfortably visible
 * in the current camera viewport without requiring any zoom/pan jumps.
 */
export function isBoundsComfortablyVisible(
  bounds: BoundingBox,
  camera: Camera,
  viewportWidth: number,
  viewportHeight: number,
  marginFraction = 0.08
): boolean {
  const marginW = viewportWidth * marginFraction;
  const marginH = viewportHeight * marginFraction;

  const left = camera.x - (viewportWidth / 2 - marginW) / camera.zoom;
  const right = camera.x + (viewportWidth / 2 - marginW) / camera.zoom;
  const top = camera.y - (viewportHeight / 2 - marginH) / camera.zoom;
  const bottom = camera.y + (viewportHeight / 2 - marginH) / camera.zoom;

  return (
    bounds.minX >= left &&
    bounds.maxX <= right &&
    bounds.minY >= top &&
    bounds.maxY <= bottom
  );
}
