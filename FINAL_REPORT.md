# Final Report — AI Backend + Multimodal Canvas Integration

## 1. What was changed

Started from the completed canvas foundation (provided as a zip) and, without rewriting the
canvas itself:

- **Restructured** the project from a single root app into `frontend/` + `backend/`, per the
  assignment's required layout. The canvas app moved wholesale into `frontend/`; nothing inside it
  was rewritten. All 29 of its original tests pass unmodified in the new location.
- **Extended, not replaced**, three existing frontend modules:
  - `types/document.ts` — added an optional `aiObjects` field to `CanvasDocument` (backward
    compatible; absent in old files defaults to `[]`).
  - `state/canvasStore.ts` — the undo history was widened from snapshotting `Stroke[]` to
    snapshotting `{ strokes, aiObjects }` together, so accepting/discarding a draft is undoable
    through the exact same mechanism drawing a stroke already was.
  - `canvas/RegionExtractor.ts` — added a `format` option (webp/png), a `computeRoi()` strategy
    function, and a `roiSignature()` dedup helper. The original `extractRegion()` rasterization
    logic is unchanged.
- **Added, as new files**, everything the AI loop needed: types (`types/ai.ts`), the trigger hook
  (`ai/useAiTrigger.ts`), the API client (`ai/apiClient.ts`), safe content rendering
  (`ai/renderContent.ts`), the DOM-overlay draft/pending-card layer
  (`components/AiLayer/AiObjectLayer.tsx`), the metrics panel and store, and keyboard/toolbar
  wiring in `App.tsx`.
- **Built the entire backend from scratch**: FastAPI app, Ollama provider abstraction, prompt
  module, request/response schemas, image validation, metrics/cost/KPI/trace infrastructure, and
  40 tests.

Nothing in drawing, erasing, selection, pan/zoom, undo/redo of ink, save/load, or PNG export was
touched beyond the additive `aiObjects` field threaded through persistence.

## 2. Backend architecture

```
frontend  ->  POST /api/analyze  ->  FastAPI route (api/analyze.py)
                                        |
                                        v
                              image validation (images.py)
                                        |
                                        v
                              prompt construction (ai/prompts.py)
                                        |
                                        v
                          MultimodalModel.analyze()  (ai/base.py — the abstraction)
                                        |
                                        v
                              OllamaProvider  (ai/ollama.py — the only Ollama-aware file)
                                        |
                                        v
                                 Ollama HTTP API
                                        |
                                        v
                       JSON parsing + recovery (ai/parsing.py)
                                        |
                                        v
                    metrics: tokens/cost/trace (metrics/*.py) — written regardless of outcome
                                        |
                                        v
                              structured AnalyzeResponse  ->  frontend
```

Every provider failure (`ProviderUnavailableError`, `ModelUnavailableError`, `ModelTimeoutError`,
or a genuinely unexpected exception) is caught in the route and mapped to a specific error code
and HTTP status — the server never crashes and never returns a bare 500 with no context.

Swapping Ollama for Gemini/Claude/OpenAI later means writing one new class implementing
`MultimodalModel` and pointing `dependencies.py::get_model_provider()` at it. No route, schema, or
metrics code needs to change.

## 3. Ollama model used

`qwen3-vl:8b` (configurable via `OLLAMA_MODEL`), with `qwen3-vl:4b` documented as the fallback for
lighter hardware. **Important caveat**: this sandbox has no Ollama installed and no network path to
a local daemon, so the model has not actually been exercised — see §9.

## 4. How the AI workflow works

```
draw  ->  idle 700ms (or Ctrl+Enter)  ->  computeRoi()  ->  extractRegion()  ->  base64
      ->  POST /api/analyze  ->  Ollama  ->  structured JSON  ->  draft AiObject on canvas
      ->  user Accepts (-> confirmed, undoable) or Discards (-> removed, undoable)
```

A new request always supersedes an in-flight older one (aborts it, marks it `superseded`). Idle
requests are deduplicated against a signature of the ROI's stroke ids+versions so unchanged
content never re-fires; a manual (Ctrl+Enter) trigger always goes through. Full detail:
`docs/AI_INTEGRATION.md`.

## 5. How ROI extraction works

