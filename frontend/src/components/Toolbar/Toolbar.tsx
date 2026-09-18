import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Circle,
  Diamond,
  Eraser,
  Flame,
  Grid,
  Hand,
  Highlighter,
  Minus,
  MoreVertical,
  MousePointer2,
  Pencil,
  PenLine,
  Shapes,
  Sparkles,
  Square,
  Triangle,
  Type,
  Wand2,
} from "lucide-react";
import { useCanvasStore } from "../../state/canvasStore";
import type { ToolId } from "../../types/document";
import "./Toolbar.css";

const DRAW_TOOLS: { id: ToolId; label: string; icon: typeof PenLine; shortcut: string }[] = [
  { id: "select", label: "Select", icon: MousePointer2, shortcut: "V" },
  { id: "pen", label: "Pen", icon: PenLine, shortcut: "P" },
  { id: "pencil", label: "Pencil", icon: Pencil, shortcut: "B" },
  { id: "highlighter", label: "Highlighter", icon: Highlighter, shortcut: "H" },
  { id: "eraser", label: "Eraser", icon: Eraser, shortcut: "E" },
  { id: "hand", label: "Hand", icon: Hand, shortcut: "Space" },
];

export const SHAPE_OPTIONS: { id: ToolId; label: string; icon: typeof Square; shortcut: string }[] = [
  { id: "rectangle", label: "Rectangle", icon: Square, shortcut: "R" },
  { id: "circle", label: "Circle", icon: Circle, shortcut: "O" },
  { id: "triangle", label: "Triangle", icon: Triangle, shortcut: "T" },
  { id: "diamond", label: "Diamond", icon: Diamond, shortcut: "D" },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight, shortcut: "A" },
  { id: "line", label: "Line", icon: Minus, shortcut: "L" },
];

export const SHAPE_TOOL_IDS: ToolId[] = ["rectangle", "circle", "triangle", "diamond", "arrow", "line"];

interface ToolbarProps {
  onManualAnalyze: () => void;
  isShapePaletteOpen?: boolean;
  onToggleShapePalette?: () => void;
}

