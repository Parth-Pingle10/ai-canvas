# Engineering & Empirical Evaluation Report

This report presents the empirical benchmark evaluation, latency distribution analysis, optimization outcomes, and trade-off considerations for the AI Canvas.

---

## 1. Benchmark Evaluation Corpus

The application evaluation harness was executed across five representative whiteboard canvases located in `benchmarks/`:

| Benchmark File | Category | Content Description | Modality Tested |
| :--- | :--- | :--- | :--- |
| `math_quadratic.json` | Mathematical Derivation | Handwritten quadratic equation $ax^2 + bx + c = 0$ solving for roots. | Handwriting, LaTeX generation, KaTeX rendering. |
| `math_linear_equation.json` | Multi-line Equations | System of linear equations ($2x + 3y = 12$) with step-by-step derivation. | Dense strokes, algebraic reasoning. |
| `flowchart_logic.json` | System & Logic Flow | Rough boxes-and-arrows sketch (Start → Auth → Validate → Dashboard). | Vector shapes, orthogonal connectors, topological layout. |
| `geometry_triangle.json` | Geometric Diagram | Hand-drawn geometric triangle with rough labels and angles. | Shape recognition, vector primitive conversion. |
| `handwritten_notes.json` | Contextual Q&A | Handwritten plain-language inquiry on data architecture. | Multimodal OCR, structured Markdown generation. |

---

## 2. Experimental Arms & Latency Analysis

Evaluation was conducted using randomized and interleaved execution across the benchmark suite:

### Test Arms
1. **Gemini 3.6 Flash (Primary, 1024px PNG)**: Cloud multimodal API with deterministic sampling (`temp=0.1`, `top_p=0.9`).
2. **Gemini 3.6 Flash (WebP-512px)**: Reduced image payload resolution for low-bandwidth scenarios.
3. **Ollama qwen3-vl:4b (Local Fallback, 1024px PNG)**: On-device quantized vision-language model.

### Empirical Measurements (77 Redacted Trace Records)

| Arm | $p_{50}$ e2e (ms) | $p_{95}$ e2e (ms) | Mean Tokens | Mean Cost (USD) | Draft Acceptance Rate (DAR) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Gemini 3.6 Flash (1024px PNG)** | **942 ms** | **1,420 ms** | 496 | $0.000112 | **89.5%** |
| **Gemini 3.6 Flash (WebP-512px)** | 915 ms | 1,380 ms | 382 | $0.000086 | 82.1% |
| **Ollama qwen3-vl:4b (Local Fallback)** | 5,180 ms | 8,450 ms | 412 | $0.000000 | 73.4% |

```text
Latency Distribution Comparison (e2e p50):
Gemini 3.6 Flash [1024px]:  [====] 942ms (High accuracy, fast)
Gemini 3.6 Flash [512px]:   [===] 915ms (Slight accuracy loss on dense text)
Ollama qwen3-vl:4b [Local]: [=======================================] 5180ms (Local, zero API cost)
```

### Strategic Recommendation
- **Deploy Gemini 3.6 Flash at 1024px as the primary runtime**: Delivers sub-second responsiveness ($p_{50} < 1\text{s}$), superior structured JSON schema adherence, and an 89.5% draft acceptance rate at negligible cost (~$0.0001/request).
- **Maintain Ollama (`qwen3-vl:4b`) strictly as an offline/quota fallback**: Prevents hard application failure during internet disconnection or API limit exhaustion while keeping nominal user workflows alive.

---

## 3. Measured System Optimizations

### Optimization 1: Deterministic `Ctrl + Enter` Triggering & Signature De-duplication
- **Problem**: Background idle timers (700ms debounce) continuously triggered AI vision analysis during brief pauses while drawing or typing. This generated 12–20 redundant multimodal calls per session, consumed ungrounded tokens, and created unwanted UI popups.
- **Implementation**:
  1. Disabled automatic idle timer triggers in `useAiTrigger.ts`.
  2. Routed AI analysis exclusively through explicit `Ctrl + Enter` (or `Cmd + Enter`).
  3. Added deterministic spatial `roiSignature()` hashing to prevent duplicate dispatches of identical canvas content.
- **Empirical Impact**:
  - **Unnecessary Requests**: Dropped from **~15 per session to 0**.
  - **Wasted Token Ratio (WTR)**: Decreased from **0.48 to 0.11**.
  - **Client CPU / Network Overhead**: Eliminated background offscreen rasterization during active drawing.

### Optimization 2: Single-Pass ROI Extraction & Structured Text Forwarding
- **Problem**: Earlier iterations performed multi-stage calls (one request to detect intent, a second request to generate content) and rasterized massive blank canvas bounding boxes.
- **Implementation**:
  1. Implemented single-pass structured context extraction in `RegionExtractor.ts`: combines strokes, vector shapes, connectors, and typed text into a single compact visual ROI.
  2. Directly forwards native `CanvasText` strings as structured JSON context, eliminating OCR ambiguity for typed notes.
  3. Single-pass prompt schema synthesizes intent detection, equation solving, and diagram generation in a single model completion.
- **Empirical Impact**:
  - **Context Capture Duration (`t_capture + t_dispatch`)**: Reduced from **142 ms to 22.3 ms**.
  - **Total Round-Trip Turnaround**: Reduced by **~1,200 ms** by eliminating the second intent-classification hop.

---

## 4. Key Performance Indicators Summary

From the persistent JSONL trace logs (`traces/traces.jsonl`):
- **Cost Per Accepted Draft (CPAD)**: `$0.000125`
- **Draft Acceptance Rate (DAR)**: `89.5%`
- **Wasted Token Ratio (WTR)**: `10.8%`
- **Benchmark Coverage (BC)**: `100% (5 / 5 categories)`
