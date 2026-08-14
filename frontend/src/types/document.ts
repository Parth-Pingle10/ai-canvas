/**
 * Core structured-document types for the canvas.
 *
 * IMPORTANT: The canvas is never stored as a single flattened bitmap.
 * Every mark on the canvas is a structured object (a Stroke) with world-space
 * coordinates, so that later a specific region can be queried, cropped and
 * rasterized independently (see canvas/RegionExtractor.ts).
 */

export type ToolId = "select" | "pen" | "pencil" | "highlighter" | "eraser" | "hand";

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

/** Every object that can live on the canvas render path. AI objects
 *  (draft/confirmed) are intentionally NOT part of this union — they render
 *  through a separate DOM overlay layer, not the canvas rasterizer, so this
 *  stays exactly what it was before the AI integration. See types/ai.ts for
 *  why AI objects are a parallel structure instead of a SceneObject variant. */
export type SceneObject = Stroke;

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
  /** AI-generated objects (draft + confirmed). Optional for backward
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
    createdAt: now,
    updatedAt: now,
  };
}
