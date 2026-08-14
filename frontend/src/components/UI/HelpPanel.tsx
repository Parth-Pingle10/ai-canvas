import { X } from "lucide-react";
import "./HelpPanel.css";

interface HelpPanelProps {
  onClose: () => void;
}

const SHORTCUTS: [string, string][] = [
  ["P", "Pen"],
  ["B", "Pencil"],
  ["H", "Highlighter"],
  ["E", "Eraser"],
  ["V", "Select"],
  ["Space + drag", "Temporary pan"],
  ["Middle-mouse drag", "Pan"],
  ["Scroll / pinch", "Zoom (cursor-anchored)"],
  ["Ctrl / Cmd + Z", "Undo"],
  ["Ctrl / Cmd + Shift + Z", "Redo"],
  ["Ctrl / Cmd + Y", "Redo"],
  ["Delete / Backspace", "Delete selection"],
  ["Escape", "Cancel selection"],
  ["Ctrl / Cmd + S", "Save"],
  ["Ctrl / Cmd + O", "Load"],
  ["Ctrl / Cmd + E", "Export PNG"],
  ["Shift + click", "Add/remove from selection"],
  ["Ctrl / Cmd + Enter", "Analyze region now (AI)"],
  ["Ctrl / Cmd + Shift + M", "Toggle AI metrics panel"],
  ["?", "Toggle this panel"],
];

export function HelpPanel({ onClose }: HelpPanelProps) {
  return (
    <div className="help-panel-backdrop" onClick={onClose}>
      <div className="help-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
        <div className="help-panel__header">
          <h2>Keyboard shortcuts</h2>
          <button type="button" className="help-panel__close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <dl className="help-panel__list">
          {SHORTCUTS.map(([key, desc]) => (
            <div className="help-panel__row" key={key}>
              <dt>
                <kbd>{key}</kbd>
              </dt>
              <dd>{desc}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
