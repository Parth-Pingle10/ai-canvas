# Canvas-Native Feature Ideas & Shipped Original Feature

This document presents the original shipped feature implemented in the AI Canvas along with 10 canvas-native feature proposals designed specifically for infinite whiteboard environments.

---

## 1. Shipped Original Feature

### Feature: **Native Structured Diagram & Shape Transformation Engine with Topological Layout**

- **Problem**: Whiteboard users frequently draw rough geometric shapes, process flowcharts, architecture diagrams, and mind maps. Conventional AI whiteboard assistants either paste static, non-editable raster image replacements or dump plain text in a sidebar, forcing the user to manually recreate shapes and connectors if they wish to edit or reposition them.
- **Why Canvas is the Right Medium**: The canvas is inherently a spatial, vector-based medium. Turning rough ink into native, selectable, resizable vector shapes (rectangles, diamonds, circles, triangles) and connected orthogonal arrows preserves full user authorship, allowing users to drag individual nodes while connectors remain dynamically anchored.
- **Implementation & Architecture**:
  1. Multimodal AI identifies shapes, labels, and directional relationships from the canvas ROI.
  2. Generates structured JSON adhering to a strict node-and-edge schema with semantic boundary validation.
  3. Frontend `LayoutEngine.ts` applies a deterministic topological layout algorithm with orthogonal connection routing.
  4. Renders the diagram as an AI Draft group with a floating **Accept / Discard** bar.
  5. **Atomic Source Replacement**: Accepting the draft removes the rough hand-drawn source strokes and confirms the clean native shapes in a single undoable transaction.
- **Model Dependency**: Multimodal Vision-Language Model (`gemini-3.6-flash` / `qwen3-vl:4b`) supporting structured JSON schema generation.
- **Cost Class**: Low (~350–600 tokens, $0.00010–$0.00015 per diagram).
- **Undo Behavior**: Fully integrated into `useCanvasStore`'s unified snapshot history stack (`strokes`, `shapes`, `connectors`, `textObjects`). Undoing an accepted diagram cleanly restores the original rough sketch.
- **Metrics Instrumentation**: Tracked via `outcome: "accepted" | "discarded"`, with shape counts, edge counts, and layout latency recorded in traces.

---

## 2. 10 Original Canvas-Native Feature Proposals

### Idea 1: Spatial Semantic Clustering & Auto-Sectioning
- **Problem**: As whiteboards grow, content becomes cluttered, disorganized, and difficult to navigate.
- **Why Canvas**: The canvas contains spatial 2D proximity cues that traditional text documents lack.
- **Model Dependency**: Lightweight vision/clustering model or embedding model.
- **Cost Class**: Low (operates on bounding box coordinates and object text).
- **Risk**: Overly aggressive auto-grouping may disrupt intentional user layouts.

### Idea 2: Interactive Equation Scrubber & Parameter Slider
- **Problem**: Solved math equations on a canvas are static; users cannot explore parameter changes dynamically.
- **Why Canvas**: Sliders and scrubbers placed directly on mathematical canvas variables allow tactile visual exploration of functions and graphs.
- **Model Dependency**: Small symbolic algebra model (SymPy backend) or multimodal code generator.
- **Cost Class**: Low / Zero (pure client-side symbolic execution after initial derivation).
- **Risk**: Complex multivariable calculus systems may exceed client-side symbolic solvers.

### Idea 3: Gesture-to-Vector Path Smoothing & Bezier Fitting
- **Problem**: Complex curves and freehand illustrations look jagged when drawn with standard mouse or trackpad inputs.
- **Why Canvas**: Direct manipulation of vector control points is native to vector whiteboard engines.
- **Model Dependency**: Curve-fitting geometric algorithms or a micro-transformer for stroke optimization.
- **Cost Class**: Zero (client-side math).
- **Risk**: Over-smoothing could eliminate intentional hand-drawn nuances or artistic expressions.

### Idea 4: Spatial Mind-Map Node Expander
- **Problem**: Brainstorming hits dead ends when users run out of branching concepts.
- **Why Canvas**: Adding branching radial nodes with collision-free force-directed layout directly on the canvas expands thought workflows spatially.
- **Model Dependency**: Fast text LLM with structured tree output.
- **Cost Class**: Low (~150–250 output tokens).
- **Risk**: Hallucinated or irrelevant subtopics; potential spatial overlap with existing canvas drawings.

### Idea 5: Hand-Drawn Table to Interactive Data Grid
- **Problem**: Users frequently sketch rough tabular grids that cannot be sorted, filtered, or computed.
- **Why Canvas**: Converting a hand-drawn matrix into an in-canvas editable table preserves the user's whiteboard workspace while adding spreadsheet capabilities.
- **Model Dependency**: Multimodal vision model for cell boundary detection and OCR.
- **Cost Class**: Low-Medium (~400 tokens).
- **Risk**: Merged cells or irregular border strokes may cause column alignment errors.

### Idea 6: Visual Wireframe-to-Interactive UI Component Sandbox
- **Problem**: UX designers sketch low-fidelity button and input wireframes that remain static sketches.
- **Why Canvas**: Mounting interactive HTML/CSS micro-previews directly inside the wireframe box allows instant usability validation.
- **Model Dependency**: Code-generation LLM producing sanitized JSX/CSS.
- **Cost Class**: Medium (~500–900 tokens).
- **Risk**: Security risks with arbitrary script execution (mitigated by strict iframe sandboxing).

### Idea 7: Multi-Region Cross-Canvas Reasoning & Synthesis
- **Problem**: Users create separate thematic clusters across large whiteboards and struggle to find synthesis points.
- **Why Canvas**: Drawing a connecting bridge between two distant clusters prompts the AI to synthesize connections between both visual contexts.
- **Model Dependency**: Multimodal model with multi-image cropping or hierarchical context injection.
- **Cost Class**: Medium (~800–1,200 tokens).
- **Risk**: Increased prompt tokens due to multiple rasterized crops.

### Idea 8: Hand-Drawn Graph to Real-Time Interactive Plotter
- **Problem**: Hand-drawn Cartesian coordinate axes with drawn curves are qualitative and lack numeric precision.
- **Why Canvas**: Fitting an interactive FunctionGrapher onto drawn axes enables accurate plotting alongside freehand annotations.
- **Model Dependency**: Multimodal model for axis extraction + client-side Canvas plotting engine.
- **Cost Class**: Low (~250 tokens).
- **Risk**: Misinterpreting axis scales or asymptote markers on rough sketches.

### Idea 9: Audio-Annotated Spatial Replay & Walkthrough
- **Problem**: Sharing complex whiteboards asynchronously often requires separate screen recordings.
- **Why Canvas**: Storing timestamped stroke trajectories synchronized with audio transcripts enables dynamic spatial playback with pan/zoom tracking.
- **Model Dependency**: Speech-to-text model (Whisper) for transcription and spatial marker alignment.
- **Cost Class**: Medium (audio processing).
- **Risk**: Large document payload size when embedding audio streams.

### Idea 10: Infinite Canvas Semantic Zoom (LOD Architecture)
- **Problem**: When zooming out on massive whiteboards, individual details turn into illegible visual noise.
- **Why Canvas**: Dynamically rendering AI-generated high-level cluster summaries at low zoom levels and expanding to full detail on zoom-in optimizes readability.
- **Model Dependency**: Background batch summarization model.
- **Cost Class**: Low (cached per cluster; only recomputed on dirty edits).
- **Risk**: Visual popping if Level-of-Detail transitions are abrupt.
