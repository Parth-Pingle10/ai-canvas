import { describe, expect, it } from "vitest";
import { computeContentBounds } from "../utils/exportPng";
import { findNearbyStrokes } from "../canvas/RegionExtractor";
import { boundsOfPoints, expandBounds } from "../canvas/CoordinateSystem";
import { strokeIntersectsBox } from "../utils/geometry";
import type { Stroke } from "../types/document";

function stroke(id: string, points: { x: number; y: number }[]): Stroke {
  return {
    id,
    type: "stroke",
    points: points.map((p) => ({ ...p })),
    color: "#000",
    width: 2,
    tool: "pen",
    opacity: 1,
    bounds: boundsOfPoints(points),
    createdAt: 0,
    version: 1,
  };
}

describe("computeContentBounds", () => {
  it("returns null for an empty document", () => {
    expect(computeContentBounds([])).toBeNull();
  });

  it("computes the union bounding box of all strokes", () => {
    const strokes = [
      stroke("a", [{ x: 0, y: 0 }, { x: 10, y: 10 }]),
      stroke("b", [{ x: -20, y: 5 }, { x: 5, y: 30 }]),
    ];
    expect(computeContentBounds(strokes)).toEqual({ minX: -20, minY: 0, maxX: 10, maxY: 30 });
  });
});

describe("expandBounds (used to add margin before rasterizing a region)", () => {
  it("adds the given margin symmetrically", () => {
    const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 50 };
    expect(expandBounds(bounds, 20)).toEqual({ minX: -20, minY: -20, maxX: 120, maxY: 70 });
  });
});

describe("findNearbyStrokes", () => {
  it("returns only strokes whose bounds fall within the search radius", () => {
    const near = stroke("near", [{ x: 0, y: 0 }, { x: 5, y: 5 }]);
    const far = stroke("far", [{ x: 1000, y: 1000 }]);
    const result = findNearbyStrokes([near, far], { x: 0, y: 0 }, 50);
    expect(result.map((s) => s.id)).toEqual(["near"]);
  });
});

describe("strokeIntersectsBox (region membership test)", () => {
  it("detects a stroke whose points fall inside the box", () => {
    const s = stroke("s", [{ x: 5, y: 5 }, { x: 6, y: 6 }]);
    expect(strokeIntersectsBox(s, { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toBe(true);
  });

  it("returns false for a stroke entirely outside the box", () => {
    const s = stroke("s", [{ x: 500, y: 500 }]);
    expect(strokeIntersectsBox(s, { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toBe(false);
  });

  it("detects a large stroke that fully encloses a small box", () => {
    const s = stroke("s", [{ x: -100, y: -100 }, { x: 100, y: 100 }]);
    expect(strokeIntersectsBox(s, { minX: 40, minY: 40, maxX: 60, maxY: 60 })).toBe(true);
  });
});
