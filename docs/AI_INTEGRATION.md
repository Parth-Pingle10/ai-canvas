# AI Integration Architecture

This document covers the pipeline added on top of the canvas foundation described in
[`CANVAS_ARCHITECTURE.md`](CANVAS_ARCHITECTURE.md): idle detection → region-of-interest → local
multimodal model → structured draft → canvas object. It assumes familiarity with that document,
especially the stroke data model (§1) and undo architecture (§4), both of which this integration
extends rather than replaces.

## 1. Why AI objects are a DOM overlay, not canvas-rasterized

The single biggest design decision in this integration: **AI draft/confirmed objects are rendered
as absolutely-positioned DOM elements, not drawn into the `<canvas>` bitmap.**

`types/ai.ts`'s `AiObject` is deliberately **not** added to the `SceneObject` union
(`types/document.ts`) that the canvas rasterizer understands. Instead, `components/AiLayer/AiObjectLayer.tsx`
renders one absolutely-positioned `<div>` per AI object, transformed with the same
world→screen camera math (`worldToScreen`) that the canvas renderer uses, so the cards pan and
zoom in perfect lockstep with the ink underneath them without being canvas pixels themselves.

This tradeoff was chosen deliberately:

- **Markdown/LaTeX rendering** (`ai/renderContent.ts`, using `marked` + KaTeX) produces real HTML —
  trying to rasterize rich text with proper line-wrapping, tables, and math typesetting directly
  into a `<canvas>` context would mean either hand-rolling a text layout engine or rendering HTML
  to an image first (expensive, blurry at high zoom, not selectable).
- **Interactive elements** (Accept/Discard buttons, a draggable header, a resize handle) are just
  ordinary DOM event handlers this way, not custom canvas hit-testing.
- **Text selection** for copying a solved equation or explanation out of a draft card comes for
  free.

The cost of this choice: AI objects don't participate in the canvas's viewport-culling or
stroke-based hit-testing (`utils/geometry.ts`), and they aren't included in PNG export
(`utils/exportPng.ts` only ever drew `Stroke[]`, and that hasn't changed — exporting AI cards as
part of the flattened PNG is a reasonable next step, deliberately not built now to keep this
integration's diff to the existing export path at zero). At the object counts this assignment
targets (a handful of draft/confirmed cards, not thousands), an unculled DOM overlay is not a
performance concern — the concern would resurface if a canvas ever accumulated hundreds of
AI objects, at which point the overlay would want the same viewport-culling treatment the strokes
already get.

## 2. Data model

```ts
interface AiObject {
  id: string;
  kind: "ai-object";
  status: "draft" | "confirmed";
  contentType: "markdown" | "latex";
  title: string;
  content: string;
  confidence: number;
  bounds: WorldRect;        // world-space x/y/width/height — movable, resizable
  sourceBounds: BoundingBox; // the ROI that produced this object
  requestId: string;
  createdAt: number;
  version: number;
}
```

`CanvasDocument.aiObjects` (optional, defaults to `[]`) persists both draft and confirmed objects
in save/load — see `utils/persistence.ts`'s `normalizeAiObject`, which validates the minimal shape
of a loaded AI object defensively, the same way `normalizeStroke` already did for strokes. A
document saved before this integration existed loads fine; the field is simply absent and
defaulted.

## 3. Undo history: unified, not parallel

`state/canvasStore.ts`'s history stack was extended from snapshotting `Stroke[]` to snapshotting
`{ strokes: Stroke[]; aiObjects: AiObject[] }` — **one history, not two independent ones.**
`commitStrokes()` and the new `commitAiObjects()` both push the *same* kind of snapshot (capturing
both fields, changing only the one being mutated), so `undo()`/`redo()` restore both fields
together. This is what makes "accepting a draft must be undoable" (per the assignment) fall out
for free: `acceptDraft()` calls `commitAiObjects()` exactly like `addStroke()` calls
`commitStrokes()`, and both live on the same `past`/`future` stacks.

Pending in-flight requests (`pendingRequests` — the "Analyzing..." placeholders) are explicitly
**not** part of this history. They're ephemeral network/UI state, not document content; undoing
past a pending request wouldn't mean anything coherent (there's no prior "version" of an in-flight
network call to restore).

## 4. Idle detection and manual trigger

`ai/useAiTrigger.ts` is mounted once near the top of the component tree (`App.tsx`), not inside
`CanvasView`, since it only needs store access — it has no direct involvement with pointer events
or rendering.

```
strokes array changes (any commit)
        v
diff old vs new by (id, version) -> accumulate touched ids into a "dirty" set
        v
reset a 700ms timer (VITE_AI_IDLE_DELAY_MS)
        v
timer fires with no further stroke changes -> dispatch("idle_pause")
```

Ctrl+Enter calls `triggerManualAnalysis()` -> `dispatch("manual")` directly, bypassing the idle
wait (but not the region-computation or cancellation logic below — a manual trigger still
supersedes an in-flight automatic one, and vice versa).

