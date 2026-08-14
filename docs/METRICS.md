# Metrics & Instrumentation

Honest accounting of what's measured, what's estimated, and what's not currently measurable at
all -- instrumentation that overstates its own precision is worse than no instrumentation.

## 1. Where each number comes from

| Field | Measured where | Notes |
|---|---|---|
| `t_capture` | Frontend, `useAiTrigger.ts` | Wall time for `RegionExtractor.extractRegion()` (rasterizing the ROI to a blob). Sent to the backend, echoed back unchanged. |
| `t_dispatch` | Frontend, `useAiTrigger.ts` | Wall time to base64-encode the blob before the `fetch` call. Sent to the backend, echoed back unchanged. |
| `ttfb` / `ttft` | Backend, `ai/ollama.py` | **Identical value.** See section 2 -- Ollama's non-streaming API doesn't let these be distinguished. |
| `t_stream` | Backend, `ai/ollama.py` | Always `0`. See section 2. |
| `t_render` | Not currently populated | See section 3. |
| `e2e` | Backend, `api/analyze.py` | Wall time for the whole `/api/analyze` request handler, via `metrics/instrumentation.py`'s `measure_ms()`. |

## 2. Why ttfb equals ttft, and t_stream is zero

`ai/ollama.py` calls Ollama's `/api/generate` with `"stream": false` -- the whole response (full
generated text, plus token/timing stats) arrives as one JSON body once generation is complete.
From the backend's perspective, there is no way to observe "the first byte arrived" separately
from "generation finished," because those are the same moment in a non-streaming call. Rather than
inventing a fake distinction, both fields are set to the same measured value, and `t_stream` (time
spent receiving tokens after the first one) is honestly reported as `0`.

**The fix is switching to `"stream": true`** and reading Ollama's newline-delimited JSON chunks
incrementally: `ttft` would become the time to the first chunk, `t_stream` the time from there to
the final chunk. This is a real, scoped follow-up -- it touches `ai/ollama.py` (switch to a
streaming httpx call) and `api/analyze.py` (the route would need to become a streaming response
itself, or accumulate chunks server-side while timing them) but nothing else; the schema
(`LatencyBreakdown`) already has the right fields waiting to be filled in accurately. Not built now
because a streaming HTTP path adds real complexity (partial-JSON handling, a different FastAPI
response type, frontend changes to consume a stream) that this integration's scope didn't call for
beyond having the field ready.

## 3. t_render: not populated, and why

`t_render` (time to actually paint the draft on the canvas after the response arrives) is a
frontend-only measurement -- the backend has no visibility into when React actually commits the
DOM update for `AiObjectLayer`. The `AnalyzeResponse.latency_ms.t_render` field is always `null`
from the backend. Wiring this up means the frontend timing the gap between "response received" and
"draft card painted" (e.g. via `requestAnimationFrame` after `addDraft()`) and including it when it
calls `POST /api/metrics/outcome` -- that endpoint's schema would need a field for it. Deliberately
not built now: `t_render` is consistently sub-frame (well under 16ms for a single DOM node), so it
contributes negligibly to `e2e` and wasn't worth the additional endpoint surface for this pass.

## 4. Token accounting: what Ollama actually reports, and what that means

Ollama's non-streaming `/api/generate` response includes `prompt_eval_count` and `eval_count`.
**These are not split by modality** -- `prompt_eval_count` covers everything fed into the model
(the system prompt, the user prompt, and the image, all together as tokens the model's tokenizer
produced). `ai/ollama.py` surfaces this combined figure under `tokens.input_text`, and explicitly
marks `tokens.input_image_source = "not_reported"` rather than inventing a text/image split Ollama
doesn't provide. `tokens.output` maps directly to `eval_count`. `tokens.reasoning` and
`tokens.cache_read` are always `null` -- Ollama's `/api/generate` doesn't report either.

