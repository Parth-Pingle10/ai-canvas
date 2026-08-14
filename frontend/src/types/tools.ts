import type { ToolId } from "./document";

export interface ToolSettings {
  color: string;
  width: number;
  opacity: number;
}

export const DEFAULT_TOOL_SETTINGS: Record<ToolId, ToolSettings> = {
  select: { color: "#1e1e1e", width: 4, opacity: 1 },
  pen: { color: "#1e1e1e", width: 4, opacity: 1 },
  pencil: { color: "#3a3a3a", width: 3, opacity: 0.85 },
  highlighter: { color: "#ffd43b", width: 20, opacity: 0.35 },
  eraser: { color: "#ffffff", width: 20, opacity: 1 },
  hand: { color: "#1e1e1e", width: 4, opacity: 1 },
  rectangle: { color: "#1e1e1e", width: 3, opacity: 1 },
  circle: { color: "#1e1e1e", width: 3, opacity: 1 },
  triangle: { color: "#1e1e1e", width: 3, opacity: 1 },
  diamond: { color: "#1e1e1e", width: 3, opacity: 1 },
  arrow: { color: "#1e1e1e", width: 3, opacity: 1 },
  line: { color: "#1e1e1e", width: 3, opacity: 1 },
  text: { color: "#1e1e1e", width: 16, opacity: 1 },
  connector: { color: "#1e1e1e", width: 2.5, opacity: 1 },
};

export const COLOR_PRESETS = [
  "#1e1e1e", // black
  "#ffffff", // white
  "#e03131", // red
  "#f76707", // orange
  "#f5c211", // yellow
  "#2f9e44", // green
  "#1971c2", // blue
  "#9c36b5", // purple
  "#e64980", // pink
];

export const BRUSH_SIZE_PRESETS = [1, 2, 4, 8, 12, 20, 32, 48];

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;
