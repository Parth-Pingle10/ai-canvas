import { create } from "zustand";
import type { Camera, CanvasDocument, Stroke, ToolId } from "../types/document";
import { createEmptyDocument } from "../types/document";
import type { AiObject, PendingAiRequest, WorldRect } from "../types/ai";
import { DEFAULT_TOOL_SETTINGS, type ToolSettings } from "../types/tools";
import { createDefaultCamera } from "../canvas/Camera";

const MAX_HISTORY = 100;

/** A history snapshot captures both structured layers of the document —
 * ink strokes and AI objects — so accepting/discarding a draft is undoable
 * in exactly the same way drawing a stroke is (see canvasStore's history
 * docs in docs/CANVAS_ARCHITECTURE.md §4, extended for AI objects in
 * docs/AI_INTEGRATION.md). */
interface HistorySnapshot {
  strokes: Stroke[];
  aiObjects: AiObject[];
}

interface HistoryState {
  past: HistorySnapshot[];
  future: HistorySnapshot[];
}

export type ErrorKind =
  | "load-failed"
  | "export-failed"
  | "save-failed"
  | "autosave-failed"
  | "generic";

export interface AppNotice {
  id: string;
  kind: ErrorKind;
  message: string;
}

interface CanvasState {
  canvasName: string;
  strokes: Stroke[];
  camera: Camera;
  tool: ToolId;
  toolSettings: Record<ToolId, ToolSettings>;
  selectedIds: string[];
  history: HistoryState;
  notices: AppNotice[];

  // AI objects (draft + confirmed) and in-flight request placeholders.
  // Pending requests are deliberately NOT part of undo history — they're
  // ephemeral UI state, not document content.
  aiObjects: AiObject[];
  pendingRequests: PendingAiRequest[];

  /** Reported by CanvasView's ResizeObserver — used by the AI trigger's
   *  viewport-fallback ROI strategy, which needs to know the visible
   *  world-space area without CanvasView and the trigger hook coupling
   *  directly to each other. */
  viewportSize: { width: number; height: number };
  setViewportSize: (size: { width: number; height: number }) => void;

  // Tool
  setTool: (tool: ToolId) => void;
  setToolSetting: (tool: ToolId, patch: Partial<ToolSettings>) => void;

  // Camera
  setCamera: (camera: Camera) => void;

  // Selection
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;

  // Document mutation (all undoable, structured)
  commitStrokes: (next: Stroke[]) => void;
  addStroke: (stroke: Stroke) => void;
  deleteSelection: () => void;
  clearCanvas: () => void;

  // AI object mutation (all undoable, structured — see commitAiObjects)
  commitAiObjects: (next: AiObject[]) => void;
  addDraft: (draft: AiObject) => void;
  acceptDraft: (id: string) => void;
  discardDraft: (id: string) => void;
  deleteAiObject: (id: string) => void;
  moveAiObject: (id: string, bounds: WorldRect) => void;
  resizeAiObject: (id: string, bounds: WorldRect) => void;

  // Pending AI requests (not undoable — ephemeral loading state)
  addPendingRequest: (req: PendingAiRequest) => void;
  removePendingRequest: (id: string) => void;
  cancelPendingRequest: (id: string) => void;
  cancelAllPendingRequests: () => void;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Whole-document load/replace (resets history)
  loadDocument: (doc: CanvasDocument) => void;
  toDocument: () => CanvasDocument;

  // Notices
  pushNotice: (kind: ErrorKind, message: string) => void;
  dismissNotice: (id: string) => void;
}

let noticeCounter = 0;

