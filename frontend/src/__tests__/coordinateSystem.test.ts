import { describe, expect, it } from "vitest";
import {
  boundsOfPoints,
  expandBounds,
  screenToWorld,
  unionBounds,
  worldToScreen,
  zoomCameraAtPoint,
} from "../canvas/CoordinateSystem";
import type { Camera } from "../types/document";

describe("screenToWorld / worldToScreen", () => {
  it("round-trips a point through world space and back", () => {
    const camera: Camera = { x: 100, y: -50, zoom: 2 };
    const viewport = { width: 800, height: 600 };
    const screenPoint = { x: 300, y: 450 };

    const world = screenToWorld(screenPoint, camera, viewport.width, viewport.height);
    const back = worldToScreen(world, camera, viewport.width, viewport.height);

    expect(back.x).toBeCloseTo(screenPoint.x, 6);
    expect(back.y).toBeCloseTo(screenPoint.y, 6);
  });

  it("places the camera target at the center of the viewport", () => {
    const camera: Camera = { x: 500, y: 500, zoom: 1 };
    const viewport = { width: 1000, height: 800 };
    const center = worldToScreen({ x: 500, y: 500 }, camera, viewport.width, viewport.height);
    expect(center.x).toBeCloseTo(500);
    expect(center.y).toBeCloseTo(400);
  });

  it("scales distances by zoom", () => {
    const camera: Camera = { x: 0, y: 0, zoom: 2 };
    const viewport = { width: 400, height: 400 };
    const a = worldToScreen({ x: 0, y: 0 }, camera, viewport.width, viewport.height);
    const b = worldToScreen({ x: 10, y: 0 }, camera, viewport.width, viewport.height);
    expect(b.x - a.x).toBeCloseTo(20); // 10 world units * zoom 2
  });
});

describe("zoomCameraAtPoint", () => {
  it("keeps the world point under the cursor fixed on screen", () => {
    const camera: Camera = { x: 0, y: 0, zoom: 1 };
    const viewport = { width: 1000, height: 800 };
    const pivotScreen = { x: 700, y: 200 };

    const worldBefore = screenToWorld(pivotScreen, camera, viewport.width, viewport.height);
    const nextCamera = zoomCameraAtPoint(camera, 2, pivotScreen, viewport.width, viewport.height, 0.05, 8);
    const worldAfter = screenToWorld(pivotScreen, nextCamera, viewport.width, viewport.height);

    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
    expect(nextCamera.zoom).toBeCloseTo(2);
  });

  it("clamps to the provided zoom range", () => {
    const camera: Camera = { x: 0, y: 0, zoom: 1 };
    const viewport = { width: 500, height: 500 };
    const pivot = { x: 250, y: 250 };

    const zoomedOut = zoomCameraAtPoint(camera, 0.0001, pivot, viewport.width, viewport.height, 0.1, 8);
    expect(zoomedOut.zoom).toBeCloseTo(0.1);

    const zoomedIn = zoomCameraAtPoint(camera, 10000, pivot, viewport.width, viewport.height, 0.1, 8);
    expect(zoomedIn.zoom).toBeCloseTo(8);
  });
});

describe("bounding box helpers", () => {
  it("computes the bounding box of a set of points", () => {
    const bounds = boundsOfPoints([
      { x: 5, y: 5 },
      { x: -3, y: 10 },
      { x: 8, y: -2 },
    ]);
    expect(bounds).toEqual({ minX: -3, minY: -2, maxX: 8, maxY: 10 });
  });

  it("returns a degenerate box for an empty point list", () => {
    expect(boundsOfPoints([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it("expands bounds by a margin on every side", () => {
    const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(expandBounds(bounds, 5)).toEqual({ minX: -5, minY: -5, maxX: 15, maxY: 15 });
  });

  it("unions two bounding boxes", () => {
    const a = { minX: 0, minY: 0, maxX: 5, maxY: 5 };
    const b = { minX: 3, minY: -2, maxX: 8, maxY: 4 };
    expect(unionBounds(a, b)).toEqual({ minX: 0, minY: -2, maxX: 8, maxY: 5 });
  });
});