Three-tier fallback, tried in order: **recent strokes** (touched since the last dispatch) →
**current selection** → **viewport**. Implemented as the pure function `computeRoi()` in
`RegionExtractor.ts`, independent of timers/network/React, and directly unit-tested
(`roiCalculation.test.ts`). Detail + rationale: `docs/AI_INTEGRATION.md` §5–6.

## 6. How draft objects work

`AiObject`s are **not** part of the canvas's `Stroke`-based rendering — they're a DOM overlay
(`AiObjectLayer.tsx`) positioned with the same world→screen camera transform the canvas uses, so
they pan/zoom in lockstep with the ink without being canvas pixels. This is what makes real
Markdown/LaTeX rendering (via `marked`+DOMPurify and KaTeX, both sanitized), draggable headers,
resize handles, and Accept/Discard buttons straightforward DOM concerns instead of custom canvas
hit-testing. Rationale and the tradeoffs this implies: `docs/AI_INTEGRATION.md` §1.

## 7. How metrics work

Every request gets a `request_id`/`session_id`. `t_capture`/`t_dispatch` are measured client-side;
`ttfb`/`ttft`/`t_stream`/`e2e` server-side. **Important honesty note**: because the Ollama call is
non-streaming, `ttfb` and `ttft` are reported as identical and `t_stream` is always `0` — this is
disclosed, not hidden, in `docs/METRICS.md` §2, along with exactly what switching to streaming
would require. Token counts use exactly what Ollama's `/api/generate` reports
(`prompt_eval_count`/`eval_count`), explicitly marked `not_reported` rather than fabricating an
image/text split Ollama doesn't provide. Cost is reported as two numbers: `actual_local_cost_usd`
(always `$0`, literally true) and `notional_hosted_cost_usd` (from a configurable rate table,
defaulting to `$0` until someone fills in a real, dated hosted price). Every request appends a
JSONL trace line; a second line is appended when its outcome (accepted/discarded/cancelled/
superseded) is later known. KPIs (DAR/WTR/BC/CPAD) are computed on demand from an in-memory session
store. Full accounting: `docs/METRICS.md`.

## 8. Exact commands to run

```bash
# Ollama (separate install)
ollama pull qwen3-vl:8b        # or qwen3-vl:4b
ollama serve

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
cp .env.example .env
npm run dev
```

Tests:
```bash
cd frontend && npm test        # 54 tests
cd backend && python -m pytest tests/ -v   # 40 tests
```

## 9. Known limitations

- **Not verified against a real Ollama instance.** This sandbox has neither Ollama installed nor
  network access to a local daemon. The full pipeline (routing, validation, error handling,
  metrics, JSONL tracing) is exercised end-to-end against a `FakeProvider` test double that
  implements the identical `MultimodalModel` interface `OllamaProvider` does — so the *plumbing*
  is verified, but a real call to `qwen3-vl:8b`/`4b`, and the actual quality of its JSON-following
  behavior against the prompt in `ai/prompts.py`, has not been. Run `GET /health` after setup to
  confirm before relying on it.
- **Non-streaming Ollama calls** mean `ttft`/`t_stream` are approximations, not true measurements
  (see §7, `docs/METRICS.md` §2).
- **AI objects aren't in PNG export** or canvas viewport culling — they're a DOM overlay, not
  canvas-rasterized (`docs/AI_INTEGRATION.md` §1).
- **`t_render` is never populated** — no backend visibility into frontend paint timing
  (`docs/METRICS.md` §3).
- **`SessionStore` is in-memory and resets on backend restart**; the JSONL trace file is the
  durable record (`docs/METRICS.md` §6).
- Pre-existing canvas limitations (documented in `docs/CANVAS_ARCHITECTURE.md` §15 — no spatial
  index past ~5–10k strokes, no lasso selection, etc.) are unchanged.

## 10. What should be implemented next

1. **Verify against a real Ollama + `qwen3-vl` instance** and tune `ai/prompts.py` based on actual
   model output — this is the single highest-priority follow-up, since nothing downstream of it
   has been validated against real model behavior.
2. **Streaming Ollama responses** for genuine `ttft`/`t_stream` measurement.
3. **PNG export including AI objects**, so an exported canvas matches what's on screen.
4. **A visual connecting line** between a draft card and its source ROI (`sourceBounds` is already
   stored on every `AiObject`, ready for this).
5. **Viewport culling for AI objects** if usage ever produces large numbers of them on one canvas.
