import type { BoundingBox, Camera, Stroke } from "../types/document";
import { boundsIntersect } from "./CoordinateSystem";
import { drawHandle, drawSelectionBox, drawStroke } from "./StrokeRenderer";

export interface RenderInput {
  strokes: Stroke[];
  camera: Camera;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  /** In-progress stroke being drawn right now (not yet committed to the document). */
  liveStroke: Stroke | null;
  /** Selected stroke ids, for drawing bounding box + handles. */
  selectedIds: Set<string>;
  /** Marquee selection rectangle, in world space, while dragging. */
  marquee: BoundingBox | null;
  showGrid: boolean;
}

/**
 * Owns the visible <canvas> element and draws one frame at a time.
 * Rendering is intentionally decoupled from React state updates: CanvasView
 * calls `render()` imperatively (via requestAnimationFrame), so drawing a
 * stroke never triggers a React re-render of the whole tree.
 */
export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas context is not available in this browser.");
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
  }

  render(input: RenderInput): { visibleCount: number; totalCount: number } {
    const { ctx } = this;
    const { camera, viewportWidth, viewportHeight, devicePixelRatio: dpr } = input;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // World -> screen -> device-pixel transform, composed in one setTransform
    // call: scale for DPR, then camera zoom, then center + camera offset.
    ctx.setTransform(
      camera.zoom * dpr,
      0,
      0,
      camera.zoom * dpr,
      (viewportWidth / 2 - camera.x * camera.zoom) * dpr,
      (viewportHeight / 2 - camera.y * camera.zoom) * dpr
    );

    if (input.showGrid) {
      this.drawGrid(camera, viewportWidth, viewportHeight);
    }

    // Viewport culling: only draw strokes whose bounds intersect the visible
    // world-space rectangle. Cheap O(n) scan is plenty fast up to tens of
    // thousands of strokes; see docs/CANVAS_ARCHITECTURE.md for the tradeoff.
    const visibleWorldBounds = this.visibleWorldBounds(camera, viewportWidth, viewportHeight);

    let visibleCount = 0;
    for (const stroke of input.strokes) {
      if (!boundsIntersect(stroke.bounds, visibleWorldBounds)) continue;
      drawStroke(ctx, stroke);
      visibleCount++;
    }

    if (input.liveStroke) {
      drawStroke(ctx, input.liveStroke);
    }

    if (input.selectedIds.size > 0) {
      for (const stroke of input.strokes) {
        if (!input.selectedIds.has(stroke.id)) continue;
        drawSelectionBox(ctx, stroke.bounds, camera.zoom);
      }
      const combined = combinedBounds(
        input.strokes.filter((s) => input.selectedIds.has(s.id))
      );
      if (combined && input.selectedIds.size > 1) {
        drawSelectionBox(ctx, combined, camera.zoom);
      }
      if (combined) {
        drawHandle(ctx, combined.minX, combined.minY, camera.zoom);
        drawHandle(ctx, combined.maxX, combined.minY, camera.zoom);
        drawHandle(ctx, combined.minX, combined.maxY, camera.zoom);
        drawHandle(ctx, combined.maxX, combined.maxY, camera.zoom);
      }
    }

    if (input.marquee) {
      const ctx2 = this.ctx;
      ctx2.save();
      ctx2.fillStyle = "rgba(76, 110, 245, 0.1)";
      ctx2.strokeStyle = "#4c6ef5";
      ctx2.lineWidth = 1 / camera.zoom;
      const m = input.marquee;
      ctx2.fillRect(m.minX, m.minY, m.maxX - m.minX, m.maxY - m.minY);
      ctx2.strokeRect(m.minX, m.minY, m.maxX - m.minX, m.maxY - m.minY);
      ctx2.restore();
    }

    return { visibleCount, totalCount: input.strokes.length };
  }

  private visibleWorldBounds(
    camera: Camera,
    viewportWidth: number,
    viewportHeight: number
  ): BoundingBox {
    const halfW = viewportWidth / 2 / camera.zoom;
    const halfH = viewportHeight / 2 / camera.zoom;
    // Small padding so strokes just off-screen don't pop in abruptly.
    const pad = Math.max(halfW, halfH) * 0.05;
    return {
      minX: camera.x - halfW - pad,
      minY: camera.y - halfH - pad,
      maxX: camera.x + halfW + pad,
      maxY: camera.y + halfH + pad,
    };
  }

  private drawGrid(camera: Camera, viewportWidth: number, viewportHeight: number): void {
    const { ctx } = this;
    const spacing = niceGridSpacing(camera.zoom);
    const bounds = this.visibleWorldBounds(camera, viewportWidth, viewportHeight);
    ctx.save();
    ctx.strokeStyle = "#eeeeee";
    ctx.lineWidth = 1 / camera.zoom;
    const startX = Math.floor(bounds.minX / spacing) * spacing;
    const startY = Math.floor(bounds.minY / spacing) * spacing;
    ctx.beginPath();
    for (let x = startX; x <= bounds.maxX; x += spacing) {
      ctx.moveTo(x, bounds.minY);
      ctx.lineTo(x, bounds.maxY);
    }
    for (let y = startY; y <= bounds.maxY; y += spacing) {
      ctx.moveTo(bounds.minX, y);
      ctx.lineTo(bounds.maxX, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function niceGridSpacing(zoom: number): number {
  const target = 60; // desired screen-space spacing in px
  const raw = target / zoom;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  let nice = 1;
  if (norm >= 5) nice = 10;
  else if (norm >= 2) nice = 5;
  else if (norm >= 1) nice = 2;
  return nice * pow;
}

function combinedBounds(strokes: Stroke[]): BoundingBox | null {
  if (strokes.length === 0) return null;
  let b = strokes[0].bounds;
  for (let i = 1; i < strokes.length; i++) {
    const s = strokes[i].bounds;
    b = {
      minX: Math.min(b.minX, s.minX),
      minY: Math.min(b.minY, s.minY),
      maxX: Math.max(b.maxX, s.maxX),
      maxY: Math.max(b.maxY, s.maxY),
    };
  }
  return b;
}
