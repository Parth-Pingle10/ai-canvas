import type { BoundingBox, CanvasConnector, CanvasShape, CanvasText, ConnectorAnchor, Point, ShapeType } from "../types/document";

/**
 * ShapeRenderer: draws native shapes, connectors, and text on a 2D canvas context.
 * Points are in world space (transform already applied by CanvasRenderer).
 */

export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: CanvasShape,
  zoom: number,
  isDraft = false
): void {
  const { x, y, width: w, height: h, shapeType, strokeColor, fillColor, strokeWidth, opacity } = shape;
  if (w <= 0 || h <= 0) return;

  ctx.save();
  ctx.globalAlpha = opacity ?? 1;
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = fillColor ?? "#ffffff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (isDraft) {
    ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.strokeStyle = "#4c6ef5";
  } else if (shape.strokeStyle === "dashed") {
    ctx.setLineDash([8 / zoom, 6 / zoom]);
  }

  ctx.beginPath();
  buildShapePath(ctx, shapeType, x, y, w, h);

  if (fillColor && fillColor !== "transparent") {
    ctx.fill();
  } else {
    // Fill white by default so shapes are opaque over grid/strokes
    ctx.fillStyle = isDraft ? "rgba(235, 240, 255, 0.85)" : "#ffffff";
    ctx.fill();
  }
  ctx.stroke();

  // If draft, add a subtle draft badge or glow outline
  if (isDraft) {
    ctx.save();
    ctx.strokeStyle = "rgba(76, 110, 245, 0.4)";
    ctx.lineWidth = strokeWidth + 2;
    ctx.stroke();
    ctx.restore();
  }

  // Draw text label if present
  if (shape.text) {
    drawShapeLabel(ctx, shape.text, x, y, w, h, shape.fontSize ?? 14, shape.textColor ?? strokeColor);
  }

  ctx.restore();
}

function buildShapePath(
  ctx: CanvasRenderingContext2D,
  type: ShapeType,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const cx = x + w / 2;
  const cy = y + h / 2;

  switch (type) {
    case "rectangle":
    case "rounded_rectangle": {
      const radius = Math.min(12, Math.max(4, Math.min(w, h) / 4));
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, w, h, radius);
      } else {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
      }
      break;
    }
    case "circle":
    case "ellipse": {
      const rx = w / 2;
      const ry = h / 2;
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      break;
    }
    case "triangle":
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    case "diamond":
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, cy);
      ctx.lineTo(cx, y + h);
      ctx.lineTo(x, cy);
      ctx.closePath();
      break;
    default: {
      const radius = Math.min(12, Math.max(4, Math.min(w, h) / 4));
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, w, h, radius);
      } else {
        ctx.rect(x, y, w, h);
      }
      break;
    }
  }
}

function drawShapeLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize: number,
  textColor: string
): void {
  ctx.save();
  ctx.fillStyle = textColor;
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const padding = 12;
  const maxTextWidth = Math.max(20, w - padding * 2);
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxTextWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineHeight = fontSize * 1.25;
  const totalTextHeight = lines.length * lineHeight;
  const startY = y + h / 2 - totalTextHeight / 2 + lineHeight / 2;
  const cx = x + w / 2;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], cx, startY + i * lineHeight, maxTextWidth);
  }

  ctx.restore();
}

