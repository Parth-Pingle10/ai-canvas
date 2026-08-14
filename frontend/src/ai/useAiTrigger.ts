import { useCallback, useEffect, useRef } from "react";
import { useCanvasStore } from "../state/canvasStore";
import { useMetricsStore } from "../state/metricsStore";
import { computeRoi, extractRegion, roiSignature } from "../canvas/RegionExtractor";
import { viewportWorldBounds } from "../canvas/CoordinateSystem";
import { generateId } from "../utils/id";
import { analyzeRegion, reportOutcome, AnalyzeApiError } from "./apiClient";
import type { AiObject, WorldRect } from "../types/ai";
import type { Stroke } from "../types/document";
import { layoutDiagram } from "../canvas/LayoutEngine";
import { createCleanShape } from "../utils/shapeRecognition";

const IDLE_DELAY_MS = Number(import.meta.env.VITE_AI_IDLE_DELAY_MS ?? 700);
const ROI_MARGIN = Number(import.meta.env.VITE_AI_ROI_MARGIN ?? 100);
const ROI_RESOLUTION = Number(import.meta.env.VITE_AI_ROI_RESOLUTION ?? 1024);
const ROI_FORMAT = ((import.meta.env.VITE_AI_ROI_FORMAT as string | undefined) ?? "png") as
  | "webp"
  | "png";

const DRAFT_CARD_WIDTH = 280;
const DRAFT_CARD_HEIGHT = 140;
const DRAFT_CARD_GAP = 40;

/**
 * Owns the full "user stops drawing -> region -> request -> draft" loop
 * described in docs/AI_INTEGRATION.md. Mounted once, near the top of the
 * app (see App.tsx), not per-CanvasView, since it only needs store access,
 * not direct canvas/pointer-event involvement.
 */
