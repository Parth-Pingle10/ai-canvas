import { useCanvasStore } from "../state/canvasStore";
import { boundsOfPoints } from "../canvas/CoordinateSystem";
import type { Point, Stroke, StrokeTool } from "../types/document";
import { generateId } from "./id";
import { COLOR_PRESETS } from "../types/tools";

const TOOLS: StrokeTool[] = ["pen", "pencil", "highlighter"];

/**
 * Generates `count` short random strokes scattered across a large world-space
 * area and commits them in a single history step. Used to stress-test
 * rendering/pan/zoom/selection performance (see README "Performance" section
 * for the 100 / 1,000 / 5,000-stroke measurements taken with this helper).
 * Dev-only: wired to `window.__seedStrokes` and never included in production
 * builds' behavior (see App.tsx's `import.meta.env.DEV` guard).
 */
export function seedRandomStrokes(count: number): void {
  const strokes: Stroke[] = [];
  const spread = 8000;

  for (let i = 0; i < count; i++) {
    const cx = (Math.random() - 0.5) * spread;
    const cy = (Math.random() - 0.5) * spread;
    const pointCount = 3 + Math.floor(Math.random() * 8);
    const points: Point[] = [];
    let x = cx;
    let y = cy;
    for (let p = 0; p < pointCount; p++) {
      x += (Math.random() - 0.5) * 40;
      y += (Math.random() - 0.5) * 40;
      points.push({ x, y, pressure: 1, tiltX: 0, tiltY: 0, timestamp: Date.now() });
    }
    const tool = TOOLS[Math.floor(Math.random() * TOOLS.length)];
    strokes.push({
      id: generateId("stroke"),
      type: "stroke",
      points,
      color: COLOR_PRESETS[Math.floor(Math.random() * COLOR_PRESETS.length)],
      width: 2 + Math.random() * 6,
      tool,
      opacity: tool === "highlighter" ? 0.35 : 1,
      bounds: boundsOfPoints(points),
      createdAt: Date.now(),
      version: 1,
    });
  }

  const existing = useCanvasStore.getState().strokes;
  useCanvasStore.getState().commitStrokes([...existing, ...strokes]);
  // eslint-disable-next-line no-console
  console.log(`Seeded ${count} strokes (total now ${existing.length + strokes.length}).`);
}
