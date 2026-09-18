import { Redo2, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useCanvasStore } from "../../state/canvasStore";
import "./BottomControls.css";

export function BottomControls() {
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const history = useCanvasStore((s) => s.history);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const deleteSelection = useCanvasStore((s) => s.deleteSelection);
  const camera = useCanvasStore((s) => s.camera);
  const setCamera = useCanvasStore((s) => s.setCamera);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const hasSelection = selectedIds.length > 0;
  const zoomPercent = Math.round(camera.zoom * 100);

  const handleResetZoom = () => {
    setCamera({ ...camera, zoom: 1 });
  };

  const handleZoomIn = () => {
    setCamera({ ...camera, zoom: Math.min(5, camera.zoom * 1.2) });
  };

  const handleZoomOut = () => {
    setCamera({ ...camera, zoom: Math.max(0.1, camera.zoom / 1.2) });
  };

  return (
    <div className="bottom-controls" role="region" aria-label="Canvas history and zoom controls">
      <div className="bottom-controls__group">
        <button
          type="button"
          className="bottom-controls__button"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo2 size={16} />
        </button>

        <button
          type="button"
          className="bottom-controls__button"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
        >
          <Redo2 size={16} />
        </button>

        <button
          type="button"
          className="bottom-controls__button"
          onClick={deleteSelection}
          disabled={!hasSelection}
          title="Delete selection (Delete)"
          aria-label="Delete selection"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="bottom-controls__divider" />

      <div className="bottom-controls__group bottom-controls__zoom-group">
        <button
          type="button"
          className="bottom-controls__button bottom-controls__button--icon"
          onClick={handleZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut size={14} />
        </button>

        <button
          type="button"
          className="bottom-controls__zoom-badge"
          onClick={handleResetZoom}
          title="Reset zoom to 100%"
          aria-label={`Current zoom ${zoomPercent}%. Click to reset to 100%`}
        >
          {zoomPercent}%
        </button>

        <button
          type="button"
          className="bottom-controls__button bottom-controls__button--icon"
          onClick={handleZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn size={14} />
        </button>
      </div>
    </div>
  );
}