export function useAiTrigger() {
  const strokes = useCanvasStore((s) => s.strokes);
  const prevStrokesRef = useRef<Stroke[]>(strokes);
  const dirtyIdsRef = useRef<Set<string>>(new Set());
  const idleTimerRef = useRef<number | null>(null);
  const lastSignatureRef = useRef<string | null>(null);
  const inFlightRef = useRef<{ requestId: string; controller: AbortController } | null>(null);

  const pushNotice = useCanvasStore((s) => s.pushNotice);
  const addPendingRequest = useCanvasStore((s) => s.addPendingRequest);
  const removePendingRequest = useCanvasStore((s) => s.removePendingRequest);
  const addDraft = useCanvasStore((s) => s.addDraft);
  const sessionId = useMetricsStore((s) => s.sessionId);
  const recordRequestSent = useMetricsStore((s) => s.recordRequestSent);
  const recordRequestResult = useMetricsStore((s) => s.recordRequestResult);
  const recordOutcome = useMetricsStore((s) => s.recordOutcome);

  // --- Dirty-stroke tracking: diff the strokes array on every change,
  // accumulating touched ids into a set that's cleared once they're
  // actually used as the basis for a dispatched request (not before —
  // a request that gets deduped/skipped shouldn't lose track of what's new).
  useEffect(() => {
    const prev = prevStrokesRef.current;
    if (prev === strokes) return;
    const prevVersions = new Map(prev.map((s) => [s.id, s.version]));
    for (const s of strokes) {
      if (prevVersions.get(s.id) !== s.version) dirtyIdsRef.current.add(s.id);
    }
    prevStrokesRef.current = strokes;

    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      void dispatch("idle_pause");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, IDLE_DELAY_MS);

    return () => {
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    };
    // dispatch is stable (see useCallback below with empty deps + refs/getState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes]);

  const dispatch = useCallback(async (trigger: "idle_pause" | "manual") => {
    const state = useCanvasStore.getState();
    const roi = computeRoi({
      strokes: state.strokes,
      recentStrokeIds: dirtyIdsRef.current,
      selectedIds: state.selectedIds,
      viewportWorldBounds: viewportWorldBounds(
        state.camera,
        state.viewportSize.width,
        state.viewportSize.height
      ),
    });

    // Nothing to analyze at all (empty canvas, empty viewport) — skip quietly.
    if (roi.source === "viewport" && state.strokes.length === 0) return;

    const signature = roiSignature(roi, state.strokes);

    if (trigger === "idle_pause" && signature === lastSignatureRef.current) {
      // Nothing meaningful changed since the last dispatch — don't spam.
      return;
    }

    // A new request supersedes any still-in-flight one.
    if (inFlightRef.current) {
      const { requestId, controller } = inFlightRef.current;
      controller.abort();
      removePendingRequest(requestId);
      void reportOutcome(requestId, "superseded");
      recordOutcome("superseded");
    }

    lastSignatureRef.current = signature;
    dirtyIdsRef.current = new Set();

    const requestId = generateId("req");
    const controller = new AbortController();
    inFlightRef.current = { requestId, controller };

    const anchorBounds: WorldRect = {
      x: roi.bounds.maxX + DRAFT_CARD_GAP,
      y: roi.bounds.minY,
      width: DRAFT_CARD_WIDTH,
      height: DRAFT_CARD_HEIGHT,
    };

    addPendingRequest({
      id: requestId,
      sourceBounds: roi.bounds,
      anchorBounds,
      trigger,
      startedAt: Date.now(),
      controller,
    });
    recordRequestSent();

    try {
      const tCaptureStart = performance.now();
      const region = await extractRegion(state.strokes, {
        bounds: roi.bounds,
        margin: trigger === "manual" && roi.source === "viewport" ? 0 : ROI_MARGIN,
        resolution: ROI_RESOLUTION,
        format: ROI_FORMAT,
      });
      const tCaptureMs = performance.now() - tCaptureStart;

      if (!region.imageBlob) {
        throw new AnalyzeApiError(
          "internal_error",
          "Could not rasterize the region on this device.",
          requestId
        );
      }

      const tDispatchStart = performance.now();
      const imageBase64 = await blobToBase64(region.imageBlob);
      const tDispatchMs = performance.now() - tDispatchStart;
      const actualFormat: "png" | "webp" = region.mimeType.includes("webp") ? "webp" : "png";

      const response = await analyzeRegion(
        {
          requestId,
          imageBase64,
          format: actualFormat,
          worldBounds: region.bounds,
          cropWidth: region.width,
          cropHeight: region.height,
          zoom: region.zoom,
          strokeCount: region.strokeCount,
          sessionId,
          trigger,
          tCaptureMs,
          tDispatchMs,
        },
        controller.signal
      );

      // If this request was superseded/cancelled while in flight, its
      // result must never become a draft, even though the network call
      // itself completed successfully.
      if (inFlightRef.current?.requestId !== requestId) return;

      inFlightRef.current = null;
      removePendingRequest(requestId);
      recordRequestResult({
        requestId,
        latencyMs: response.latency_ms,
        tokens: response.tokens,
        costUsd: response.cost_usd,
        model: response.model,
      });



      const draftType = response.draft.type;

      if (draftType === "diagram" && response.draft.nodes && response.draft.nodes.length > 0) {
        const draftGroupId = generateId("draft_grp");
        const layout = layoutDiagram(response.draft.nodes, response.draft.edges ?? [], {
          originX: anchorBounds.x,
          originY: anchorBounds.y,
          layoutDirection: response.draft.layout_direction,
          draftGroupId,
          isDraft: true,
        });
        useCanvasStore.getState().addDiagramDraft(layout.shapes, layout.connectors);
      } else if (draftType === "shape" && response.draft.shape) {
        const draftGroupId = generateId("draft_grp");
        const cleanShape = createCleanShape(
          response.draft.shape.shape_type ?? "rectangle",
          roi.bounds,
          "#1e1e1e",
          response.draft.shape.label ?? "",
          true,
          draftGroupId
        );
        useCanvasStore.getState().addShape(cleanShape);
      } else {
        const draft: AiObject = {
          id: generateId("ai"),
          kind: "ai-object",
          status: "draft",
          contentType: (response.draft.type === "latex" ? "latex" : "markdown"),
          title: response.draft.title,
          content: response.draft.content,
          confidence: response.draft.confidence,
          bounds: anchorBounds,
          sourceBounds: roi.bounds,
          requestId,
          createdAt: Date.now(),
          version: 1,
        };
        addDraft(draft);
      }
    } catch (err) {
      if (inFlightRef.current?.requestId === requestId) inFlightRef.current = null;
      removePendingRequest(requestId);

      if (err instanceof DOMException && err.name === "AbortError") {
        // Expected: superseded or explicitly cancelled — already handled
        // at the cancellation site, nothing further to do here.
        return;
      }

      recordOutcome("error");
      const message = err instanceof AnalyzeApiError ? err.message : "Could not reach the AI backend.";
      pushNotice("generic", message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerManualAnalysis = useCallback(() => {
    void dispatch("manual");
  }, [dispatch]);

  return { triggerManualAnalysis };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip the "data:<mime>;base64," prefix — the backend expects raw base64.
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image blob"));
    reader.readAsDataURL(blob);
  });
}
