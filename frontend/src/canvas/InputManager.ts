import type { Camera, Point } from "../types/document";
import { screenToWorld } from "./CoordinateSystem";

/**
 * Pointer-event helpers shared by CanvasView. Kept separate from the React
 * component so the input-processing logic (coalesced events, world-space
 * conversion, gesture classification) can be unit tested and reused
 * independently of rendering.
 */

/** Returns the fine-grained coalesced events for a pointer move when the
 *  browser supports it, falling back to the event itself otherwise. This
 *  captures fast strokes without dropping points between animation frames. */
export function getCoalescedEvents(e: React.PointerEvent<Element>): PointerEvent[] {
  const native = e.nativeEvent as PointerEvent & {
    getCoalescedEvents?: () => PointerEvent[];
  };
  if (typeof native.getCoalescedEvents === "function") {
    const events = native.getCoalescedEvents();
    if (events.length > 0) return events;
  }
  return [native];
}

/** Convert a (native or React) pointer event into a world-space stroke point,
 *  carrying through pressure/tilt when the device reports them. */
export function pointerEventToWorldPoint(
  e: { clientX: number; clientY: number; pressure?: number; tiltX?: number; tiltY?: number },
  canvasRect: DOMRect,
  camera: Camera,
  viewportWidth: number,
  viewportHeight: number
): Point {
  const screen = { x: e.clientX - canvasRect.left, y: e.clientY - canvasRect.top };
  const world = screenToWorld(screen, camera, viewportWidth, viewportHeight);
  return {
    x: world.x,
    y: world.y,
    // Many mice/trackpads report pressure 0 or 0.5 rather than 1 — treat
    // anything at/near 0 with a non-pen pointer type as "no pressure data".
    pressure: typeof e.pressure === "number" && e.pressure > 0 ? e.pressure : 1,
    tiltX: e.tiltX ?? 0,
    tiltY: e.tiltY ?? 0,
    timestamp: Date.now(),
  };
}

export type PanTrigger = "middle-mouse" | "space-drag" | "hand-tool" | null;

/** Decide whether a given pointerdown should start a pan gesture. */
export function detectPanTrigger(
  e: React.PointerEvent,
  spaceHeld: boolean,
  activeTool: string
): PanTrigger {
  if (e.button === 1) return "middle-mouse";
  if (e.button === 0 && spaceHeld) return "space-drag";
  if (e.button === 0 && activeTool === "hand") return "hand-tool";
  return null;
}

/** Simple RAF-batched scheduler so pointermove-driven redraws never queue up
 *  more than one pending frame, keeping drawing responsive under load. */
export class FrameScheduler {
  private scheduled = false;
  private callback: () => void;

  constructor(callback: () => void) {
    this.callback = callback;
  }

  request(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.callback();
    });
  }
}
