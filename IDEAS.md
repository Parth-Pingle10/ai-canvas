# IDEAS — Original Feature & Future Work

## Shipped original feature: **ROI signature deduplication**

**Problem:** On an infinite canvas, idle-pause detection fires after every editing burst. Without guardrails, unchanged content triggers duplicate multimodal calls — wasting tokens, latency, and user attention.

**Solution:** Before dispatching an idle-triggered request, compute a deterministic `roiSignature()` from the ROI source plus each member stroke's `(id, version)` pair (`frontend/src/canvas/RegionExtractor.ts`). If the signature matches the last successful dispatch, skip the request. Manual triggers (`Ctrl+Enter`) always proceed — explicit user intent should never be deduped away.

**Why it's canvas-native:** Unlike chat deduplication, this keys off *spatial editing state* (which strokes changed in the region), not message text. It respects undo/version bumps and integrates with the same instrumentation layer (skipped requests never hit the network; superseded/cancelled ones still record outcomes).

**Undo:** N/A (no document mutation).

**Keyboard:** Manual analyze remains `Ctrl+Enter`.

**Instrumentation:** Only dispatched requests appear in traces; deduped idle attempts are silent by design (zero cost).

---

## Other ideas considered (not shipped)

| Idea | Why not shipped |
|------|-----------------|
| Draft ↔ ROI connector line | `sourceBounds` already stored; deferred for scope |
| Streaming Ollama responses | Real `ttft`/`t_stream`; larger API surface |
| PNG export including AI cards | DOM overlay export is non-trivial |
| Spatial index for 50k+ strokes | Out of assignment scale |

---

## Experiment follow-ups

See `REPORT.md` for WebP/resolution arms and collection steps.
