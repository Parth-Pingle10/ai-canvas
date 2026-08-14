import { create } from "zustand";
import type {
  Camera,
  CanvasConnector,
  CanvasDocument,
  CanvasShape,
  CanvasText,
  Stroke,
  ToolId,
} from "../types/document";
import { createEmptyDocument } from "../types/document";
import type { AiObject, PendingAiRequest, WorldRect } from "../types/ai";
import { DEFAULT_TOOL_SETTINGS, type ToolSettings } from "../types/tools";
import { createDefaultCamera } from "../canvas/Camera";

const MAX_HISTORY = 100;

interface HistorySnapshot {
  strokes: Stroke[];
  shapes: CanvasShape[];
  connectors: CanvasConnector[];
  textObjects: CanvasText[];
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
  shapes: CanvasShape[];
  connectors: CanvasConnector[];
  textObjects: CanvasText[];
  camera: Camera;
  tool: ToolId;
  toolSettings: Record<ToolId, ToolSettings>;
  selectedIds: string[];
  history: HistoryState;
  notices: AppNotice[];

  // AI objects (draft + confirmed) and in-flight request placeholders.
  aiObjects: AiObject[];
  pendingRequests: PendingAiRequest[];

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

  // Generic document commit
  commitScene: (patch: {
    strokes?: Stroke[];
    shapes?: CanvasShape[];
    connectors?: CanvasConnector[];
    textObjects?: CanvasText[];
    aiObjects?: AiObject[];
  }) => void;

  // Stroke mutation
  commitStrokes: (next: Stroke[]) => void;
  addStroke: (stroke: Stroke) => void;

  // Shape / Connector / Text mutation
  commitShapes: (next: CanvasShape[]) => void;
  addShape: (shape: CanvasShape) => void;
  commitConnectors: (next: CanvasConnector[]) => void;
  addConnector: (connector: CanvasConnector) => void;
  commitTextObjects: (next: CanvasText[]) => void;
  addTextObject: (textObj: CanvasText) => void;

  // AI Diagram Draft Actions
  addDiagramDraft: (shapes: CanvasShape[], connectors: CanvasConnector[]) => void;
  acceptDraftGroup: (draftGroupId: string) => void;
  discardDraftGroup: (draftGroupId: string) => void;

  // Common Selection / Canvas Actions
  deleteSelection: () => void;
  clearCanvas: () => void;

  // AI Card object mutation
  commitAiObjects: (next: AiObject[]) => void;
  addDraft: (draft: AiObject) => void;
  acceptDraft: (id: string) => void;
  discardDraft: (id: string) => void;
  deleteAiObject: (id: string) => void;
  moveAiObject: (id: string, bounds: WorldRect) => void;
  resizeAiObject: (id: string, bounds: WorldRect) => void;

  // Pending AI requests
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
  shapes: [],
  connectors: [],
  textObjects: [],
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

  commitScene: (patch) =>
    set((state) => {
      const past = [
        ...state.history.past,
        {
          strokes: state.strokes,
          shapes: state.shapes,
          connectors: state.connectors,
          textObjects: state.textObjects,
          aiObjects: state.aiObjects,
        },
      ].slice(-MAX_HISTORY);

      return {
        strokes: patch.strokes ?? state.strokes,
        shapes: patch.shapes ?? state.shapes,
        connectors: patch.connectors ?? state.connectors,
        textObjects: patch.textObjects ?? state.textObjects,
        aiObjects: patch.aiObjects ?? state.aiObjects,
        history: { past, future: [] },
      };
    }),

  commitStrokes: (next) => get().commitScene({ strokes: next }),

  addStroke: (stroke) => {
    const { strokes, commitStrokes } = get();
    commitStrokes([...strokes, stroke]);
  },

  commitShapes: (next) => get().commitScene({ shapes: next }),

  addShape: (shape) => {
    const { shapes, commitShapes } = get();
    commitShapes([...shapes, shape]);
  },

  commitConnectors: (next) => get().commitScene({ connectors: next }),

  addConnector: (connector) => {
    const { connectors, commitConnectors } = get();
    commitConnectors([...connectors, connector]);
  },

  commitTextObjects: (next) => get().commitScene({ textObjects: next }),

  addTextObject: (textObj) => {
    const { textObjects, commitTextObjects } = get();
    commitTextObjects([...textObjects, textObj]);
  },

  addDiagramDraft: (newShapes, newConnectors) => {
    const { shapes, connectors, commitScene } = get();
    commitScene({
      shapes: [...shapes, ...newShapes],
      connectors: [...connectors, ...newConnectors],
    });
  },

  acceptDraftGroup: (draftGroupId) => {
    const { shapes, connectors, commitScene } = get();
    const nextShapes = shapes.map((s) =>
      s.draftGroupId === draftGroupId ? { ...s, status: "confirmed" as const, version: s.version + 1 } : s
    );
    const nextConnectors = connectors.map((c) =>
      c.draftGroupId === draftGroupId ? { ...c, status: "confirmed" as const, version: c.version + 1 } : c
    );
    commitScene({ shapes: nextShapes, connectors: nextConnectors });
  },

  discardDraftGroup: (draftGroupId) => {
    const { shapes, connectors, commitScene } = get();
    commitScene({
      shapes: shapes.filter((s) => s.draftGroupId !== draftGroupId),
      connectors: connectors.filter((c) => c.draftGroupId !== draftGroupId),
    });
  },

  deleteSelection: () => {
    const { strokes, shapes, connectors, textObjects, selectedIds, commitScene } = get();
    if (selectedIds.length === 0) return;
    const idSet = new Set(selectedIds);

    commitScene({
      strokes: strokes.filter((s) => !idSet.has(s.id)),
      shapes: shapes.filter((s) => !idSet.has(s.id)),
      connectors: connectors.filter((c) => !idSet.has(c.id)),
      textObjects: textObjects.filter((t) => !idSet.has(t.id)),
    });
    set({ selectedIds: [] });
  },

  clearCanvas: () => {
    const { commitScene } = get();
    commitScene({
      strokes: [],
      shapes: [],
      connectors: [],
      textObjects: [],
    });
    set({ selectedIds: [] });
  },

  commitAiObjects: (next) => get().commitScene({ aiObjects: next }),

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
        shapes: previous.shapes ?? [],
        connectors: previous.connectors ?? [],
        textObjects: previous.textObjects ?? [],
        aiObjects: previous.aiObjects ?? [],
        history: {
          past: past.slice(0, -1),
          future: [
            {
              strokes: state.strokes,
              shapes: state.shapes,
              connectors: state.connectors,
              textObjects: state.textObjects,
              aiObjects: state.aiObjects,
            },
            ...future,
          ].slice(0, MAX_HISTORY),
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
        shapes: next.shapes ?? [],
        connectors: next.connectors ?? [],
        textObjects: next.textObjects ?? [],
        aiObjects: next.aiObjects ?? [],
        history: {
          past: [
            ...past,
            {
              strokes: state.strokes,
              shapes: state.shapes,
              connectors: state.connectors,
              textObjects: state.textObjects,
              aiObjects: state.aiObjects,
            },
          ].slice(-MAX_HISTORY),
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
      strokes: doc.strokes ?? [],
      shapes: doc.shapes ?? [],
      connectors: doc.connectors ?? [],
      textObjects: doc.textObjects ?? [],
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
      shapes: state.shapes,
      connectors: state.connectors,
      textObjects: state.textObjects,
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
