# AI_USAGE — How AI tools were used in this project

This documents AI-assisted development for the SLATE assignment review. **No fabricated runtime metrics** — experiment results in `REPORT.md` remain TODO until collected locally.

## Tools

| Tool | Role |
|------|------|
| Cursor / Claude | Architecture audit, bug fix for qwen3-vl `thinking` field, docs scaffolding, test additions |
| Local Ollama (`qwen3-vl:4b`) | Runtime multimodal inference (user machine) |

## What AI generated vs. human-directed

- **Canvas foundation** — pre-existing structured stroke implementation (provided zip); not rewritten in this pass.
- **Backend AI pipeline** — largely generated in a prior pass; this audit verified behavior against real Ollama and fixed provider parsing.
- **Prompts** (`backend/app/ai/prompts.py`) — original wording, tuned for JSON draft cards on canvas.
- **Documentation** — AI-assisted drafting; claims marked TODO where not empirically verified.

## Verification discipline

- Frontend: 54 unit tests (`npm test`)
- Backend: pytest with `FakeProvider` + new `test_ollama.py` for thinking-field extraction
- Manual: `GET /health`, direct Ollama calls, `/api/analyze` with valid PNG payload

## What was **not** AI-faked

- Latency/token/cost numbers in UI and JSONL come from instrumentation or Ollama-reported counts.
- KPI formulas implemented in `backend/app/metrics/kpi.py` with unit tests.
- Experiment results table in `REPORT.md` intentionally left blank pending real runs.

## Reviewer notes

If asked "did the model actually run?": restart backend after pulling latest `ollama.py` fix, confirm `GET /health` shows `"model_installed": true`, draw `2x + 5 = 10`, pause or press `Ctrl+Enter`, accept/discard draft on canvas.
