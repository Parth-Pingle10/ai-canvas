# Canvas Architecture

This document goes deeper than the top-level README on the specific design decisions in
`frontend/src/canvas/` and `frontend/src/state/`. It's aimed at someone extending this codebase,
not at a first-time reader. All bare paths below (e.g. `src/types/document.ts`) are relative to
`frontend/`. For the AI integration built on top of this foundation, see
[`AI_INTEGRATION.md`](AI_INTEGRATION.md).

## 1. Why a structured scene, not a bitmap

The single most important constraint in the brief: **the canvas must not be one giant bitmap.**
Every mark is a `Stroke` object (`src/types/document.ts`):

```ts
interface Stroke {
  id: string;
  points: Point[];       // world-space, with pressure/tilt/timestamp
  color: string;
  width: number;
  tool: "pen" | "pencil" | "highlighter" | "eraser";
  opacity: number;
  bounds: BoundingBox;   // cached, recomputed whenever points change
  createdAt: number;
  version: number;
}
```

This is what makes the following all possible later without re-architecting anything:

- **Region extraction** (`RegionExtractor.ts`) — query which strokes fall in a world-space
  rectangle, then rasterize *only that rectangle* to a small PNG. A bitmap-backed canvas would
  require either re-rendering everything into an off-screen buffer at the right resolution (slow,
  and loses per-stroke metadata) or storing coordinates alongside pixels (fighting the format).
- **Selection / move / resize** — a selected object is a set of stroke ids; moving it is
  translating each stroke's `points`, not manipulating pixels.
- **Undo/redo** — see §4.
- **Future draft objects** — a model's response becomes a new kind of `SceneObject` (currently
  only `Stroke` exists, but the union type is deliberately named `SceneObject` in
  `types/document.ts` to make this obvious) without touching the renderer's culling or hit-testing
  logic, which both operate on `bounds`.

## 2. Coordinate system

```
Screen space  →  Camera transform  →  World space
```

`camera = { x, y, zoom }` describes the world-space point currently centered in the viewport.
All conversions go through `CoordinateSystem.ts`'s `screenToWorld` / `worldToScreen` — nothing
else is allowed to hand-roll this math, so there is exactly one place that could get the sign or
order of operations wrong.

Cursor-anchored zoom (`zoomCameraAtPoint`) works by:
1. Computing the world point currently under the cursor, at the old zoom.
2. Applying the new zoom.
3. Computing where that same screen position now maps to in world space.
4. Shifting the camera by the difference, so the world point the user was looking at stays under
   their cursor.

This is covered by `src/__tests__/coordinateSystem.test.ts`, including a test that a zoom-and-back
round-trip returns the camera to (approximately) its original state.

## 3. Rendering: decoupled from React

`CanvasRenderer.ts` owns the actual `<canvas>` element and draws one frame at a time via a plain
`render(input)` method. `CanvasView.tsx` calls this imperatively through a `requestAnimationFrame`-batched
`FrameScheduler`, **not** by re-rendering a React tree on every pointer event.

Concretely: while the user is drawing, the in-progress stroke lives in a `useRef` (`gestureRef`),
not in React state. Only on pointer-up does the finished stroke get pushed into the Zustand store
via `addStroke`, which is the one point where a "real" state update (and a single React
re-render) happens for that stroke. Move/resize/erase drags work the same way — a `live` overlay
map lives in the ref during the drag, and only the final result is committed to the store.

This is why drawing stays smooth even with thousands of existing strokes on the canvas: pointer
events during an active gesture touch refs and the canvas context directly, never the React
component tree.

### Viewport culling

`CanvasRenderer.render()` computes the world-space rectangle currently visible (from `camera` and
viewport size, with a small padding factor) and skips `drawStroke` for anything outside it. This
is a simple `O(n)` bounds-intersection scan per frame — deliberately not a spatial index (quadtree
/ grid), because at the assignment's target scale (5,000+ strokes) an array scan of axis-aligned
bounding-box checks costs a fraction of a millisecond, well under the frame budget. See §7 for the
actual numbers and where this would need to change.

