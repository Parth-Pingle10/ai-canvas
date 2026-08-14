import { useCallback, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { useCanvasStore } from "../../state/canvasStore";
import { useMetricsStore } from "../../state/metricsStore";
import { worldToScreen } from "../../canvas/CoordinateSystem";
import { renderDraftContent } from "../../ai/renderContent";
import { reportOutcome } from "../../ai/apiClient";
import type { AiObject, WorldRect } from "../../types/ai";
import "katex/dist/katex.min.css";
import "./AiObjectLayer.css";

const MIN_CARD_WIDTH = 160;
const MIN_CARD_HEIGHT = 80;

export function AiObjectLayer() {
  const camera = useCanvasStore((s) => s.camera);
  const viewportSize = useCanvasStore((s) => s.viewportSize);
  const aiObjects = useCanvasStore((s) => s.aiObjects);
  const pendingRequests = useCanvasStore((s) => s.pendingRequests);

  return (
    <div className="ai-layer">
      {aiObjects.map((obj) => (
        <AiCard key={obj.id} object={obj} camera={camera} viewportSize={viewportSize} />
      ))}
      {pendingRequests.map((req) => (
        <PendingCard
          key={req.id}
          requestId={req.id}
          anchorBounds={req.anchorBounds}
          camera={camera}
          viewportSize={viewportSize}
        />
      ))}
    </div>
  );
}

function useScreenPlacement(
  bounds: WorldRect,
  camera: { x: number; y: number; zoom: number },
  viewportSize: { width: number; height: number }
) {
  const screen = worldToScreen({ x: bounds.x, y: bounds.y }, camera, viewportSize.width, viewportSize.height);
  return {
    left: screen.x,
    top: screen.y,
    scaledWidth: bounds.width * camera.zoom,
    scaledHeight: bounds.height * camera.zoom,
  };
}

function PendingCard({
  requestId,
  anchorBounds,
  camera,
  viewportSize,
}: {
  requestId: string;
  anchorBounds: WorldRect;
  camera: { x: number; y: number; zoom: number };
  viewportSize: { width: number; height: number };
}) {
  const { left, top, scaledWidth, scaledHeight } = useScreenPlacement(anchorBounds, camera, viewportSize);
  const cancelPendingRequest = useCanvasStore((s) => s.cancelPendingRequest);
  const recordOutcome = useMetricsStore((s) => s.recordOutcome);

  const handleCancel = useCallback(() => {
    cancelPendingRequest(requestId);
    recordOutcome("cancelled");
    void reportOutcome(requestId, "cancelled");
  }, [requestId, cancelPendingRequest, recordOutcome]);

  return (
    <div className="ai-card-outer" style={{ left, top, width: scaledWidth, height: scaledHeight }}>
      <div
        className="ai-card ai-card--pending"
        style={{ width: anchorBounds.width, height: anchorBounds.height, transform: `scale(${camera.zoom})` }}
      >
        <div className="ai-card__pending-body">
          <Loader2 size={16} className="ai-card__spinner" />
          <span>Analyzing…</span>
          <span className="ai-card__request-id">#{requestId.slice(-6)}</span>
        </div>
        <button type="button" className="ai-card__btn ai-card__btn--ghost" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function AiCard({
  object,
  camera,
  viewportSize,
}: {
  object: AiObject;
  camera: { x: number; y: number; zoom: number };
  viewportSize: { width: number; height: number };
}) {
  const moveAiObject = useCanvasStore((s) => s.moveAiObject);
  const resizeAiObject = useCanvasStore((s) => s.resizeAiObject);
  const acceptDraft = useCanvasStore((s) => s.acceptDraft);
  const discardDraft = useCanvasStore((s) => s.discardDraft);
  const deleteAiObject = useCanvasStore((s) => s.deleteAiObject);
  const recordOutcome = useMetricsStore((s) => s.recordOutcome);

  const [dragBounds, setDragBounds] = useState<WorldRect | null>(null);
  const dragState = useRef<{ mode: "move" | "resize"; startX: number; startY: number; origin: WorldRect } | null>(
    null
  );

  const displayBounds = dragBounds ?? object.bounds;
  const placement = useScreenPlacement(displayBounds, camera, viewportSize);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      dragState.current = { mode: "move", startX: e.clientX, startY: e.clientY, origin: object.bounds };
    },
    [object.bounds]
  );

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      dragState.current = { mode: "resize", startX: e.clientX, startY: e.clientY, origin: object.bounds };
    },
    [object.bounds]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragState.current;
      if (!drag) return;
      const dxScreen = e.clientX - drag.startX;
      const dyScreen = e.clientY - drag.startY;
      const dxWorld = dxScreen / camera.zoom;
      const dyWorld = dyScreen / camera.zoom;

      if (drag.mode === "move") {
        setDragBounds({ ...drag.origin, x: drag.origin.x + dxWorld, y: drag.origin.y + dyWorld });
      } else {
        setDragBounds({
          ...drag.origin,
          width: Math.max(MIN_CARD_WIDTH, drag.origin.width + dxWorld),
          height: Math.max(MIN_CARD_HEIGHT, drag.origin.height + dyWorld),
        });
      }
    },
    [camera.zoom]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragState.current;
      if (!drag) return;
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        // already released — fine to ignore
      }
      dragState.current = null;
      if (dragBounds) {
        if (drag.mode === "move") moveAiObject(object.id, dragBounds);
        else resizeAiObject(object.id, dragBounds);
      }
      setDragBounds(null);
    },
    [dragBounds, moveAiObject, resizeAiObject, object.id]
  );

  const handleAccept = useCallback(() => {
    acceptDraft(object.id);
    recordOutcome("accepted");
    void reportOutcome(object.requestId, "accepted");
  }, [acceptDraft, object.id, object.requestId, recordOutcome]);

  const handleDiscard = useCallback(() => {
    discardDraft(object.id);
    recordOutcome("discarded");
    void reportOutcome(object.requestId, "discarded");
  }, [discardDraft, object.id, object.requestId, recordOutcome]);

  const html = renderDraftContent(object.content, object.contentType);
  const isDraft = object.status === "draft";

  return (
    <div
      className="ai-card-outer"
      style={{ left: placement.left, top: placement.top, width: placement.scaledWidth, height: placement.scaledHeight }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className={`ai-card${isDraft ? " ai-card--draft" : " ai-card--confirmed"}`}
        style={{
          width: displayBounds.width,
          height: displayBounds.height,
          transform: `scale(${camera.zoom})`,
        }}
      >
        <div className="ai-card__header" onPointerDown={onHeaderPointerDown}>
          <span className="ai-card__badge">{isDraft ? "DRAFT" : "AI"}</span>
          <span className="ai-card__title">
            {object.title || (object.contentType === "latex" ? "Result" : "Note")}
          </span>
          {!isDraft && (
            <button
              type="button"
              className="ai-card__icon-btn"
              onClick={() => deleteAiObject(object.id)}
              title="Delete"
              aria-label="Delete"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="ai-card__body" dangerouslySetInnerHTML={{ __html: html }} />
        {isDraft && (
          <div className="ai-card__actions">
            <span className="ai-card__confidence">{Math.round(object.confidence * 100)}% confidence</span>
            <div className="ai-card__actions-buttons">
              <button type="button" className="ai-card__btn ai-card__btn--discard" onClick={handleDiscard}>
                <X size={13} /> Discard
              </button>
              <button type="button" className="ai-card__btn ai-card__btn--accept" onClick={handleAccept}>
                <Check size={13} /> Accept
              </button>
            </div>
          </div>
        )}
        <div className="ai-card__resize-handle" onPointerDown={onResizePointerDown} />
      </div>
    </div>
  );
}
