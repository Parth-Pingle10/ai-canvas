import { describe, expect, it } from "vitest";
import { createCleanShape, detectRoughShape } from "../utils/shapeRecognition";
import type { Stroke } from "../types/document";
import { boundsOfPoints } from "../canvas/CoordinateSystem";

function makeCircleStroke(): Stroke {
  const points = [];
  const cx = 100;
  const cy = 100;
  const r = 50;
  for (let i = 0; i <= 36; i++) {
    const angle = (i / 36) * Math.PI * 2;
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return {
    id: "circ",
    type: "stroke",
    points,
    color: "#000",
    width: 2,
    tool: "pen",
    opacity: 1,
    bounds: boundsOfPoints(points),
    createdAt: 0,
    version: 1,
  };
}

function makeRectangleStroke(): Stroke {
  const points = [
    { x: 50, y: 50 },
    { x: 150, y: 50 },
    { x: 150, y: 120 },
    { x: 50, y: 120 },
    { x: 50, y: 50 },
  ];
  return {
    id: "rect",
    type: "stroke",
    points,
    color: "#000",
    width: 2,
    tool: "pen",
    opacity: 1,
    bounds: boundsOfPoints(points),
    createdAt: 0,
    version: 1,
  };
}

function makeTriangleStroke(): Stroke {
  const points = [
    { x: 100, y: 50 },
    { x: 150, y: 150 },
    { x: 50, y: 150 },
    { x: 100, y: 50 },
  ];
  return {
    id: "tri",
    type: "stroke",
    points,
    color: "#000",
    width: 2,
    tool: "pen",
    opacity: 1,
    bounds: boundsOfPoints(points),
    createdAt: 0,
    version: 1,
  };
}

describe("shapeRecognition", () => {
  it("detects circular strokes as circle", () => {
    const s = makeCircleStroke();
    const result = detectRoughShape([s]);
    expect(result).not.toBeNull();
    expect(result?.shapeType).toBe("circle");
    expect(result?.confidence).toBeGreaterThan(0.7);
  });

  it("detects rectangular strokes as rectangle", () => {
    const s = makeRectangleStroke();
    const result = detectRoughShape([s]);
    expect(result).not.toBeNull();
    expect(result?.shapeType).toBe("rectangle");
  });

  it("detects triangular strokes as triangle", () => {
    const s = makeTriangleStroke();
    const result = detectRoughShape([s]);
    expect(result).not.toBeNull();
    expect(result?.shapeType).toBe("triangle");
  });

  it("creates clean CanvasShape draft matching bounds", () => {
    const bbox = { minX: 50, minY: 50, maxX: 150, maxY: 120 };
    const shape = createCleanShape("rectangle", bbox, "#ff0000", "My Box");
    expect(shape.type).toBe("shape");
    expect(shape.shapeType).toBe("rectangle");
    expect(shape.x).toBe(50);
    expect(shape.y).toBe(50);
    expect(shape.width).toBe(100);
    expect(shape.height).toBe(70);
    expect(shape.text).toBe("My Box");
    expect(shape.status).toBe("draft");
  });
});
