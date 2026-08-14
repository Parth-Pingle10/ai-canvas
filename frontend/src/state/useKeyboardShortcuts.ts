import { useEffect } from "react";
import { useCanvasStore } from "./canvasStore";
import type { ToolId } from "../types/document";

const TOOL_KEYS: Record<string, ToolId> = {
  v: "select",
  p: "pen",
  b: "pencil",
  h: "highlighter",
  e: "eraser",
  r: "rectangle",
  o: "circle",
  t: "triangle",
  d: "diamond",
  a: "arrow",
  x: "text",
};

export interface KeyboardShortcutHandlers {
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onToggleHelp: () => void;
  onManualAnalyze: () => void;
  onToggleMetrics: () => void;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  const setTool = useCanvasStore((s) => s.setTool);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const deleteSelection = useCanvasStore((s) => s.deleteSelection);
  const clearSelection = useCanvasStore((s) => s.clearSelection);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === "enter") {
        e.preventDefault();
        handlers.onManualAnalyze();
        return;
      }
      if (mod && e.shiftKey && key === "m") {
        e.preventDefault();
        handlers.onToggleMetrics();
        return;
      }
      if (mod && key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && key === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && key === "s") {
        e.preventDefault();
        handlers.onSave();
        return;
      }
      if (mod && key === "o") {
        e.preventDefault();
        handlers.onLoad();
        return;
      }
      if (mod && key === "e") {
        e.preventDefault();
        handlers.onExport();
        return;
      }
      if (key === "?" || (e.shiftKey && key === "/")) {
        e.preventDefault();
        handlers.onToggleHelp();
        return;
      }
      if (key === "delete" || key === "backspace") {
        e.preventDefault();
        deleteSelection();
        return;
      }
      if (key === "escape") {
        clearSelection();
        return;
      }
      if (TOOL_KEYS[key]) {
        setTool(TOOL_KEYS[key]);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setTool, undo, redo, deleteSelection, clearSelection, handlers]);
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}