### World-space stroke width

Strokes are drawn in world-space coordinates with a single `ctx.setTransform(...)` call combining
camera pan/zoom and device-pixel-ratio scaling, so stroke width scales naturally with zoom (a 4px
pen stroke looks the same relative size at any zoom level) instead of being redrawn per zoom
level.

## 4. Undo/redo: structured snapshots, not screenshots

The brief explicitly rules out "canvas screenshot #1, #2, #3" as an undo strategy. The
implementation here (`state/canvasStore.ts`) snapshots the **structured `strokes` array**, not
pixels:

```ts
history: { past: Stroke[][]; future: Stroke[][] }
```

Every atomic document mutation goes through `commitStrokes(next)`, which pushes the *previous*
`strokes` array onto `history.past` and clears `history.future`. Because strokes are never mutated
in place — every edit produces new stroke objects — pushing the old array reference onto the
history stack is a cheap `O(1)` operation, not a deep clone. `undo()`/`redo()` just move the
current array pointer between `past`/`future`/`strokes`.

This covers every mutating action in the app: drawing, erasing, moving, resizing, deleting,
clearing. It's covered by `src/__tests__/undoRedo.test.ts`, including multi-step undo/redo and
"redo stack clears after a new action" semantics.

Camera position/zoom and tool selection are **not** part of undo history — panning around to look
at your undo history would be a strange UX, so only document content is undoable. This mirrors
how tldraw/Excalidraw scope their history.

**Forward compatibility note:** when draft acceptance/discard is added later, it should go through
the same `commitStrokes` path (accepting a draft = adding it to `strokes` as a confirmed object),
so it becomes undoable for free without new history machinery.

## 5. Selection, move, and resize

Selection state is just `selectedIds: string[]` in the store. Hit-testing
(`utils/geometry.ts::distanceToStroke`) computes the minimum distance from a world-space point to
a stroke's polyline (segment-by-segment), so clicking near — not just exactly on — a thin stroke
still selects it. The pick radius is defined in *screen* pixels and converted to world units by
dividing by `camera.zoom`, so the "click precision" feels consistent at any zoom level.

Marquee selection (`strokeIntersectsBox`) tests each stroke segment against the marquee rectangle
using a parametric slab-clipping test — not just "is a sampled point inside" — so a stroke that
only clips through the marquee's edge (or a stroke that fully encloses the marquee) is still
selected correctly. See `src/__tests__/regionExtraction.test.ts` for cases covering both.

Move and resize both work by replaying the transform from a **pristine snapshot** taken at
gesture-start (`originals`) plus the total delta/scale from the current pointer position — not by
incrementally accumulating per-frame deltas. This avoids floating-point drift over a long drag and
means the live preview always matches exactly what will be committed on pointer-up.

## 6. Input handling

`canvas/InputManager.ts` holds the pointer-event utilities used by `CanvasView.tsx`:

- `getCoalescedEvents` — reads `PointerEvent.getCoalescedEvents()` when available, so fast strokes
  don't lose points between animation frames (a single `pointermove` can represent several actual
  hardware samples; without this, fast diagonal strokes look faceted instead of smooth).
- `pointerEventToWorldPoint` — converts a native pointer event straight to a world-space `Point`,
  carrying through `pressure`/`tiltX`/`tiltY` when the device reports them. Devices that don't
  report pressure send `0`, which is treated as "no data" and normalized to `1` so lines don't
  vanish on a plain mouse.
- `detectPanTrigger` — classifies a `pointerdown` into a pan gesture (middle-mouse, space+drag, or
  the explicit Hand tool) versus a drawing/selecting gesture.
- `FrameScheduler` — a minimal RAF batcher: multiple `request()` calls before the next frame
  collapse into a single render, so a burst of `pointermove` events never queues up redundant work.

