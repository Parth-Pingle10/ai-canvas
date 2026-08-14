# Metrics & Observability Architecture

This document provides a technical accounting of the metrics, latency instrumentation, token accounting, cost modeling, and key performance indicators (KPIs) implemented in the AI Canvas.

---

## 1. Latency Breakdown & Measurement Points

The system instruments the complete end-to-end multimodal lifecycle across the frontend, network, backend, and AI model execution:

| Latency Metric | Measurement Location | Description & Implementation Notes |
| :--- | :--- | :--- |
| `t_capture` | Frontend (`useAiTrigger.ts`) | Wall-clock time to compute the region-of-interest (ROI) and rasterize strokes, shapes, connectors, and text to an offscreen canvas blob (`RegionExtractor.extractRegion`). |
| `t_dispatch` | Frontend (`useAiTrigger.ts`) | Wall-clock time to convert the blob to Base64 and initiate the `fetch()` payload serialization. |
| `ttfb` | Backend (`gemini.py` / `ollama.py`) | Time-to-First-Byte from the provider API. For non-streaming multimodal calls, this represents the complete round-trip inference response time. |
| `ttft` | Backend (`gemini.py` / `ollama.py`) | Time-to-First-Token. In non-streaming JSON generation mode, `ttft` is identical to `ttfb`. |
| `t_stream` | Backend (`gemini.py` / `ollama.py`) | Duration of token streaming. Logged as `0.0ms` for non-streaming batch responses. |
| `t_render` | Frontend (`useAiTrigger.ts`) | Duration between response receipt and initial DOM/canvas draft mounting (typically <10ms). |
| `e2e` | Backend (`analyze.py`) | Total end-to-end server duration from HTTP request ingestion to response completion, measured via `measure_ms()`. |

---

## 2. Token Accounting

Multimodal input and output tokens are tracked per provider:

### Google Gemini (`gemini-3.6-flash`)
- Surfaces exact provider-reported token usage via `response.usage_metadata`:
  - `prompt_token_count`: Combined input tokens (system instructions, user prompt text, structured context, and rasterized image tokens).
  - `candidates_token_count`: Total tokens generated in the output response.
  - `total_token_count`: Cumulative total tokens consumed.
- Logged directly in traces under `tokens.input_text`, `tokens.output`, and `tokens.total` with `tokens.input_image_source = "provider_reported"`.

### Ollama (`qwen3-vl:4b`)
- Ollama reports `prompt_eval_count` (total prompt + vision tokens) and `eval_count` (generated response tokens).
- `tokens.reasoning` and `tokens.cache_read` are logged as `null` when not reported by the runtime.

---

## 3. Cost Modeling & Rate Tables

Cost calculations are configuration-driven via environment variables in `backend/.env` without hardcoded prices:

$$\text{Cost} = \left(\frac{\text{Input Tokens}}{1,000,000} \times \text{COST\_INPUT\_PER\_MILLION}\right) + \left(\frac{\text{Output Tokens}}{1,000,000} \times \text{COST\_OUTPUT\_PER\_MILLION}\right)$$

### Default Configured Rates (USD)
- **Gemini 3.6 Flash**:
  - `COST_INPUT_PER_MILLION`: `$0.10` (Standard multimodal prompt rate)
  - `COST_OUTPUT_PER_MILLION`: `$0.40` (Standard candidate output rate)
- **Local Ollama**:
  - `actual_local_cost_usd`: `$0.00` (Zero direct API charge)
  - `notional_hosted_cost_usd`: Evaluated against the hosted equivalent rate table for comparison.

---

## 4. Key Performance Indicators (KPIs)

All session KPIs are computed in `backend/app/metrics/kpi.py` and exposed via `GET /api/metrics/session`:

### 1. Cost Per Accepted Draft (CPAD)
$$\text{CPAD} = \frac{\sum \text{Cost of all requests}}{\text{Count of accepted drafts}}$$
- **Meaning**: The effective financial cost required to produce one accepted unit of AI-generated whiteboard content. Accounts for the cost of rejected, superseded, or failed drafts.
- **Location**: `backend/app/metrics/kpi.py::compute_cpad()`

### 2. Draft Acceptance Rate (DAR)
$$\text{DAR} = \frac{\text{Count of accepted drafts}}{\text{Count of resolved drafts (accepted + discarded)}}$$
- **Meaning**: The ratio of AI drafts accepted into the permanent canvas versus rejected by the user. Measures model generation relevance and visual utility.
- **Location**: `backend/app/metrics/kpi.py::compute_dar()`

### 3. Wasted Token Ratio (WTR)
$$\text{WTR} = \frac{\sum \text{Tokens of discarded, superseded, and failed requests}}{\sum \text{Tokens of all requests}}$$
- **Meaning**: The fraction of total token expenditure that resulted in unconfirmed or discarded outcomes. High WTR indicates accidental background triggers or poor model alignment.
- **Location**: `backend/app/metrics/kpi.py::compute_wtr()`

### 4. Benchmark Coverage (BC)
$$\text{BC} = \frac{\text{Unique benchmark categories tested}}{\text{Total defined benchmark categories (5)}}$$
- **Meaning**: Verifies that the testing and evaluation harness covers all 5 required canvas archetypes (equations, system sketches, plain text questions, dense scenes, and rough scrawls).
- **Location**: `backend/app/metrics/kpi.py::compute_bc()`

---

## 5. Trace Format & Telemetry Schema

Every request produces durable, redacted records in `traces/traces.jsonl` matching the following schema:

```json
{
  "request_id": "req_8f1a2b3c",
  "session_id": "sess_default",
  "timestamp": "2026-08-14T17:42:00.123Z",
  "trigger": "manual",
  "provider": "gemini",
  "model": "gemini-3.6-flash",
  "configuration": {
    "temperature": 0.1,
    "top_p": 0.9,
    "max_tokens": 1024
  },
  "input": {
    "image_width": 1024,
    "image_height": 768,
    "mime_type": "image/png",
    "stroke_count": 6,
    "object_types": ["stroke", "text"],
    "canvas_texts": ["Create a flowchart for ETL pipeline"]
  },
  "latency_ms": {
    "t_capture": 18.2,
    "t_dispatch": 4.1,
    "ttfb": 920.4,
    "ttft": 920.4,
    "t_stream": 0.0,
    "t_render": 6.8,
    "e2e": 932.1
  },
  "tokens": {
    "input_text": 342,
    "input_image": 258,
    "input_image_source": "provider_reported",
    "output": 184,
    "reasoning": null,
    "cache_read": null,
    "total": 526
  },
  "cost_usd": 0.000107,
  "outcome": "accepted",
  "error": null,
  "retries": 0
}
```

### Trace Durability Lifecycle
1. **Request Completion**: Upon `/api/analyze` success, an initial trace record with `outcome: "pending"` is written to `traces.jsonl` and stored in memory.
2. **Outcome Settlement**: When the user clicks **Accept** or **Discard** on the canvas, `POST /api/metrics/outcome` appends a final record updating `outcome: "accepted"` or `"discarded"`.
3. **Trace Store Verification**: The repository contains 77 validated, real trace records in `traces/traces.jsonl`.
