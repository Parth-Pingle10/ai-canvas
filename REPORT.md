# REPORT — Engineering & Experiment Report

> **Status:** Infrastructure verified; experiment numbers are **not yet collected**.
> Run `scripts/run_experiment.py` after creating five benchmark canvases.

## What works (verified in this audit)

- Canvas core loop: structured strokes, pan/zoom, select/move/resize, undo/redo, save/load, PNG export (strokes only).
- AI pipeline plumbing: ROI extraction → `/api/analyze` → Ollama → draft objects on canvas → accept/discard → JSONL traces + KPIs.
- **Real Ollama fix:** `qwen3-vl` models emit JSON in the `thinking` field when `response` is empty; the provider now reads both.

## Experiment plan (required by assignment)

| Item | Status |
|------|--------|
| 5 benchmark canvases | ❌ TODO — add JSON under `benchmarks/` |
| ≥3 arms | ✅ `scripts/run_experiment.py` defines baseline, webp-512, webp-1024 |
| ≥3 repetitions | ✅ `--repetitions 3` |
| Randomized/interleaved | ✅ `--shuffle` |
| p50/p95 e2e, mean tokens/cost, DAR | 🟡 Collect CSV + parse `backend/traces/traces.jsonl` |
| Chart + recommendation | 🟡 TODO after data collection |
| Two measured optimizations | 🟡 Candidates: WebP ROI (smaller payload), lower ROI resolution (512 vs 1024) |

## Optimization candidates (hypothesis only — not measured yet)

1. **WebP vs PNG ROI** — smaller upload, potentially lower `t_dispatch` and token pressure on vision encoder.
2. **ROI resolution 512 vs 1024** — fewer image tokens / faster inference at possible quality cost.

## Known limits affecting experiments

- Ollama is non-streaming: `ttft` equals `ttfb`, `t_stream` is 0 (see `docs/METRICS.md`).
- Local GPU OOM or 30s timeout can fail requests — tune `AI_REQUEST_TIMEOUT_MS` and model size.
- `t_render` is not measured (frontend-only).

## How to collect data

```bash
# Terminal 1: Ollama + backend running
cd backend && uvicorn app.main:app --port 8000

# Terminal 2: dry-run plumbing check
python scripts/run_experiment.py --dry-run --shuffle --output results/experiment.csv

# After benchmark canvases exist:
python scripts/run_experiment.py --canvases benchmarks/*.json --shuffle --output results/experiment.csv
```

Analyze traces:

```bash
# Each line in backend/traces/traces.jsonl is one trace event; last line per request_id wins.
```

## Results

<!-- TODO: Fill after running experiment — do not invent numbers -->

| Arm | p50 e2e (ms) | p95 e2e (ms) | mean tokens | mean cost (USD) | DAR |
|-----|--------------|--------------|-------------|-----------------|-----|
| baseline | — | — | — | — | — |
| webp-512 | — | — | — | — | — |
| webp-1024 | — | — | — | — | — |

**Recommendation:** TODO after data collection.
