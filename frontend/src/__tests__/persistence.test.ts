import { describe, expect, it } from "vitest";
import {
  DocumentParseError,
  UnsupportedVersionError,
  deserializeDocument,
  serializeDocument,
} from "../utils/persistence";
import { createEmptyDocument, type Stroke } from "../types/document";
import { boundsOfPoints } from "../canvas/CoordinateSystem";

function makeStroke(id: string): Stroke {
  const points = [
    { x: 0, y: 0, pressure: 1, tiltX: 0, tiltY: 0, timestamp: 1 },
    { x: 10, y: 5, pressure: 0.8, tiltX: 3, tiltY: -2, timestamp: 2 },
    { x: 20, y: -5, pressure: 0.6, tiltX: 0, tiltY: 0, timestamp: 3 },
  ];
  return {
    id,
    type: "stroke",
    points,
    color: "#e03131",
    width: 6,
    tool: "pen",
    opacity: 1,
    bounds: boundsOfPoints(points),
    createdAt: 123,
    version: 1,
  };
}

describe("stroke serialization round-trip", () => {
  it("preserves stroke data through JSON.stringify/parse via document save/load", () => {
    const doc = createEmptyDocument("My Canvas");
    doc.strokes = [makeStroke("s1"), makeStroke("s2")];

    const json = serializeDocument(doc);
    const restored = deserializeDocument(json);

    expect(restored.strokes).toHaveLength(2);
    expect(restored.strokes[0].points).toEqual(doc.strokes[0].points);
    expect(restored.strokes[0].color).toBe(doc.strokes[0].color);
    expect(restored.strokes[0].width).toBe(doc.strokes[0].width);
    expect(restored.strokes[0].tool).toBe(doc.strokes[0].tool);
    expect(restored.canvas.name).toBe("My Canvas");
  });

  it("recomputes bounds on load rather than trusting cached values", () => {
    const doc = createEmptyDocument();
    const stroke = makeStroke("s1");
    // Corrupt the cached bounds — load should not trust this.
    stroke.bounds = { minX: 999, minY: 999, maxX: 999, maxY: 999 };
    doc.strokes = [stroke];

    const restored = deserializeDocument(serializeDocument(doc));
    expect(restored.strokes[0].bounds).toEqual(boundsOfPoints(stroke.points));
  });
});

describe("deserializeDocument error handling", () => {
  it("throws DocumentParseError on invalid JSON", () => {
    expect(() => deserializeDocument("{not valid json")).toThrow(DocumentParseError);
  });

  it("throws DocumentParseError when strokes is missing", () => {
    expect(() => deserializeDocument(JSON.stringify({ version: 1, camera: { x: 0, y: 0, zoom: 1 } }))).toThrow(
      DocumentParseError
    );
  });

  it("throws UnsupportedVersionError for a future document version", () => {
    const raw = JSON.stringify({
      version: 999,
      camera: { x: 0, y: 0, zoom: 1 },
      strokes: [],
      canvas: { name: "x" },
    });
    expect(() => deserializeDocument(raw)).toThrow(UnsupportedVersionError);
  });

  it("throws DocumentParseError for malformed camera data", () => {
    const raw = JSON.stringify({ version: 1, camera: {}, strokes: [], canvas: { name: "x" } });
    expect(() => deserializeDocument(raw)).toThrow(DocumentParseError);
  });
});
