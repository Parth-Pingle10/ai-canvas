import type { BoundingBox } from "./document";

/**
 * AI-generated canvas objects are deliberately NOT part of the `SceneObject`
 * (Stroke) union or the canvas-rasterized rendering path. They're rendered
 * as a DOM overlay (see components/AiLayer/AiObjectLayer.tsx) positioned
 * with the same world<->screen camera transform everything else uses, which
 * is what makes Markdown/LaTeX rendering, text selection, and Accept/
 * Discard buttons straightforward instead of requiring a rich-text canvas
 * renderer. Spatially they behave exactly like any other object — they
 * live in world coordinates, pan/zoom with the camera, can be moved and
 * resized, and participate in the same undo history as strokes.
 */

export type ObjectStatus = "confirmed" | "draft";
export type DraftContentType = "markdown" | "latex";
export type AiTrigger = "idle_pause" | "manual";

/** World-space position + size, independent of BoundingBox (which is always
 * min/max) because AI cards are authored as x/y/width/height, matching what
 * the backend's WorldBounds schema also uses. */
export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AiObject {
  id: string;
  kind: "ai-object";
  status: ObjectStatus;
  contentType: DraftContentType;
  title: string;
  content: string;
  confidence: number;
  bounds: WorldRect;
  /** The region-of-interest that produced this object, kept for reference /
   * a future connecting-line visual between source and draft. */
  sourceBounds: BoundingBox;
  requestId: string;
  createdAt: number;
  version: number;
}

export interface PendingAiRequest {
  id: string; // equal to the request_id sent to the backend
  sourceBounds: BoundingBox;
  anchorBounds: WorldRect;
  trigger: AiTrigger;
  startedAt: number;
  controller: AbortController;
}

export type RoiStrategySource = "recent-strokes" | "selection" | "viewport";

export interface RoiResult {
  bounds: BoundingBox;
  source: RoiStrategySource;
  strokeIds: string[];
}
