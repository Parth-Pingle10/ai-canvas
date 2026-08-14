/**
 * Core structured-document types for the canvas.
 *
 * IMPORTANT: The canvas is never stored as a single flattened bitmap.
 * Every mark on the canvas is a structured object (a Stroke) with world-space
 * coordinates, so that later a specific region can be queried, cropped and
 * rasterized independently (see canvas/RegionExtractor.ts).
 */

export type ToolId =
  | "select"
  | "pen"
  | "pencil"
  | "highlighter"
  | "eraser"
  | "hand"
  | "rectangle"
  | "circle"
  | "triangle"
  | "diamond"
  | "arrow"
  | "line"
  | "text"
  | "connector";

export interface Point {
  x: number;
  y: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
  timestamp?: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type StrokeTool = "pen" | "pencil" | "highlighter" | "eraser";

export interface Stroke {
  id: string;
  type: "stroke";
  points: Point[];
  color: string;
  width: number;
  tool: StrokeTool;
  opacity: number;
  /** Cached world-space bounding box, kept up to date whenever points change. */
  bounds: BoundingBox;
  createdAt: number;
  /** Bumped whenever the stroke is edited (moved/resized) — used for cheap dirty checks. */
  version: number;
}

export type ShapeType =
  | "rectangle"
  | "rounded_rectangle"
  | "circle"
  | "ellipse"
  | "triangle"
  | "diamond";

export interface CanvasShape {
  id: string;
  type: "shape";
  shapeType: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  strokeColor: string;
  fillColor?: string;
  strokeWidth: number;
  strokeStyle?: "solid" | "dashed";
  opacity: number;
  text?: string;
  textColor?: string;
  fontSize?: number;
  bounds: BoundingBox;
  status?: "confirmed" | "draft";
  draftGroupId?: string;
  sourceStrokeIds?: string[];
  sourceBounds?: BoundingBox;
  createdAt: number;
  version: number;
}

export type ConnectorAnchor = "top" | "bottom" | "left" | "right" | "center" | "auto";

export interface CanvasConnector {
  id: string;
  type: "connector";
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  fromId?: string; // Connected to shape ID
  fromAnchor?: ConnectorAnchor;
  toId?: string; // Connected to shape ID
  toAnchor?: ConnectorAnchor;
  routing?: "straight" | "orthogonal";
  strokeColor: string;
  strokeWidth: number;
  strokeStyle?: "solid" | "dashed";
  opacity?: number;
  startArrow?: boolean;
  endArrow?: boolean;
  label?: string;
  labelColor?: string;
  bounds: BoundingBox;
  status?: "confirmed" | "draft";
  draftGroupId?: string;
  sourceStrokeIds?: string[];
  sourceBounds?: BoundingBox;
  createdAt: number;
  version: number;
}

export interface CanvasText {
  id: string;
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fontColor: string;
  fontFamily?: string;
  fontWeight?: string | number;
  align?: "left" | "center" | "right";
  bounds: BoundingBox;
  status?: "confirmed" | "draft";
  draftGroupId?: string;
  sourceStrokeIds?: string[];
  sourceBounds?: BoundingBox;
  createdAt: number;
  version: number;
}

export type CanvasElement = Stroke | CanvasShape | CanvasConnector | CanvasText;

export type SceneObject = CanvasElement;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const DOCUMENT_VERSION = 1;

export interface CanvasDocument {
  version: number;
  canvas: {
    name: string;
  };
  camera: Camera;
  strokes: Stroke[];
  shapes?: CanvasShape[];
  connectors?: CanvasConnector[];
  textObjects?: CanvasText[];
  /** AI-generated card objects (draft + confirmed). Optional for backward
   *  compatibility with documents saved before the AI integration existed —
   *  always defaulted to [] on load, never assumed present. */
  aiObjects?: import("./ai").AiObject[];
  createdAt: number;
  updatedAt: number;
}

export function createEmptyDocument(name = "Untitled"): CanvasDocument {
  const now = Date.now();
  return {
    version: DOCUMENT_VERSION,
    canvas: { name },
    camera: { x: 0, y: 0, zoom: 1 },
    strokes: [],
    shapes: [],
    connectors: [],
    textObjects: [],
    aiObjects: [],
    createdAt: now,
    updatedAt: now,
  };
}
