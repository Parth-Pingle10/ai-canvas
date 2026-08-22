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

import { Sparkles } from "lucide-react";

export function AiObjectLayer() {
  const camera = useCanvasStore((s) => s.camera);
  const viewportSize = useCanvasStore((s) => s.viewportSize);
  const aiObjects = useCanvasStore((s) => s.aiObjects);
  const shapes = useCanvasStore((s) => s.shapes);
  const connectors = useCanvasStore((s) => s.connectors);
  const textObjects = useCanvasStore((s) => s.textObjects);
  const pendingRequests = useCanvasStore((s) => s.pendingRequests);

  // Group active draft shapes, connectors, & native text by draftGroupId
  const draftGroups = new Map<string, { bounds: WorldRect; title: string }>();
  for (const s of shapes) {
    if (s.status === "draft" && s.draftGroupId) {
      const g = draftGroups.get(s.draftGroupId);
      const sb = s.bounds;
      if (!g) {
        draftGroups.set(s.draftGroupId, {
          bounds: { x: sb.minX, y: sb.minY, width: sb.maxX - sb.minX, height: sb.maxY - sb.minY },
          title: s.text ? `Shape: ${s.shapeType}` : `AI ${s.shapeType}`,
        });
      } else {
        const minX = Math.min(g.bounds.x, sb.minX);
        const minY = Math.min(g.bounds.y, sb.minY);
        const maxX = Math.max(g.bounds.x + g.bounds.width, sb.maxX);
        const maxY = Math.max(g.bounds.y + g.bounds.height, sb.maxY);
        draftGroups.set(s.draftGroupId, {
          bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
          title: "AI Diagram",
        });
      }
    }
  }

  for (const t of textObjects) {
    if (t.status === "draft" && t.draftGroupId) {
      const g = draftGroups.get(t.draftGroupId);
      const tb = t.bounds;
      if (!g) {
        draftGroups.set(t.draftGroupId, {
          bounds: { x: tb.minX, y: tb.minY, width: tb.maxX - tb.minX, height: tb.maxY - tb.minY },
          title: "AI Answer",
        });
      } else {
        const minX = Math.min(g.bounds.x, tb.minX);
        const minY = Math.min(g.bounds.y, tb.minY);
        const maxX = Math.max(g.bounds.x + g.bounds.width, tb.maxX);
        const maxY = Math.max(g.bounds.y + g.bounds.height, tb.maxY);
        draftGroups.set(t.draftGroupId, {
          bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
          title: "AI Answer",
        });
      }
    }
  }

  return (
    <div className="ai-layer">
      {aiObjects.map((obj) => (
        <AiCard key={obj.id} object={obj} camera={camera} viewportSize={viewportSize} />
      ))}
      {Array.from(draftGroups.entries()).map(([groupId, info]) => (
        <DraftGroupActionBar
          key={groupId}
          draftGroupId={groupId}
          bounds={info.bounds}
          title={info.title}
          camera={camera}
          viewportSize={viewportSize}
        />
      ))}
    </div>
  );
}

function DraftGroupActionBar({
  draftGroupId,
  bounds,
  title,
  camera,
  viewportSize,
}: {
  draftGroupId: string;
  bounds: WorldRect;
  title: string;
  camera: { x: number; y: number; zoom: number };
  viewportSize: { width: number; height: number };
}) {
  const acceptDraftGroup = useCanvasStore((s) => s.acceptDraftGroup);
  const discardDraftGroup = useCanvasStore((s) => s.discardDraftGroup);
  const recordOutcome = useMetricsStore((s) => s.recordOutcome);

  // Position bar centered right above the draft group bounds
  const screen = worldToScreen({ x: bounds.x + bounds.width / 2, y: bounds.y }, camera, viewportSize.width, viewportSize.height);

  const handleAccept = useCallback(() => {
    acceptDraftGroup(draftGroupId);
    recordOutcome("accepted");
  }, [acceptDraftGroup, draftGroupId, recordOutcome]);

  const handleDiscard = useCallback(() => {
    discardDraftGroup(draftGroupId);
    recordOutcome("discarded");
  }, [discardDraftGroup, draftGroupId, recordOutcome]);

  return (
    <div
      className="draft-action-bar-container"
      style={{ left: screen.x, top: screen.y - 14 }}
    >
      <div className="draft-action-bar">
        <Sparkles size={14} className="draft-action-bar__icon" />
        <span className="draft-action-bar__title">{title} (Draft)</span>
        <button
          type="button"
          className="draft-action-bar__btn draft-action-bar__btn--accept"
          onClick={handleAccept}
          title="Accept into canvas"
        >
          <Check size={13} /> Accept
        </button>
        <button
          type="button"
          className="draft-action-bar__btn draft-action-bar__btn--discard"
          onClick={handleDiscard}
          title="Discard draft"
        >
          <X size={13} /> Discard
        </button>
      </div>
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