export function Toolbar({
  onManualAnalyze,
}: ToolbarProps) {
  const tool = useCanvasStore((s) => s.tool);
  const setTool = useCanvasStore((s) => s.setTool);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const pendingRequests = useCanvasStore((s) => s.pendingRequests);
  const showGrid = useCanvasStore((s) => s.showGrid);
  const toggleGrid = useCanvasStore((s) => s.toggleGrid);
  const drawToShapeEnabled = useCanvasStore((s) => s.drawToShapeEnabled);
  const toggleDrawToShape = useCanvasStore((s) => s.toggleDrawToShape);

  const [shapesDropdownOpen, setShapesDropdownOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const isAnalyzing = pendingRequests.length > 0;
  const activeShape = SHAPE_OPTIONS.find((s) => s.id === tool);
  const isShapeActive = Boolean(activeShape);

  // Close dropdowns on outside click or Escape
  useEffect(() => {
    if (!shapesDropdownOpen && !moreMenuOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setShapesDropdownOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setMoreMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShapesDropdownOpen(false);
        setMoreMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [shapesDropdownOpen, moreMenuOpen]);

  // Active shape icon for the top bar
  const ShapeIcon = activeShape ? activeShape.icon : Shapes;

  return (
    <div className="toolbar" role="toolbar" aria-label="Canvas workspace tools">
      {/* 1. LEFT SECTION: Drawing Tools */}
      <div className="toolbar__section toolbar__section--tools">
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
              <Icon size={17} strokeWidth={2} />
            </button>
          ))}
        </div>

        <div className="toolbar__divider" />

        {/* 2. SHAPES IN TOP BAR (Dropdown menu anchored to the button) */}
        <div className="toolbar__group toolbar__shapes-wrapper" ref={dropdownRef}>
          <button
            type="button"
            className={`toolbar__button toolbar__button--shapes${
              isShapeActive ? " toolbar__button--active toolbar__button--shape-active" : ""
            }${shapesDropdownOpen ? " toolbar__button--dropdown-open" : ""}`}
            onClick={() => {
              setShapesDropdownOpen((prev) => !prev);
              setMoreMenuOpen(false);
            }}
            title={activeShape ? `Shape: ${activeShape.label}` : "Shapes"}
            aria-pressed={isShapeActive || shapesDropdownOpen}
            aria-expanded={shapesDropdownOpen}
            aria-label="Shapes"
          >
            <ShapeIcon size={17} strokeWidth={2} />
            <ChevronDown size={11} className={`toolbar__chevron${shapesDropdownOpen ? " toolbar__chevron--open" : ""}`} />
          </button>

          {shapesDropdownOpen && (
            <div className="toolbar__shapes-dropdown" role="menu" aria-label="Shapes Menu">
              <div className="toolbar__shapes-grid">
                {SHAPE_OPTIONS.map(({ id, label, icon: Icon, shortcut }) => {
                  const isSelected = tool === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="menuitem"
                      className={`toolbar__shape-option${isSelected ? " toolbar__shape-option--active" : ""}`}
                      onClick={() => {
                        setTool(id);
                        setShapesDropdownOpen(false);
                      }}
                      title={`${label} (${shortcut})`}
                      aria-label={label}
                      aria-pressed={isSelected}
                    >
                      <Icon size={16} strokeWidth={2} />
                      <span className="toolbar__shape-option-label">{label}</span>
                      <kbd className="toolbar__shape-option-shortcut">{shortcut}</kbd>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            className={`toolbar__button${tool === "text" ? " toolbar__button--active" : ""}`}
            onClick={() => setTool("text")}
            title="Text (X)"
            aria-pressed={tool === "text"}
            aria-label="Text"
          >
            <Type size={17} strokeWidth={2} />
          </button>
        </div>

        {tool === "select" && selectedIds.length > 0 && (
          <div className="toolbar__group toolbar__hint">
            {`${selectedIds.length} selected`}
          </div>
        )}
      </div>

      <div className="toolbar__divider" />

      {/* 3. AI Action Control */}
      <div className="toolbar__section toolbar__section--ai">
        <button
          type="button"
          className={`toolbar__button toolbar__button--ai-prominent${isAnalyzing ? " toolbar__button--ai-loading" : ""}`}
          onClick={onManualAnalyze}
          disabled={isAnalyzing}
          title="Analyze region now (Ctrl+Enter)"
          aria-label="Analyze region now (Ctrl+Enter)"
        >
          <Sparkles size={16} className="toolbar__ai-sparkle" />
          <span className="toolbar__ai-text">AI Analyze</span>
        </button>
      </div>

      <div className="toolbar__divider" />

      {/* 4. SEPARATE 3-DOTS MENU (Draw to shape, Laser pointer, Toggle grid) */}
      <div className="toolbar__section toolbar__section--more" ref={moreMenuRef}>
        <button
          type="button"
          className={`toolbar__button toolbar__button--more${
            moreMenuOpen || tool === "laser" ? " toolbar__button--active" : ""
          }`}
          onClick={() => {
            setMoreMenuOpen((prev) => !prev);
            setShapesDropdownOpen(false);
          }}
          title="More tools and canvas options"
          aria-label="More options"
          aria-expanded={moreMenuOpen}
        >
          <MoreVertical size={16} strokeWidth={2} />
        </button>

        {moreMenuOpen && (
          <div className="toolbar__more-menu" role="menu" aria-label="More Options Menu">
            {/* Draw to shape */}
            <button
              type="button"
              role="menuitem"
              className={`toolbar__more-item${drawToShapeEnabled ? " toolbar__more-item--active" : ""}`}
              onClick={() => {
                toggleDrawToShape();
              }}
              title="Draw to Shape (Auto-recognize drawn shapes)"
              aria-label="Draw to shape"
            >
              <Wand2 size={16} className="toolbar__more-item-icon" />
              <div className="toolbar__more-item-text">
                <span className="toolbar__more-item-title">Draw to Shape</span>
                <span className="toolbar__more-item-desc">Auto-convert strokes to shapes</span>
              </div>
              {drawToShapeEnabled && <Check size={14} className="toolbar__more-item-check" />}
            </button>

            {/* Laser pointer */}
            <button
              type="button"
              role="menuitem"
              className={`toolbar__more-item${tool === "laser" ? " toolbar__more-item--active" : ""}`}
              onClick={() => {
                setTool("laser");
                setMoreMenuOpen(false);
              }}
              title="Laser Pointer (line disappears in 3 seconds)"
              aria-label="Laser pointer"
            >
              <Flame size={16} className="toolbar__more-item-icon toolbar__more-item-icon--laser" />
              <div className="toolbar__more-item-text">
                <span className="toolbar__more-item-title">Laser Pointer</span>
                <span className="toolbar__more-item-desc">Fades out after 3 seconds</span>
              </div>
              {tool === "laser" && <Check size={14} className="toolbar__more-item-check" />}
            </button>

            <div className="toolbar__more-divider" />

            {/* Toggle grid */}
            <button
              type="button"
              role="menuitem"
              className={`toolbar__more-item${showGrid ? " toolbar__more-item--active" : ""}`}
              onClick={() => {
                toggleGrid();
              }}
              title="Toggle canvas grid (Default: Off)"
              aria-label="Toggle grid"
            >
              <Grid size={16} className="toolbar__more-item-icon" />
              <div className="toolbar__more-item-text">
                <span className="toolbar__more-item-title">Canvas Grid</span>
                <span className="toolbar__more-item-desc">{showGrid ? "Visible" : "Hidden (Default)"}</span>
              </div>
              <span className={`toolbar__more-badge${showGrid ? " toolbar__more-badge--on" : ""}`}>
                {showGrid ? "ON" : "OFF"}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
