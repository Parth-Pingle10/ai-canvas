import { Palette, Sliders, X } from "lucide-react";
import { useCanvasStore } from "../../state/canvasStore";
import type { ToolId } from "../../types/document";
import { ColorPicker } from "../ColorPicker/ColorPicker";
import { BrushControls } from "../BrushControls/BrushControls";
import "./ShapePalette.css";

export const STYLED_TOOL_IDS: ToolId[] = [
  "pen",
  "pencil",
  "highlighter",
  "eraser",
  "rectangle",
  "circle",
  "triangle",
  "diamond",
  "arrow",
  "line",
  "connector",
  "text",
  "laser",
];

const TOOL_TITLES: Record<string, string> = {
  pen: "Pen Style",
  pencil: "Pencil Style",
  highlighter: "Highlighter Style",
  eraser: "Eraser Size",
  rectangle: "Rectangle Style",
  circle: "Circle Style",
  triangle: "Triangle Style",
  diamond: "Diamond Style",
  arrow: "Arrow Style",
  line: "Line Style",
  connector: "Connector Style",
  text: "Text Style",
  laser: "Laser Pointer Style",
};

interface ShapePaletteProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function ShapePalette({ isOpen = false, onClose }: ShapePaletteProps) {
  const tool = useCanvasStore((s) => s.tool);
  const toolSettings = useCanvasStore((s) => s.toolSettings);
  const setToolSetting = useCanvasStore((s) => s.setToolSetting);

  const isStyledTool = STYLED_TOOL_IDS.includes(tool);
  const showProperties = isStyledTool || isOpen;
  const showColor = tool !== "eraser" && tool !== "select" && tool !== "hand";
  const activeSettings = toolSettings[tool] || toolSettings.pen;

  // Render on the left-hand middle side when a drawing tool, shape tool, or text is active
  if (!showProperties) return null;

  const title = TOOL_TITLES[tool] || "Color & Size";

  return (
    <div
      className="shape-palette"
      role="region"
      aria-label="Color and Size Controls"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="shape-palette__header">
        <div className="shape-palette__title-group">
          <Palette size={14} className="shape-palette__icon" />
          <span className="shape-palette__title">{title}</span>
        </div>
        {onClose && (
          <button
            type="button"
            className="shape-palette__close-btn"
            onClick={onClose}
            title="Close panel"
            aria-label="Close color and size panel"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div className="shape-palette__properties">
        {showColor && (
          <div className="shape-palette__property-group">
            <div className="shape-palette__property-label">
              <Palette size={12} />
              <span>Color</span>
            </div>
            <ColorPicker
              color={activeSettings.color}
              onChange={(color) => setToolSetting(tool, { color })}
            />
          </div>
        )}

        <div className="shape-palette__property-group">
          <div className="shape-palette__property-label">
            <Sliders size={12} />
            <span>
              {tool === "eraser"
                ? "Eraser Size"
                : tool === "text"
                ? "Font Size"
                : "Stroke / Brush Size"}
            </span>
          </div>
          <BrushControls
            size={activeSettings.width}
            color={showColor ? activeSettings.color : "#9e9e9e"}
            onChange={(width) => setToolSetting(tool, { width })}
          />
        </div>
      </div>
    </div>
  );
}
