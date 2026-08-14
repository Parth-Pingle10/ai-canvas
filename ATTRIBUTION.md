# Project Attribution & Third-Party Dependencies

This document provides complete attribution for all libraries, models, runtime environments, and conceptual references utilized in the AI Canvas project.

---

## 1. Third-Party Libraries & Dependencies

### Frontend (`frontend/package.json`)
- **React (`^19.0.0`)**: UI and component lifecycle management (MIT License).
- **Vite (`^6.0.0`)**: High-performance frontend build tooling and local dev server (MIT License).
- **Zustand (`^5.0.0`)**: Minimalist, high-performance canvas state and undo/redo management (MIT License).
- **Lucide React (`^1.16.0`)**: Clean, accessible SVG UI icons (ISC License).
- **KaTeX (`^0.16.0`)**: Fast, accessible client-side LaTeX mathematics rendering (MIT License).
- **Marked (`^15.0.0`)**: Low-overhead Markdown parser and compiler (MIT License).
- **DOMPurify (`^3.2.0`)**: Comprehensive XSS sanitization for rendered HTML (Apache-2.0 / MPL-2.0).

### Backend (`backend/requirements.txt`)
- **FastAPI (`^0.115.0`)**: High-performance asynchronous Python web framework (MIT License).
- **Uvicorn (`^0.34.0`)**: Production ASGI web server implementation (BSD-3-Clause).
- **Pydantic / Pydantic Settings (`^2.7.0`)**: Data validation and configuration management (MIT License).
- **google-genai (`^1.0.0`)**: Official Google GenAI Python SDK for Gemini multimodal API (Apache-2.0).
- **httpx (`^0.28.0`)**: Asynchronous HTTP client for Ollama local provider communication (BSD-3-Clause).
- **Pillow / PIL (`^11.0.0`)**: Python Imaging Library for raster image processing and inspection (HPND License).

---

## 2. Artificial Intelligence Models

- **Google Gemini 3.6 Flash (`gemini-3.6-flash`)**: Primary cloud multimodal foundation model for rapid visual grounding, mathematical derivation, and structured JSON generation.
- **Qwen3-VL 4B (`qwen3-vl:4b`) via Ollama**: Local on-device vision-language model utilized as an offline/quota fallback runtime.

---

## 3. Reference Material & Assignment Specification

- **Project SLATE Take-Home Assignment Specification**: Defined functional requirements, KPI mathematics (CPAD, DAR, WTR, BC), trace schema requirements, and evaluation guidelines.
- **Reference Whiteboard Patterns**: Informed by standard vector whiteboard architectures (infinite coordinates, stroke rendering, orthogonal connector anchoring).
- **Originality & Code Independence**: All canvas renderers, coordinate math, spatial clustering, prompt definitions (`backend/app/ai/prompts.py`), and diagram layout algorithms were implemented independently. No source code was copied from PenEcho or external reference assignments.