If a future provider (see `ai/base.py`'s `MultimodalModel` abstraction) reports image tokens
separately, or only reports text tokens and requires an estimate for images,
`metrics/tokens.py::estimate_image_tokens()` exists for that case -- but it is never used for
Ollama, and any caller using it must mark the result `"estimated"`, not `"provider_reported"`.
The distinction matters for reading the JSONL trace honestly later.

## 5. Cost accounting: real vs. notional

`metrics/cost.py` reports two numbers on every request:

- `actual_local_cost_usd` -- always `0.0`. A local Ollama call has no metering, no API key, no
  bill. This is not a placeholder; it is the literal true cost.
- `notional_hosted_cost_usd` -- `(input_tokens / 1e6) * COST_INPUT_PER_MILLION + (output_tokens /
  1e6) * COST_OUTPUT_PER_MILLION`, using the rate table in `.env` (`COST_INPUT_PER_MILLION`,
  `COST_OUTPUT_PER_MILLION`), both defaulting to `0`. This number is only meaningful once you fill
  in a real, dated price from an actual hosted provider's published pricing page -- the default is
  zero specifically so an unconfigured backend never silently reports a fabricated non-zero cost.
  Whoever fills in the rate table is responsible for documenting where the number came from
  (provider name, date, page) -- this codebase does not supply one.

The `AnalyzeResponse.cost_usd` field returned to the frontend is `notional_hosted_cost_usd`
(the more interesting number for the experiments the assignment asks for); the metrics panel's
"Cost (local)" row is hardcoded to `$0.00` for clarity rather than re-deriving it.

## 6. JSONL trace: two lines per request, and why

A request's full lifecycle spans two separate HTTP calls that can be arbitrarily far apart in
time: `POST /api/analyze` (produces the draft) and, much later, `POST /api/metrics/outcome` (the
user finally accepted/discarded/let it get superseded). `metrics/trace.py` appends one line at each
point:

1. On `/api/analyze` completing (success or failure): outcome is `"pending"` for a successful
   response, or a terminal failure outcome (`"error"` / `"timeout"`) if the request itself failed
   before ever producing a draft -- those never reach the accept/discard flow, so there's nothing
   to update later.
2. On `/api/metrics/outcome`: a second line, same `request_id`, with the final outcome.

Consumers of the JSONL file should treat the last line for a given `request_id` as the source of
truth -- `metrics/trace.py`'s `SessionStore` (in-memory, per-process) does exactly this for
`GET /api/metrics/session`, which is why that endpoint doesn't need to re-parse the file on every
call. The tradeoff: `SessionStore` is process-local and resets on backend restart, while the JSONL
file itself is durable. For the local single-user dev tool this backend is built for, that's an
acceptable split -- a restart losing live session counters while the historical trace file stays
intact.

## 7. KPI formulas (metrics/kpi.py)

- **DAR (Draft Acceptance Rate)** = `accepted / returned`, where `returned` excludes requests that
  never produced a draft at all (`"error"`, `"timeout"`) -- a request that failed before generating
  anything was never "returned" for the user to judge.
- **WTR (Wasted Token Ratio)** = `wasted_tokens / total_tokens`, where "wasted" means tokens spent
  on a request whose outcome was `"discarded"`, `"cancelled"`, `"superseded"`, `"timeout"`, or
  `"error"` -- anything that didn't end in an accepted draft.
- **BC (Budget Compliance)** = fraction of non-cancelled, non-error/timeout requests whose `e2e`
  latency was within `LATENCY_BUDGET_MS` (default 8000ms, configurable).
- **CPAD (Cost Per Accepted Draft)** = `total_cost_usd / accepted_count`. Uses
  `notional_hosted_cost_usd` per request (see section 5) -- with the default zero rate table, CPAD
  is always `$0`, which is correct and not a bug; it only becomes informative once a real rate
  table is configured.

All four return `null` (not `0` or `NaN`) when their denominator is zero -- an empty session
reports "no data," not a misleadingly precise zero.

## 8. What the live metrics panel shows, and how often

`components/UI/MetricsPanel.tsx` shows two kinds of numbers:

- **Client-side counters** (request/accepted/discarded/cancelled/error counts) -- updated
  synchronously by `state/metricsStore.ts` the moment the frontend knows about each event. Instant,
  zero network cost.
- **Server-computed KPIs** (DAR/WTR/BC/CPAD) -- polled from `GET /api/metrics/session` every 3
  seconds while the panel is open. A poll, not a push, specifically so the panel never adds a
  render dependency to the canvas's own render loop -- opening/closing it, or its poll ticking, has
  zero effect on `CanvasRenderer`'s `requestAnimationFrame` path.
