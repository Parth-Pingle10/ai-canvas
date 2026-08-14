# ATTRIBUTION

## Third-party libraries

### Frontend (`frontend/package.json`)

- **React** — UI framework (MIT)
- **Vite** — build tool (MIT)
- **Zustand** — state management (MIT)
- **marked** — Markdown rendering (MIT)
- **DOMPurify** — HTML sanitization (Apache-2.0 / MPL-2.0)
- **KaTeX** — LaTeX math rendering (MIT)
- **lucide-react** — icons (ISC)

### Backend (`backend/requirements.txt`)

- **FastAPI** — HTTP API (MIT)
- **Uvicorn** — ASGI server (BSD)
- **Pydantic / pydantic-settings** — validation & config (MIT)
- **httpx** — async HTTP client for Ollama (BSD)

## Models

- **Ollama** runtime — local inference ([ollama.com](https://ollama.com))
- Default configured model: `qwen3-vl:4b` or `qwen3-vl:8b` (Alibaba Qwen team; served locally, no API key)

## Assignment / reference material

- **Project SLATE take-home brief** — functional requirements, KPI definitions, experiment structure.
- Canvas foundation architecture patterns informed by common whiteboard apps (infinite pan/zoom, structured strokes) — implementation is original to this repo.

## Not used

- PenEcho or other referenced assignment codebases — prompts and architecture were written for this project (`backend/app/ai/prompts.py` documents original wording).

## Assets

- `frontend/src/assets/` — Vite/React default assets where present.