**Dirty-stroke tracking** diffs the `strokes` array by comparing `(id, version)` pairs between the
previous and current array on every store change — cheap (one pass, one Map) and correct because
strokes are never mutated in place (every edit produces a new stroke object with a bumped
`version`, per `CANVAS_ARCHITECTURE.md` §4). The dirty set accumulates across multiple quick edits
and is only cleared once it's actually used as the basis for a dispatched request — not on every
timer reset — so a request that gets deduped away doesn't lose track of what changed.

## 5. Region-of-interest strategy

Implemented as a pure function, `canvas/RegionExtractor.ts`'s `computeRoi()`, independent of
timers/network/React so it's directly unit-testable (`src/__tests__/roiCalculation.test.ts`):

```
1. recent-strokes  - bounding box of strokes in the "dirty" set (see §4)
2. selection       - if nothing recently changed, use the current stroke selection
3. viewport        - fallback: whatever's currently visible on screen
```

Tried in that order, first non-empty match wins. This mirrors the assignment's specified strategy
exactly. `computeRoi()` takes the viewport's world-space bounds via `viewportWorldBounds()`
(`canvas/CoordinateSystem.ts`) — the same helper `CanvasRenderer`'s culling logic could use,
avoiding a second implementation of "what's currently visible" math.

**Experimenting with this strategy** later just means editing `computeRoi()` — it has no
dependency on the trigger hook, the API client, or the store beyond the plain data it's handed as
arguments.

## 6. Request de-duplication

`canvas/RegionExtractor.ts`'s `roiSignature(roi, strokes)` produces a deterministic string from the
ROI's source and its member strokes' `(id, version)` pairs (sorted, so ordering doesn't matter).
Before dispatching an **idle-triggered** request, `useAiTrigger` compares the new signature against
the last-dispatched one; an identical signature means nothing meaningful changed since the last
request, and the dispatch is skipped silently. A **manual** trigger (explicit user intent) always
goes through regardless of signature — deduping an explicit "analyze this now" click would be
surprising, not helpful.

## 7. Rasterization and transport

`RegionExtractor.extractRegion()` was extended with a `format` option (`"webp" | "png"`,
default controlled by `VITE_AI_ROI_FORMAT`) and now returns `mimeType` alongside the blob. WebP is
the default for AI requests specifically because the assignment measures image size against
latency/cost — a smaller payload at comparable visual quality directly improves the numbers being
instrumented. The blob is converted to a raw base64 string (`useAiTrigger`'s `blobToBase64`,
stripping the `data:...;base64,` prefix) before being sent as JSON, matching the backend's
`AnalyzeRequest.image` field.

## 8. Cancellation and supersession

Each dispatched request gets its own `AbortController`, tracked in `useAiTrigger`'s `inFlightRef`.

- **A new dispatch supersedes an old one:** before starting, `dispatch()` aborts any existing
  `inFlightRef` controller, removes its pending placeholder, and reports its outcome as
  `"superseded"` to the backend (`POST /api/metrics/outcome`) — the backend's trace already has a
  `"pending"` line for that request from when `/api/analyze` first returned (or the request may
  still be in flight, in which case the abort prevents the response from ever being used — see the
  `inFlightRef.current?.requestId !== requestId` check right after `await analyzeRegion(...)`,
  which guards against a slow superseded response landing after a newer one already resolved).
- **Explicit user cancellation** (the "Cancel" button on a pending placeholder card) calls the
  store's `cancelPendingRequest(id)`, which aborts that request's controller directly; the UI layer
  reports the outcome as `"cancelled"`.
- Both cases raise a `DOMException` named `AbortError` from `fetch`; `apiClient.ts`'s
  `analyzeRegion()` re-throws it as-is (not wrapped in `AnalyzeApiError`) specifically so
  `useAiTrigger`'s catch block can distinguish "this was intentionally aborted, say nothing" from
  "this genuinely failed, show a notice."

## 9. Draft placement

On a successful response, the draft card is placed at `anchorBounds` — computed once, at dispatch
time, as a fixed offset to the right of the ROI (`roi.bounds.maxX + 40` world units) — not
recomputed after the response arrives, so the card's position is stable and predictable regardless
of how long the request took. The user can drag it anywhere afterward (`AiObjectLayer`'s header
drag handler, committing via `moveAiObject` on pointer-up) or resize it (the corner handle,
committing via `resizeAiObject`), both going through the same undoable `commitAiObjects` path as
everything else in §3.

## 10. What's next (deliberately not built)

- **PNG export doesn't include AI objects.** `utils/exportPng.ts` still only rasterizes
  `Stroke[]`. Extending it to also draw AI cards (as HTML-to-canvas, or a simplified text
  rendering) is a natural follow-up once the DOM-overlay approach in §1 is validated against real
  usage.
- **No spatial culling for AI objects.** Fine at the object counts this assignment targets; see §1.
- **No connecting line between a draft and its source ROI.** `sourceBounds` is already stored on
  every `AiObject` specifically so this is a small addition later (draw a line/arrow in the
  `AiObjectLayer` overlay) rather than a data-model change.
- **Streaming responses.** See `docs/METRICS.md` for why `ttft`/`t_stream` are currently
  approximated rather than truly measured, and what switching to Ollama's streaming API would
  involve on both ends.
