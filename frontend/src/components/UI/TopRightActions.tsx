import { Download, FolderOpen, Keyboard, Save } from "lucide-react";
import "./TopRightActions.css";

interface TopRightActionsProps {
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onClear: () => void;
  onToggleHelp: () => void;
}

export function TopRightActions({
  onSave,
  onLoad,
  onExport,
  onClear,
  onToggleHelp,
}: TopRightActionsProps) {
  return (
    <div className="top-right-actions" role="toolbar" aria-label="Document and workspace actions">
      <button
        type="button"
        className="top-right-actions__button"
        onClick={onSave}
        title="Save JSON (Ctrl+S)"
        aria-label="Save JSON"
      >
        <Save size={16} />
      </button>

      <button
        type="button"
        className="top-right-actions__button"
        onClick={onLoad}
        title="Load JSON (Ctrl+O)"
        aria-label="Load JSON"
      >
        <FolderOpen size={16} />
      </button>

      <button
        type="button"
        className="top-right-actions__button"
        onClick={onExport}
        title="Download as Image (Ctrl+E)"
        aria-label="Download as Image"
      >
        <Download size={16} />
      </button>

      <div className="top-right-actions__divider" />

      <button
        type="button"
        className="top-right-actions__button top-right-actions__button--danger"
        onClick={onClear}
        title="Clear canvas"
        aria-label="Clear canvas"
      >
        Clear
      </button>

      <button
        type="button"
        className="top-right-actions__button"
        onClick={onToggleHelp}
        title="Keyboard shortcuts (?)"
        aria-label="Keyboard shortcuts"
      >
        <Keyboard size={16} />
      </button>
    </div>
  );
}