export function drawConnector(
  ctx: CanvasRenderingContext2D,
  connector: CanvasConnector,
  shapesMap: Map<string, CanvasShape>,
  zoom: number,
  isDraft = false
): void {
  const { start, end } = resolveConnectorEndpoints(connector, shapesMap);
  const { strokeColor, strokeWidth, routing = "straight", startArrow, endArrow = true, label } = connector;

  ctx.save();
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = strokeColor;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (isDraft) {
    ctx.setLineDash([5 / zoom, 4 / zoom]);
    ctx.strokeStyle = "#4c6ef5";
    ctx.fillStyle = "#4c6ef5";
  } else if (connector.strokeStyle === "dashed") {
    ctx.setLineDash([6 / zoom, 4 / zoom]);
  }

  const points = computeConnectorPoints(start, end, routing);
  if (points.length < 2) {
    ctx.restore();
    return;
  }

  const headLength = Math.max(12, strokeWidth * 3.5);

  // Shorten the line endpoints so the stroke never pierces or passes the arrowhead tip
  let lineStart = { ...points[0] };
  let lineEnd = { ...points[points.length - 1] };

  if (startArrow && points.length >= 2) {
    const p1 = points[1];
    const angle = Math.atan2(lineStart.y - p1.y, lineStart.x - p1.x);
    const dist = Math.hypot(lineStart.x - p1.x, lineStart.y - p1.y);
    const offset = Math.min(headLength * 0.85, dist * 0.5);
    lineStart = {
      x: lineStart.x - Math.cos(angle) * offset,
      y: lineStart.y - Math.sin(angle) * offset,
    };
  }

  if (endArrow && points.length >= 2) {
    const pPrev = points[points.length - 2];
    const angle = Math.atan2(lineEnd.y - pPrev.y, lineEnd.x - pPrev.x);
    const dist = Math.hypot(lineEnd.x - pPrev.x, lineEnd.y - pPrev.y);
    const offset = Math.min(headLength * 0.85, dist * 0.5);
    lineEnd = {
      x: lineEnd.x - Math.cos(angle) * offset,
      y: lineEnd.y - Math.sin(angle) * offset,
    };
  }

  // Draw connector line path
  ctx.beginPath();
  ctx.moveTo(lineStart.x, lineStart.y);
  for (let i = 1; i < points.length - 1; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.lineTo(lineEnd.x, lineEnd.y);
  ctx.stroke();

  // Draw arrowheads at the actual target tips
  if (endArrow && points.length >= 2) {
    const pPrev = points[points.length - 2];
    const pEnd = points[points.length - 1];
    drawArrowHead(ctx, pPrev, pEnd, strokeWidth, zoom);
  }
  if (startArrow && points.length >= 2) {
    drawArrowHead(ctx, points[1], points[0], strokeWidth, zoom);
  }

  // Draw label badge if present
  if (label) {
    const midX = (points[0].x + points[points.length - 1].x) / 2;
    const midY = (points[0].y + points[points.length - 1].y) / 2;
    drawConnectorLabel(ctx, label, midX, midY, strokeColor, isDraft);
  }

  ctx.restore();
}

function computeConnectorPoints(
  start: Point,
  end: Point,
  routing: "straight" | "orthogonal"
): Point[] {
  if (routing !== "orthogonal") {
    return [start, end];
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // Determine dominant axis for smooth orthogonal routing
  if (Math.abs(dx) > Math.abs(dy)) {
    const midX = start.x + dx / 2;
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  } else {
    const midY = start.y + dy / 2;
    return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
  }
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  strokeWidth: number,
  _zoom: number
): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const headLength = Math.max(12, strokeWidth * 3.5);
  const headWidth = Math.max(8, strokeWidth * 2.2);

  ctx.save();
  ctx.setLineDash([]); // solid arrowhead
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLength * Math.cos(angle) + headWidth * Math.sin(angle),
    to.y - headLength * Math.sin(angle) - headWidth * Math.cos(angle)
  );
  ctx.lineTo(
    to.x - headLength * Math.cos(angle) - headWidth * Math.sin(angle),
    to.y - headLength * Math.sin(angle) + headWidth * Math.cos(angle)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawConnectorLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  color: string,
  isDraft: boolean
): void {
  ctx.save();
  ctx.font = "600 12px system-ui, -apple-system, sans-serif";
  const metrics = ctx.measureText(label);
  const padX = 6;
  const boxW = metrics.width + padX * 2;
  const boxH = 18;
  const boxX = x - boxW / 2;
  const boxY = y - boxH / 2;

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = isDraft ? "#4c6ef5" : "#ced4da";
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y);
  ctx.restore();
}

