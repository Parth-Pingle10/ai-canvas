import type { Camera } from "../types/document";
import { MAX_ZOOM, MIN_ZOOM } from "../types/tools";
import { clamp } from "./CoordinateSystem";

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
