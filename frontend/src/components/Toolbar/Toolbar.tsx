import {
  ArrowUpRight,
  Circle,
  Diamond,
  Download,
  Eraser,
  FolderOpen,
  Hand,
  Highlighter,
  Keyboard,
  MousePointer2,
  Pencil,
  PenLine,
  Redo2,
  Save,
  Sparkles,
  Square,
  Trash2,
  Triangle,
  Type,
  Undo2,
} from "lucide-react";
import { useCanvasStore } from "../../state/canvasStore";
import type { ToolId } from "../../types/document";
import { ColorPicker } from "../ColorPicker/ColorPicker";
import { BrushControls } from "../BrushControls/BrushControls";
import "./Toolbar.css";

const DRAW_TOOLS: { id: ToolId; label: string; icon: typeof PenLine; shortcut: string }[] = [
  { id: "select", label: "Select", icon: MousePointer2, shortcut: "V" },
  { id: "pen", label: "Pen", icon: PenLine, shortcut: "P" },
  { id: "pencil", label: "Pencil", icon: Pencil, shortcut: "B" },
  { id: "highlighter", label: "Highlighter", icon: Highlighter, shortcut: "H" },
  { id: "eraser", label: "Eraser", icon: Eraser, shortcut: "E" },
  { id: "hand", label: "Hand", icon: Hand, shortcut: "Space" },
];

const SHAPE_TOOLS: { id: ToolId; label: string; icon: typeof PenLine; shortcut: string }[] = [
  { id: "rectangle", label: "Rectangle", icon: Square, shortcut: "R" },
  { id: "circle", label: "Circle", icon: Circle, shortcut: "O" },
  { id: "triangle", label: "Triangle", icon: Triangle, shortcut: "T" },
  { id: "diamond", label: "Diamond", icon: Diamond, shortcut: "D" },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight, shortcut: "A" },
  { id: "text", label: "Text", icon: Type, shortcut: "X" },
];

interface ToolbarProps {
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onClear: () => void;
  onToggleHelp: () => void;
  onManualAnalyze: () => void;
}

export function Toolbar({
  onSave,
  onLoad,
  onExport,
  onClear,
  onToggleHelp,
  onManualAnalyze,
}: ToolbarProps) {
  const tool = useCanvasStore((s) => s.tool);
  const setTool = useCanvasStore((s) => s.setTool);
  const toolSettings = useCanvasStore((s) => s.toolSettings);
  const setToolSetting = useCanvasStore((s) => s.setToolSetting);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const history = useCanvasStore((s) => s.history);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const deleteSelection = useCanvasStore((s) => s.deleteSelection);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const showColorAndSize = tool !== "select" && tool !== "hand" && tool !== "eraser";
  const showEraserSize = tool === "eraser";
  const activeSettings = toolSettings[tool];
  const isShapeTool = SHAPE_TOOLS.some((t) => t.id === tool);

  return (
    <div className="toolbar" role="toolbar" aria-label="Canvas tools">
      <div className="toolbar__group">
        {DRAW_TOOLS.map(({ id, label, icon: Icon, shortcut }) => (
          <button
            key={id}
            type="button"
            className={`toolbar__button${tool === id ? " toolbar__button--active" : ""}`}
            onClick={() => setTool(id)}
            title={`${label} (${shortcut})`}
            aria-pressed={tool === id}
            aria-label={label}
          >
            <Icon size={18} strokeWidth={2} />
          </button>
        ))}
      </div>

      <div className="toolbar__divider" />

      <div className="toolbar__group">
        {SHAPE_TOOLS.map(({ id, label, icon: Icon, shortcut }) => (
          <button
            key={id}
            type="button"
            className={`toolbar__button${tool === id ? " toolbar__button--active" : ""}${isShapeTool && tool === id ? " toolbar__button--shape-active" : ""}`}
            onClick={() => setTool(id)}
            title={`${label} (${shortcut})`}
            aria-pressed={tool === id}
            aria-label={label}
          >
            <Icon size={18} strokeWidth={2} />
          </button>
        ))}
      </div>

      <div className="toolbar__divider" />

      {showColorAndSize && (
        <div className="toolbar__group toolbar__group--wide">
          <ColorPicker
            color={activeSettings.color}
            onChange={(color) => setToolSetting(tool, { color })}
          />
          <BrushControls
            size={activeSettings.width}
            color={activeSettings.color}
            onChange={(width) => setToolSetting(tool, { width })}
          />
        </div>
      )}

      {showEraserSize && (
        <div className="toolbar__group toolbar__group--wide">
          <BrushControls
            size={activeSettings.width}
            color="#c9c9c9"
            onChange={(width) => setToolSetting(tool, { width })}
          />
        </div>
      )}

      {tool === "select" && (
        <div className="toolbar__group toolbar__hint">
          {selectedIds.length > 0
            ? `${selectedIds.length} selected`
            : "Click an object, or drag to marquee-select"}
        </div>
      )}

      <div className="toolbar__spacer" />

      <div className="toolbar__group">
        <button
          type="button"
          className="toolbar__button"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          className="toolbar__button"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
        >
          <Redo2 size={18} />
        </button>
        <button
          type="button"
          className="toolbar__button"
          onClick={deleteSelection}
          disabled={selectedIds.length === 0}
          title="Delete selection (Delete)"
          aria-label="Delete selection"
        >
          <Trash2 size={18} />
        </button>
      </div>

      <div className="toolbar__divider" />

      <div className="toolbar__group">
        <button
          type="button"
          className="toolbar__button toolbar__button--ai"
          onClick={onManualAnalyze}
          title="Analyze region now (Ctrl+Enter)"
          aria-label="Analyze region now"
        >
          <Sparkles size={18} />
        </button>
      </div>

      <div className="toolbar__divider" />

      <div className="toolbar__group">
        <button type="button" className="toolbar__button" onClick={onSave} title="Save (Ctrl+S)" aria-label="Save">
          <Save size={18} />
        </button>
        <button type="button" className="toolbar__button" onClick={onLoad} title="Load (Ctrl+O)" aria-label="Load">
          <FolderOpen size={18} />
        </button>
        <button
          type="button"
          className="toolbar__button"
          onClick={onExport}
          title="Export PNG (Ctrl+E)"
          aria-label="Export PNG"
        >
          <Download size={18} />
        </button>
        <button
          type="button"
          className="toolbar__button toolbar__button--danger"
          onClick={onClear}
          title="Clear canvas"
          aria-label="Clear canvas"
        >
          Clear
        </button>
        <button
          type="button"
          className="toolbar__button"
          onClick={onToggleHelp}
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
        >
          <Keyboard size={18} />
        </button>
      </div>
    </div>
  );
}
