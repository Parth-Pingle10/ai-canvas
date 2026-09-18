import type {
  BoundingBox,
  Camera,
  CanvasConnector,
  CanvasShape,
  CanvasText,
  Point,
  Stroke,
} from "../types/document";
import { boundsIntersect } from "./CoordinateSystem";
import { drawHandle, drawSelectionBox, drawStroke } from "./StrokeRenderer";
import { drawCanvasText, drawConnector, drawShape } from "./ShapeRenderer";

export interface LaserTrail {
  id: string;
  points: Point[];
  createdAt: number;
  color?: string;
  width?: number;
}

export interface RenderInput {
  strokes: Stroke[];
  shapes?: CanvasShape[];
  connectors?: CanvasConnector[];
  textObjects?: CanvasText[];
  camera: Camera;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  /** In-progress stroke being drawn right now (not yet committed to the document). */
  liveStroke: Stroke | null;
  /** In-progress shape being drawn right now. */
  liveShape?: CanvasShape | null;
  /** In-progress connector being drawn right now. */
  liveConnector?: CanvasConnector | null;
  /** Active ephemeral laser trails (last 3 seconds). */
  laserTrails?: LaserTrail[];
  /** Selected element ids (strokes, shapes, connectors, text), for drawing bounding box + handles. */
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
    const strokes = input.strokes ?? [];
    const shapes = input.shapes ?? [];
    const connectors = input.connectors ?? [];
    const textObjects = input.textObjects ?? [];

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

    const visibleWorldBounds = this.visibleWorldBounds(camera, viewportWidth, viewportHeight);
    const shapesMap = new Map<string, CanvasShape>();
    for (const shape of shapes) {
      shapesMap.set(shape.id, shape);
    }
    if (input.liveShape) {
      shapesMap.set(input.liveShape.id, input.liveShape);
    }

    let visibleCount = 0;
    const totalCount = strokes.length + shapes.length + connectors.length + textObjects.length;

    // 1. Draw Connectors (behind shapes so connectors anchor smoothly)
    for (const connector of connectors) {
      if (!boundsIntersect(connector.bounds, visibleWorldBounds)) continue;
      const isDraft = connector.status === "draft";
      drawConnector(ctx, connector, shapesMap, camera.zoom, isDraft);
      visibleCount++;
    }

    if (input.liveConnector) {
      drawConnector(ctx, input.liveConnector, shapesMap, camera.zoom, false);
    }

    // 2. Draw Shapes
    for (const shape of shapes) {
      if (!boundsIntersect(shape.bounds, visibleWorldBounds)) continue;
      const isDraft = shape.status === "draft";
      drawShape(ctx, shape, camera.zoom, isDraft);
      visibleCount++;
    }

    if (input.liveShape) {
      drawShape(ctx, input.liveShape, camera.zoom, false);
    }

    // 3. Draw Text Objects
    for (const textObj of textObjects) {
      if (!boundsIntersect(textObj.bounds, visibleWorldBounds)) continue;
      const isDraft = textObj.status === "draft";
      drawCanvasText(ctx, textObj, camera.zoom, isDraft);
      visibleCount++;
    }

    // 4. Draw Strokes
    for (const stroke of strokes) {
      if (!boundsIntersect(stroke.bounds, visibleWorldBounds)) continue;
      drawStroke(ctx, stroke);
      visibleCount++;
    }

    if (input.liveStroke) {
      drawStroke(ctx, input.liveStroke);
    }

    // 4.5 Draw Laser Trails (ephemeral 3-second glowing laser lines)
    if (input.laserTrails && input.laserTrails.length > 0) {
      const now = Date.now();
      for (const trail of input.laserTrails) {
        const age = now - trail.createdAt;
        if (age >= 3000 || trail.points.length === 0) continue;
        const opacity = Math.max(0, 1 - age / 3000);
        const color = trail.color || "#ff2a5f";
        const width = trail.width || 5;

        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = opacity;

        // Outer neon glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 14 / camera.zoom;
        ctx.strokeStyle = color;
        ctx.lineWidth = width * 1.5;

        ctx.beginPath();
        ctx.moveTo(trail.points[0].x, trail.points[0].y);
        for (let i = 1; i < trail.points.length; i++) {
          ctx.lineTo(trail.points[i].x, trail.points[i].y);
        }
        ctx.stroke();

        // Core bright center
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(1.5, width * 0.5);
        ctx.stroke();

        // Glowing dot at tip
        const lastPt = trail.points[trail.points.length - 1];
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, width * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, width * 0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }

    // 5. Draw Selection Highlights and Handles
    if (input.selectedIds.size > 0) {
      const selectedBoundsList: BoundingBox[] = [];

      for (const stroke of strokes) {
        if (!input.selectedIds.has(stroke.id)) continue;
        drawSelectionBox(ctx, stroke.bounds, camera.zoom);
        selectedBoundsList.push(stroke.bounds);
      }
      for (const shape of shapes) {
        if (!input.selectedIds.has(shape.id)) continue;
        drawSelectionBox(ctx, shape.bounds, camera.zoom);
        selectedBoundsList.push(shape.bounds);
      }
      for (const connector of connectors) {
        if (!input.selectedIds.has(connector.id)) continue;
        drawSelectionBox(ctx, connector.bounds, camera.zoom);
        selectedBoundsList.push(connector.bounds);
      }
      for (const textObj of textObjects) {
        if (!input.selectedIds.has(textObj.id)) continue;
        drawSelectionBox(ctx, textObj.bounds, camera.zoom);
        selectedBoundsList.push(textObj.bounds);
      }

      const combined = combinedBoundsFromList(selectedBoundsList);
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

    // 6. Draw Marquee
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

    return { visibleCount, totalCount };
  }

  private visibleWorldBounds(
    camera: Camera,
    viewportWidth: number,
    viewportHeight: number
  ): BoundingBox {
    const halfW = viewportWidth / 2 / camera.zoom;
    const halfH = viewportHeight / 2 / camera.zoom;
    // Small padding so elements just off-screen don't pop in abruptly.
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

function combinedBoundsFromList(boundsList: BoundingBox[]): BoundingBox | null {
  if (boundsList.length === 0) return null;
  let b = boundsList[0];
  for (let i = 1; i < boundsList.length; i++) {
    const s = boundsList[i];
    b = {
      minX: Math.min(b.minX, s.minX),
      minY: Math.min(b.minY, s.minY),
      maxX: Math.max(b.maxX, s.maxX),
      maxY: Math.max(b.maxY, s.maxY),
    };
  }
  return b;
}
