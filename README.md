# AI Canvas

An infinite, structured-document whiteboard: draw, write, erase, select, move, resize,
undo/redo, pan, zoom, save/load, export to PNG -- plus an AI loop where pausing while you draw
sends the region you're working on to a local multimodal model (via [Ollama](https://ollama.com))
and gets back a draft object placed directly on the canvas, which you can accept or discard.

This is a two-part project:

```text
frontend/   React + TypeScript canvas app (Vite)
backend/    FastAPI service: region -> Ollama -> structured draft
docs/       Architecture docs for both halves
```

For the full technical writeup, see:
- [`docs/CANVAS_ARCHITECTURE.md`](docs/CANVAS_ARCHITECTURE.md) -- coordinate system, rendering,
  undo, region extraction (the canvas foundation, unchanged by the AI integration)
- [`docs/AI_INTEGRATION.md`](docs/AI_INTEGRATION.md) -- idle detection, ROI strategy, draft
  objects, cancellation (what this pass added)
- [`docs/METRICS.md`](docs/METRICS.md) -- exactly what's measured, estimated, or not yet
  measurable, and why

## Quick start

You need three things running: Ollama, the backend, and the frontend.

```bash
# 1. Ollama (separate install: https://ollama.com)
ollama pull qwen3-vl:8b        # or qwen3-vl:4b on lighter hardware
ollama serve                   # if not already running as a service

# 2. Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000

# 3. Frontend (new terminal)
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open the frontend's printed URL (typically `http://localhost:5173`). The canvas works fully
without the backend running (draw, save, load, export all work offline); only the AI loop needs
the backend + Ollama reachable. `GET http://localhost:8000/health` reports whether Ollama is
reachable and the configured model is installed.

## What's implemented

**Canvas** (unchanged from the pre-AI foundation -- see `docs/CANVAS_ARCHITECTURE.md` for depth):
free drawing (pen/pencil/highlighter, pressure/tilt-aware), stroke eraser, select (click/marquee,
move, resize), pan, cursor-anchored zoom, full undo/redo, save/load JSON with validation,
localStorage autosave, PNG export cropped to content bounds, keyboard shortcuts, light/dark theme,
viewport culling tested to 5,000+ strokes.

**AI integration** (this pass):
- Idle-pause detection (700ms configurable) and manual trigger (Ctrl+Enter)
- Region-of-interest strategy: recent strokes -> selection -> viewport, in that order
- WebP/PNG rasterization of just the relevant region (never a full-window screenshot)
- FastAPI backend calling a local Ollama multimodal model, returning structured
  `{type: markdown|latex, content, title, confidence}`
- Draft objects rendered **on the canvas** (not a chat sidebar) -- movable, resizable, Markdown/
  LaTeX rendered and sanitized, Accept/Discard actions, accept is undoable
- Request cancellation and automatic supersession (a new request aborts an in-flight older one)
- Duplicate-request prevention via a stroke-version signature, so idle-pause doesn't spam
  identical requests
- Full latency/token/cost instrumentation, JSONL trace file, session KPIs (DAR/WTR/BC/CPAD), and
  a live metrics panel in the UI

**Intentionally not implemented** (out of scope per the assignment): authentication, accounts,
collaboration, plugin systems, desktop/mobile packaging, cloud deployment, Docker orchestration,
custom handwriting recognition, a chat sidebar.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `P` / `B` / `H` / `E` / `V` | Pen / Pencil / Highlighter / Eraser / Select |
| `Space` + drag, or middle-mouse drag | Pan |
| Scroll / pinch | Zoom (cursor-anchored) |
| `Ctrl`/`Cmd` + `Z` | Undo |
| `Ctrl`/`Cmd` + `Shift` + `Z` (or `Ctrl`/`Cmd` + `Y`) | Redo |
| `Delete` / `Backspace` | Delete selection |
| `Escape` | Cancel selection |
| `Ctrl`/`Cmd` + `S` / `O` / `E` | Save / Load / Export PNG |
| `Ctrl`/`Cmd` + `Enter` | Analyze region now (manual AI trigger) |
| `Ctrl`/`Cmd` + `Shift` + `M` | Toggle AI metrics panel |
| `?` | In-app shortcut list |

## Testing

```bash
# Frontend: 54 tests (coordinates, persistence, region extraction/ROI, undo/redo including AI
# objects, AI draft lifecycle, pending-request cancellation, API client error mapping)
cd frontend && npm test

# Backend: 40 tests against a mocked Ollama provider (no real Ollama needed to run these)
cd backend && python -m pytest tests/ -v
```

## Known limitations

- **Ollama connectivity has not been verified against a real model in this environment** -- the
  backend was built and tested against a `FakeProvider` test double implementing the same
  interface `OllamaProvider` does (see `backend/README.md`). Run `GET /health` after setup to
  confirm your local Ollama + model are actually reachable before relying on the AI loop.
- **Non-streaming Ollama calls**: `ttft`/`t_stream` are approximated (identical to `ttfb`/`0`) --
  see `docs/METRICS.md` section 2 for the honest accounting and what streaming support would need.
- **AI objects aren't included in PNG export** or canvas viewport culling (they're a DOM overlay,
  not canvas-rasterized) -- see `docs/AI_INTEGRATION.md` section 1 for why, and what a spatial-
  culling follow-up would look like if AI object counts ever grew large.
- **No spatial index** for strokes past ~5,000-10,000 -- unchanged from the canvas foundation,
  see `docs/CANVAS_ARCHITECTURE.md` section 7.
- Everything else in `docs/CANVAS_ARCHITECTURE.md` section 15 (resize proportion locking, no
  freeform lasso selection, single-file save/load) still applies -- the AI integration didn't
  touch those.

## What should be implemented next

1. **Streaming Ollama responses** for real `ttft`/`t_stream` measurement (`docs/METRICS.md` §2).
2. **PNG export including AI objects**, so an exported canvas matches what's visually on screen.
3. **A connecting line/arrow** between a draft card and the ROI that produced it (`sourceBounds`
   is already stored on every `AiObject`, ready for this).
4. **Verify against real `qwen3-vl:8b`/`4b`** and tune the prompt (`backend/app/ai/prompts.py`)
   based on actual model behavior -- it has only been exercised against a scripted fake so far.
5. **Viewport culling for AI objects** if usage ever produces large numbers of them on one canvas.
