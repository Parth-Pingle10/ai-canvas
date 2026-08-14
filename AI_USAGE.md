# AI Assistance & Verification Disclosure

This document provides a truthful, comprehensive disclosure of how AI coding assistants were utilized during the development of the AI Canvas, where model suggestions failed, how bugs were diagnosed, and the verification discipline enforced throughout the project.

---

## 1. Tools Utilized

| AI Assistant / Model | Primary Role & Areas of Assistance |
| :--- | :--- |
| **Antigravity (Google DeepMind)** | Code architecture analysis, multi-file refactoring, test suite development, TypeScript typechecking, and documentation auditing. |
| **Google Gemini (`gemini-3.6-flash`)** | Runtime multimodal vision inference, equation solving, and structured JSON diagram generation. |
| **Local Ollama (`qwen3-vl:4b`)** | On-device fallback vision model testing and offline evaluation. |

---

## 2. Where AI Generated Code vs. Human Architectural Direction

- **Human-Directed Architecture**:
  - Decision to use **explicit `Ctrl + Enter` (or `Cmd + Enter`) trigger** instead of background idle timers to guarantee deterministic user control over token costs and avoid editing interruption.
  - Definition of the **unified undo/redo history stack** in Zustand combining strokes, shapes, connectors, and text objects.
  - Designing the **atomic source-replacement pattern** for native AI diagram drafts.
  - Designing the **adaptive result-centric auto-focus camera algorithm**.
- **AI-Assisted Implementation**:
  - Scaffolding Pydantic request/response schemas and FastAPI route boilerplate.
  - KaTeX rendering integration and DOMPurify sanitization pipeline.
  - Automated test suite drafting (Vitest for frontend, Pytest for backend).

---

## 3. Real Bugs Introduced by AI & How They Were Resolved

1. **In-Canvas Text Tool DOM Race Condition**:
   - *AI Mistake*: The initial implementation used an uncontrolled `<textarea defaultValue={...}>` with an `onBlur` commit handler.
   - *Problem*: When the user typed and immediately pressed `Ctrl + Enter`, the global keyboard listener ran `onManualAnalyze()` before React processed `onBlur`. The AI request received empty/stale canvas text.
   - *Resolution*: Replaced with a controlled `InlineTextEditorComponent` that synchronously flushes the live input value directly into `useCanvasStore` upon `Ctrl + Enter` in the same tick before triggering analysis.

2. **Gemini Automatic Function Calling (AFC) Warning**:
   - *AI Mistake*: Calling `Models.generate_content()` without explicitly disabling AFC emitted a persistent runtime warning in the `google-genai` SDK.
   - *Resolution*: Explicitly configured `automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)` in `types.GenerateContentConfig`.

3. **Multimodal Hallucinations from Unconstrained Sampling**:
   - *AI Mistake*: Default higher temperature permitted the vision model to invent labels, nodes, and relationships not present on the canvas when visual input was sparse.
   - *Resolution*: Lowered temperature to `0.1` (`top_p=0.9`) and added strict negative grounding directives in `backend/app/ai/prompts.py` ("Use only the supplied canvas content; do not invent missing information").

4. **Metrics 404 on Superseded Requests**:
   - *AI Mistake*: The frontend was sending outcome reports for in-flight requests that were superseded on the client before reaching the backend trace store.
   - *Resolution*: Confined client-side supersessions to the local metrics store without dispatching unrecorded network calls, and added a `reportedOutcomes` de-duplication cache in `apiClient.ts`.

---

## 4. Verification & Testing Discipline

All features and fixes were verified through rigorous automated and manual testing:

- **Automated Frontend Test Suite**: 72 tests across 11 test suites (`npm test` via Vitest) passing with 100% success rate.
- **Frontend Type Safety**: `npx tsc --noEmit` verified with 0 errors.
- **Automated Backend Test Suite**: 54 unit tests (`pytest`) covering parsing, metrics, KPIs, cost calculations, and fallback routing.
- **Live Multimodal Verification**: Real live end-to-end execution testing mathematical equations, shape cleanup, complex topological flowcharts, and markdown inquiries.
- **Trace Verification**: 77 real, redacted trace records verified in `traces/traces.jsonl`.