export function resolveConnectorEndpoints(
  connector: CanvasConnector,
  shapesMap: Map<string, CanvasShape>
): { start: Point; end: Point } {
  let start: Point = { x: connector.startX, y: connector.startY };
  let end: Point = { x: connector.endX, y: connector.endY };

  const sourceShape = connector.fromId ? shapesMap.get(connector.fromId) : undefined;
  const targetShape = connector.toId ? shapesMap.get(connector.toId) : undefined;

  if (sourceShape && targetShape) {
    start = getAnchorPoint(sourceShape, connector.fromAnchor ?? "auto", { x: targetShape.x + targetShape.width / 2, y: targetShape.y + targetShape.height / 2 });
    end = getAnchorPoint(targetShape, connector.toAnchor ?? "auto", start);
  } else if (sourceShape) {
    start = getAnchorPoint(sourceShape, connector.fromAnchor ?? "auto", end);
  } else if (targetShape) {
    end = getAnchorPoint(targetShape, connector.toAnchor ?? "auto", start);
  }

  return { start, end };
}

export function getAnchorPoint(
  shape: CanvasShape,
  anchor: ConnectorAnchor = "auto",
  reference?: Point
): Point {
  const { x, y, width: w, height: h } = shape;
  const cx = x + w / 2;
  const cy = y + h / 2;

  if (anchor === "auto" && reference) {
    // Choose the anchor closest to the reference point
    const candidates: { anchor: ConnectorAnchor; pt: Point; dist: number }[] = [
      { anchor: "top", pt: { x: cx, y }, dist: Math.hypot(cx - reference.x, y - reference.y) },
      { anchor: "bottom", pt: { x: cx, y: y + h }, dist: Math.hypot(cx - reference.x, y + h - reference.y) },
      { anchor: "left", pt: { x, y: cy }, dist: Math.hypot(x - reference.x, cy - reference.y) },
      { anchor: "right", pt: { x: x + w, y: cy }, dist: Math.hypot(x + w - reference.x, cy - reference.y) },
    ];
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates[0].pt;
  }

  switch (anchor) {
    case "top":
      return { x: cx, y };
    case "bottom":
      return { x: cx, y: y + h };
    case "left":
      return { x, y: cy };
    case "right":
      return { x: x + w, y: cy };
    case "center":
    default:
      return { x: cx, y: cy };
  }
}

export function drawCanvasText(
  ctx: CanvasRenderingContext2D,
  textObj: CanvasText,
  _zoom: number,
  isDraft = false
): void {
  const { x, y, text, fontSize, fontColor, fontWeight = "600", align = "left" } = textObj;
  if (!text) return;

  ctx.save();
  ctx.fillStyle = fontColor;
  const fontFamily = textObj.fontFamily || '"Trebuchet MS", "Segoe UI", system-ui, -apple-system, sans-serif';
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";

  if (isDraft) {
    ctx.fillStyle = "#4c6ef5";
  }

  const lines = text.split("\n");
  const lineHeight = fontSize * 1.35;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + i * lineHeight);
  }
  ctx.restore();
}

export function boundsOfShape(shape: CanvasShape): BoundingBox {
  const pad = shape.strokeWidth / 2;
  return {
    minX: shape.x - pad,
    minY: shape.y - pad,
    maxX: shape.x + shape.width + pad,
    maxY: shape.y + shape.height + pad,
  };
}

export function boundsOfConnector(
  connector: CanvasConnector,
  shapesMap?: Map<string, CanvasShape>
): BoundingBox {
  let start = { x: connector.startX, y: connector.startY };
  let end = { x: connector.endX, y: connector.endY };
  if (shapesMap) {
    const endpoints = resolveConnectorEndpoints(connector, shapesMap);
    start = endpoints.start;
    end = endpoints.end;
  }
  const pad = Math.max(10, connector.strokeWidth * 2);
  return {
    minX: Math.min(start.x, end.x) - pad,
    minY: Math.min(start.y, end.y) - pad,
    maxX: Math.max(start.x, end.x) + pad,
    maxY: Math.max(start.y, end.y) + pad,
  };
}

export function boundsOfText(textObj: CanvasText): BoundingBox {
  const lines = (textObj.text || "").split("\n");
  const maxLineLen = Math.max(...lines.map((l) => l.length), 1);
  const fontSize = textObj.fontSize || 16;
  const width = Math.max(textObj.width || 0, maxLineLen * fontSize * 0.65 + 16);
  const height = Math.max(textObj.height || 0, lines.length * fontSize * 1.35 + 8);
  return {
    minX: textObj.x,
    minY: textObj.y,
    maxX: textObj.x + width,
    maxY: textObj.y + height,
  };
}