export const useCanvasStore = create<CanvasState>((set, get) => ({
  canvasName: "Untitled",
  strokes: [],
  camera: createDefaultCamera(),
  tool: "pen",
  toolSettings: structuredCloneSettings(),
  selectedIds: [],
  history: { past: [], future: [] },
  notices: [],
  aiObjects: [],
  pendingRequests: [],
  viewportSize: { width: 0, height: 0 },
  setViewportSize: (size) => set({ viewportSize: size }),

  setTool: (tool) => set({ tool, selectedIds: tool === "select" ? get().selectedIds : [] }),

  setToolSetting: (tool, patch) =>
    set((state) => ({
      toolSettings: {
        ...state.toolSettings,
        [tool]: { ...state.toolSettings[tool], ...patch },
      },
    })),

  setCamera: (camera) => set({ camera }),

  setSelection: (ids) => set({ selectedIds: ids }),
  clearSelection: () => set({ selectedIds: [] }),

  commitStrokes: (next) =>
    set((state) => {
      const past = [...state.history.past, { strokes: state.strokes, aiObjects: state.aiObjects }].slice(
        -MAX_HISTORY
      );
      return {
        strokes: next,
        history: { past, future: [] },
      };
    }),

  addStroke: (stroke) => {
    const { strokes, commitStrokes } = get();
    commitStrokes([...strokes, stroke]);
  },

  deleteSelection: () => {
    const { strokes, selectedIds, commitStrokes } = get();
    if (selectedIds.length === 0) return;
    const idSet = new Set(selectedIds);
    commitStrokes(strokes.filter((s) => !idSet.has(s.id)));
    set({ selectedIds: [] });
  },

  clearCanvas: () => {
    const { commitStrokes } = get();
    commitStrokes([]);
    set({ selectedIds: [] });
  },

  commitAiObjects: (next) =>
    set((state) => {
      const past = [...state.history.past, { strokes: state.strokes, aiObjects: state.aiObjects }].slice(
        -MAX_HISTORY
      );
      return {
        aiObjects: next,
        history: { past, future: [] },
      };
    }),

  addDraft: (draft) => {
    const { aiObjects, commitAiObjects } = get();
    commitAiObjects([...aiObjects, draft]);
  },

  acceptDraft: (id) => {
    const { aiObjects, commitAiObjects } = get();
    commitAiObjects(
      aiObjects.map((o) => (o.id === id ? { ...o, status: "confirmed" as const, version: o.version + 1 } : o))
    );
  },

  discardDraft: (id) => {
    const { aiObjects, commitAiObjects } = get();
    commitAiObjects(aiObjects.filter((o) => o.id !== id));
  },

  deleteAiObject: (id) => {
    const { aiObjects, commitAiObjects } = get();
    commitAiObjects(aiObjects.filter((o) => o.id !== id));
  },

  moveAiObject: (id, bounds) => {
    const { aiObjects, commitAiObjects } = get();
    commitAiObjects(
      aiObjects.map((o) => (o.id === id ? { ...o, bounds, version: o.version + 1 } : o))
    );
  },

  resizeAiObject: (id, bounds) => {
    const { aiObjects, commitAiObjects } = get();
    commitAiObjects(
      aiObjects.map((o) => (o.id === id ? { ...o, bounds, version: o.version + 1 } : o))
    );
  },

  addPendingRequest: (req) =>
    set((state) => ({ pendingRequests: [...state.pendingRequests, req] })),

  removePendingRequest: (id) =>
    set((state) => ({ pendingRequests: state.pendingRequests.filter((r) => r.id !== id) })),

  cancelPendingRequest: (id) => {
    const req = get().pendingRequests.find((r) => r.id === id);
    req?.controller.abort();
    set((state) => ({ pendingRequests: state.pendingRequests.filter((r) => r.id !== id) }));
  },

  cancelAllPendingRequests: () => {
    get().pendingRequests.forEach((r) => r.controller.abort());
    set({ pendingRequests: [] });
  },

  undo: () =>
    set((state) => {
      const { past, future } = state.history;
      if (past.length === 0) return state;
      const previous = past[past.length - 1];
      return {
        strokes: previous.strokes,
        aiObjects: previous.aiObjects,
        history: {
          past: past.slice(0, -1),
          future: [{ strokes: state.strokes, aiObjects: state.aiObjects }, ...future].slice(0, MAX_HISTORY),
        },
        selectedIds: [],
      };
    }),

  redo: () =>
    set((state) => {
      const { past, future } = state.history;
      if (future.length === 0) return state;
      const next = future[0];
      return {
        strokes: next.strokes,
        aiObjects: next.aiObjects,
        history: {
          past: [...past, { strokes: state.strokes, aiObjects: state.aiObjects }].slice(-MAX_HISTORY),
          future: future.slice(1),
        },
        selectedIds: [],
      };
    }),

  canUndo: () => get().history.past.length > 0,
  canRedo: () => get().history.future.length > 0,

  loadDocument: (doc) =>
    set({
      canvasName: doc.canvas.name,
      strokes: doc.strokes,
      camera: doc.camera,
      aiObjects: doc.aiObjects ?? [],
      selectedIds: [],
      history: { past: [], future: [] },
    }),

  toDocument: () => {
    const state = get();
    const now = Date.now();
    return {
      version: 1,
      canvas: { name: state.canvasName },
      camera: state.camera,
      strokes: state.strokes,
      aiObjects: state.aiObjects,
      createdAt: now,
      updatedAt: now,
    };
  },

  pushNotice: (kind, message) =>
    set((state) => ({
      notices: [...state.notices, { id: `notice_${++noticeCounter}`, kind, message }],
    })),
  dismissNotice: (id) =>
    set((state) => ({ notices: state.notices.filter((n) => n.id !== id) })),
}));

function structuredCloneSettings(): Record<ToolId, ToolSettings> {
  const out = {} as Record<ToolId, ToolSettings>;
  (Object.keys(DEFAULT_TOOL_SETTINGS) as ToolId[]).forEach((tool) => {
    out[tool] = { ...DEFAULT_TOOL_SETTINGS[tool] };
  });
  return out;
}

export function emptyDocument(): CanvasDocument {
  return createEmptyDocument();
}
