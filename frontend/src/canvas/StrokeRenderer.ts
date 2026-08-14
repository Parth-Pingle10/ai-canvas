import type { Stroke } from "../types/document";

/**
 * Renders a single stroke into a 2D context that already has the world->screen
 * transform applied (see CanvasRenderer). Points are drawn in world units so
 * stroke width scales naturally with zoom.
 */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  if (stroke.points.length === 0) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke.color;
  ctx.globalAlpha = stroke.opacity;

  if (stroke.tool === "highlighter") {
    // Multiply blending lets overlapping highlighter strokes darken like real ink.
    ctx.globalCompositeOperation = "multiply";
  } else {
    ctx.globalCompositeOperation = "source-over";
  }

  if (stroke.points.length === 1) {
    // A tap/dot: draw a filled circle so single clicks are still visible.
    const p = stroke.points[0];
    ctx.fillStyle = stroke.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

  // Pressure-sensitive width: draw as a sequence of segments when pressure data
  // varies meaningfully, otherwise a single fast path for the common case.
  const hasPressure = stroke.points.some(
    (p) => typeof p.pressure === "number" && p.pressure > 0 && p.pressure !== 1
  );

  if (!hasPressure) {
    ctx.lineWidth = stroke.width;
    for (let i = 1; i < stroke.points.length; i++) {
      const p = stroke.points[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  } else {
    // Variable-width path: stroke short segments individually.
    for (let i = 1; i < stroke.points.length; i++) {
      const prev = stroke.points[i - 1];
      const curr = stroke.points[i];
      const pressure = curr.pressure ?? 1;
      ctx.lineWidth = Math.max(0.5, stroke.width * clampPressure(pressure));
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function clampPressure(p: number): number {
  // Map raw pressure (0..1) to a visually pleasant width multiplier so thin
  // pressure never disappears entirely and heavy pressure doesn't blow out.
  return 0.4 + Math.min(1, Math.max(0, p)) * 0.9;
}

export function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  zoom: number
): void {
  ctx.save();
  ctx.strokeStyle = "#4c6ef5";
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([6 / zoom, 4 / zoom]);
  ctx.strokeRect(
    bounds.minX,
    bounds.minY,
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY
  );
  ctx.restore();
}

export function drawHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number
): void {
  const r = 5 / zoom;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#4c6ef5";
  ctx.lineWidth = 1.5 / zoom;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
