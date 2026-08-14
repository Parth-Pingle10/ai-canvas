# AI Canvas Backend

FastAPI service implementing the region -> local multimodal model -> structured draft pipeline
described in [`../docs/AI_INTEGRATION.md`](../docs/AI_INTEGRATION.md). Talks to a locally-running
[Ollama](https://ollama.com) instance; no cloud API keys, no paid providers.

## Architecture

```text
backend/
├── app/
│   ├── main.py              FastAPI app, CORS, router registration
│   ├── config.py            All tunables, read once from environment (.env)
│   ├── dependencies.py      FastAPI DI wiring (provider singleton, overridable in tests)
│   ├── images.py            Base64 decode + real magic-byte/dimension validation
│   │
│   ├── api/
│   │   ├── health.py        GET /health
│   │   ├── analyze.py       POST /api/analyze -- the core pipeline
│   │   └── metrics.py       GET /api/metrics/session, POST /api/metrics/outcome
│   │
│   ├── ai/
│   │   ├── base.py          MultimodalModel abstraction + typed error classes
│   │   ├── ollama.py        The only file that speaks Ollama's HTTP API
│   │   ├── prompts.py       Original system/user prompt construction
│   │   └── parsing.py       Safe recovery of the model's JSON output
│   │
│   ├── schemas/
│   │   ├── request.py       AnalyzeRequest and friends (Pydantic-validated)
│   │   └── response.py      AnalyzeResponse, error/health/metrics schemas
│   │
│   └── metrics/
│       ├── instrumentation.py  Timing helper (Stopwatch / measure_ms)
│       ├── tokens.py           Provider usage -> TokenUsage schema
│       ├── cost.py             Local ($0) vs. notional-hosted cost
│       ├── trace.py            JSONL trace writer + in-memory session store
│       └── kpi.py              DAR / WTR / BC / CPAD calculation
│
├── traces/               traces.jsonl written here at runtime (gitignored)
├── tests/                pytest suite, runs against a mocked provider (no Ollama needed)
├── requirements.txt
└── .env.example
```

**Provider abstraction** (`ai/base.py`): every route talks to `MultimodalModel`, never to Ollama
directly. Swapping in Gemini/Claude/OpenAI later means writing one new class implementing
`analyze()` and `is_available()`, and pointing `dependencies.py`'s `get_model_provider()` at it --
no route, schema, or metrics code changes.

## Ollama model

Primary: `qwen3-vl:8b`. Fallback for lighter hardware: `qwen3-vl:4b`. Both configured via
`OLLAMA_MODEL` in `.env` -- never hardcoded (see `config.py`).

```bash
ollama pull qwen3-vl:8b
# or, if that's too much for your machine:
ollama pull qwen3-vl:4b   # then set OLLAMA_MODEL=qwen3-vl:4b in backend/.env
```

**This backend was built and tested in a sandboxed environment without Ollama installed or
network access to a local Ollama daemon.** The full request/response pipeline, error handling, and
metrics are verified end-to-end against a `FakeProvider` test double (see `tests/conftest.py`) that
implements the exact same `MultimodalModel` interface `OllamaProvider` does -- so the pipeline
logic is exercised, but a real call to `qwen3-vl:8b` has not been. Before relying on this in
practice: run `ollama serve`, pull the model, start this backend, and hit `GET /health` -- it
should report `"status": "ok"`. If `qwen3-vl` isn't available for your Ollama version, check
`ollama list` and `ollama pull` output directly; do not silently substitute a text-only model (the
health check and `/api/analyze`'s `model_unavailable` error exist specifically to surface this
instead of failing quietly).

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # adjust OLLAMA_MODEL etc. if needed
uvicorn app.main:app --reload --port 8000
```

Verify: `curl http://localhost:8000/health`

## Running tests

```bash
cd backend
python -m pytest tests/ -v
```

40 tests, all passing against the mocked provider -- no Ollama daemon required to run the suite.
Covers: request schema validation, every provider failure mode (`ProviderUnavailableError`,
`ModelUnavailableError`, `ModelTimeoutError`, an unexpected exception), image validation (bad
base64, format/magic-byte mismatch, oversized payload, dimension bounds), malformed/recoverable
model JSON output, cost calculation, all four KPI formulas, and the outcome-reporting round trip
against the in-memory session store.

## API

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | `{status, ollama, model}` -- reachability + model-installed check |
| `/api/analyze` | POST | The core pipeline: image + context -> validated structured draft |
| `/api/metrics/session` | GET | `?session_id=...` -> DAR/WTR/BC/CPAD + counts for that session |
| `/api/metrics/outcome` | POST | `{request_id, outcome}` -- reports what the user did with a draft |

Full request/response schemas: `app/schemas/request.py`, `app/schemas/response.py`, or just run the
server and open `/docs` (FastAPI's auto-generated OpenAPI UI).

## Error handling

Every provider failure maps to a specific `error_code` and HTTP status, never a bare 500:

| `error_code` | HTTP | Message | Cause |
|---|---|---|---|
| `ollama_unavailable` | 503 | "Ollama is not running." | Connection refused / daemon unreachable |
| `model_unavailable` | 503 | "Configured model is unavailable." | Ollama returned 404 for the model name |
| `timeout` | 504 | "AI request timed out." | Exceeded `AI_REQUEST_TIMEOUT_MS` |
| `invalid_model_output` | 502 | "The model returned an invalid response." | Couldn't parse/validate the model's JSON, even after the recovery pass in `ai/parsing.py` |
| `validation_error` | 422 | (specific) | Bad image payload -- see `app/images.py` |
| `network_error` | 502 | "Could not reach the AI backend." | Anything else network-shaped, including truly unexpected exceptions (the route never crashes -- see `api/analyze.py`'s final `except Exception` clause) |

## Cost accounting

Local Ollama calls cost `$0` -- always, literally, not a rounding artifact. The `notional_hosted_cost_usd`
figure is computed from `COST_INPUT_PER_MILLION`/`COST_OUTPUT_PER_MILLION` in `.env`, both `0` by
default. See [`../docs/METRICS.md`](../docs/METRICS.md) section 5 for the full accounting
philosophy, and section 4 for exactly what Ollama does and doesn't report about token usage.

## Known limitations

- **Non-streaming only.** `ttfb`/`ttft` are reported as identical, `t_stream` is always `0` --
  see `docs/METRICS.md` section 2 for why and what streaming support would involve.
- **`SessionStore` is in-memory and process-local.** Session KPI counters reset on backend
  restart; the JSONL trace file (the durable record) does not.
- **No authentication.** Deliberately out of scope for this assignment; do not expose this
  backend beyond localhost without adding some.
