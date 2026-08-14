import { describe, expect, it } from "vitest";
import { computeRoi, roiSignature } from "../canvas/RegionExtractor";
import { boundsOfPoints } from "../canvas/CoordinateSystem";
import type { Stroke } from "../types/document";

function stroke(id: string, points: { x: number; y: number }[], version = 1): Stroke {
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
    version,
  };
}

const viewport = { minX: -500, minY: -500, maxX: 500, maxY: 500 };

describe("computeRoi", () => {
  it("prefers recent strokes when any are dirty", () => {
    const strokes = [
      stroke("a", [{ x: 0, y: 0 }, { x: 10, y: 10 }]),
      stroke("b", [{ x: 1000, y: 1000 }, { x: 1010, y: 1010 }]),
    ];
    const roi = computeRoi({
      strokes,
      recentStrokeIds: new Set(["a"]),
      selectedIds: ["b"],
      viewportWorldBounds: viewport,
    });
    expect(roi.source).toBe("recent-strokes");
    expect(roi.strokeIds).toEqual(["a"]);
    expect(roi.bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it("falls back to selection when nothing recent", () => {
    const strokes = [stroke("a", [{ x: 5, y: 5 }, { x: 15, y: 15 }])];
    const roi = computeRoi({
      strokes,
      recentStrokeIds: new Set(),
      selectedIds: ["a"],
      viewportWorldBounds: viewport,
    });
    expect(roi.source).toBe("selection");
    expect(roi.strokeIds).toEqual(["a"]);
  });

  it("falls back to the viewport when nothing recent or selected", () => {
    const strokes = [stroke("a", [{ x: 5, y: 5 }])];
    const roi = computeRoi({
      strokes,
      recentStrokeIds: new Set(),
      selectedIds: [],
      viewportWorldBounds: viewport,
    });
    expect(roi.source).toBe("viewport");
    expect(roi.bounds).toEqual(viewport);
    expect(roi.strokeIds).toEqual([]);
  });

  it("falls through to selection if the recent-stroke ids no longer exist", () => {
    const strokes = [stroke("b", [{ x: 2, y: 2 }])];
    const roi = computeRoi({
      strokes,
      recentStrokeIds: new Set(["deleted-id"]),
      selectedIds: ["b"],
      viewportWorldBounds: viewport,
    });
    expect(roi.source).toBe("selection");
  });
});

describe("roiSignature", () => {
  it("is stable regardless of stroke id ordering", () => {
    const strokes = [stroke("a", [{ x: 0, y: 0 }]), stroke("b", [{ x: 1, y: 1 }])];
    const sigA = roiSignature({ source: "recent-strokes", strokeIds: ["a", "b"] }, strokes);
    const sigB = roiSignature({ source: "recent-strokes", strokeIds: ["b", "a"] }, strokes);
    expect(sigA).toBe(sigB);
  });

  it("changes when a stroke's version changes (edited, not just re-ordered)", () => {
    const strokesBefore = [stroke("a", [{ x: 0, y: 0 }], 1)];
    const strokesAfter = [stroke("a", [{ x: 0, y: 0 }], 2)];
    const sigBefore = roiSignature({ source: "recent-strokes", strokeIds: ["a"] }, strokesBefore);
    const sigAfter = roiSignature({ source: "recent-strokes", strokeIds: ["a"] }, strokesAfter);
    expect(sigBefore).not.toBe(sigAfter);
  });

  it("differs between sources even with the same (empty) stroke set", () => {
    const sigSelection = roiSignature({ source: "selection", strokeIds: [] }, []);
    const sigViewport = roiSignature({ source: "viewport", strokeIds: [] }, []);
    expect(sigSelection).not.toBe(sigViewport);
  });
});