`setPointerCapture`/`releasePointerCapture` are used on every gesture so a drag that leaves the
canvas bounds (common with fast mouse movement) still delivers `pointermove`/`pointerup` events
correctly.

## 7. Performance notes

Measured in Chrome, dev build, on a mid-range laptop (numbers are indicative, not lab-grade):

| Stroke count | Pan/zoom frame time | Notes |
|---|---|---|
| 100 | consistently 16ms (60fps) | no visible cost from stroke count |
| 1,000 | consistently 16ms (60fps) | culling keeps the drawn set small unless fully zoomed out |
| 5,000 | 16–20ms typical | occasional frame drop only when the *entire* document is visible at once (i.e. culling isn't helping) at low zoom |

The `100 strokes visible / N total` counter in the bottom-right corner of the canvas (see
`canvas-stats` in `CanvasView.tsx`) makes this directly observable: zoom out until the whole
document is on-screen and watch the visible count converge to the total.

**Where this would break down, and what to do about it:** the current approach is an `O(n)` scan
per frame for culling and an `O(n)` scan per pointer-move for hit-testing/erasing. At 5,000–10,000
strokes this is comfortably fast because each check is a handful of comparisons. Past roughly
50,000–100,000 strokes, or on low-end hardware, a spatial index (a uniform grid keyed by world-space
tile, or a quadtree) would turn both scans into a small set of tile lookups instead of a full
sweep. This is a straightforward, isolated change — `CanvasRenderer.render()`'s culling loop and
`geometry.ts`'s hit-testing are the only two call sites — deliberately not built now because it adds
real complexity (grid rebalancing, tile-size tuning) for a scale well past what this assignment
asks for. Documenting the seam here so it's an easy follow-up rather than something that needs
rediscovering.

Other performance decisions:

- **React re-renders are decoupled from drawing** (§3) — the biggest single win, since it means
  stroke count doesn't affect React's reconciliation cost at all during an active gesture.
- **Device pixel ratio is capped at 2×** (`Math.min(window.devicePixelRatio || 1, 2)`) — a 3× or 4×
  display would otherwise allocate a canvas backing store 2–4× larger than necessary for no
  perceptible sharpness gain.
- **`ctx.setTransform` once per frame**, not per stroke — avoids redundant matrix math.

## 8. Persistence format

```jsonc
{
  "version": 1,
  "canvas": { "name": "Untitled" },
  "camera": { "x": 0, "y": 0, "zoom": 1 },
  "strokes": [ /* Stroke[] */ ],
  "createdAt": 0,
  "updatedAt": 0
}
```

`utils/persistence.ts` validates on load and throws one of three specific error types
(`DocumentParseError`, `UnsupportedVersionError`) rather than crashing or silently producing a
half-loaded document — see the "Error handling" section of the top-level README for how these
surface in the UI. Stroke `bounds` are **recomputed from `points` on load**, never trusted from
the file, so a hand-edited or corrupted `bounds` field can't desync the hit-testing/culling logic
from reality.

## 9. Region extraction (now used by the AI integration)

`RegionExtractor.ts` is the seam the AI integration calls into (see
[`AI_INTEGRATION.md`](AI_INTEGRATION.md) for the full pipeline built on top of it). It does two
core things:

1. Given a world-space bounding box + margin, query which strokes intersect the expanded region.
2. Rasterize those strokes to a small standalone `<canvas>` at a target resolution and format
   (PNG or WebP), returning the blob alongside the geometry (`bounds`, `zoom`, `strokeCount`,
   `objectTypes`).

It does not call a model, construct a prompt, or know anything about HTTP -- `ai/useAiTrigger.ts`
and `ai/apiClient.ts` own that. `RegionExtractor.ts` also now exports the region-of-interest
strategy itself (`computeRoi()`: recent strokes -> selection -> viewport) and a deterministic
`roiSignature()` used for request de-duplication -- both kept here, alongside the extraction logic
they feed, and both plain functions with no React/network dependency, which is what makes them
directly unit-testable (`src/__tests__/roiCalculation.test.ts`).
