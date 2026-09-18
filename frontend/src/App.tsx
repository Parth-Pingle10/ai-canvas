import { useCallback, useEffect, useRef, useState } from "react";
import { CanvasView } from "./components/Canvas/CanvasView";
import { Toolbar } from "./components/Toolbar/Toolbar";
import { HelpPanel } from "./components/UI/HelpPanel";
import { NoticeStack } from "./components/UI/NoticeStack";
import { MetricsPanel } from "./components/UI/MetricsPanel";
import { AiStatusBadge } from "./components/UI/AiStatusBadge";
import { AiObjectLayer } from "./components/AiLayer/AiObjectLayer";
import { useCanvasStore } from "./state/canvasStore";
import { useKeyboardShortcuts } from "./state/useKeyboardShortcuts";
import { useAiTrigger } from "./ai/useAiTrigger";
import {
  autosaveToLocalStorage,
  deserializeDocument,
  DocumentParseError,
  loadAutosaveFromLocalStorage,
  serializeDocument,
  UnsupportedVersionError,
} from "./utils/persistence";
import { downloadBlob, EmptyCanvasExportError, exportCanvasToPng } from "./utils/exportPng";
import { seedRandomStrokes } from "./utils/devSeed";
import { BottomControls } from "./components/UI/BottomControls";
import { PromptSidebar } from "./components/UI/PromptSidebar";
import { ShapePalette } from "./components/UI/ShapePalette";
import { TopRightActions } from "./components/UI/TopRightActions";
import "./App.css";

const AUTOSAVE_INTERVAL_MS = 8000;

export default function App() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [shapePaletteOpen, setShapePaletteOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { triggerManualAnalysis } = useAiTrigger();

  const strokes = useCanvasStore((s) => s.strokes);
  const shapes = useCanvasStore((s) => s.shapes);
  const connectors = useCanvasStore((s) => s.connectors);
  const textObjects = useCanvasStore((s) => s.textObjects);
  const camera = useCanvasStore((s) => s.camera);
  const canvasName = useCanvasStore((s) => s.canvasName);
  const loadDocument = useCanvasStore((s) => s.loadDocument);
  const toDocument = useCanvasStore((s) => s.toDocument);
  const clearCanvas = useCanvasStore((s) => s.clearCanvas);
  const notices = useCanvasStore((s) => s.notices);
  const pushNotice = useCanvasStore((s) => s.pushNotice);
  const dismissNotice = useCanvasStore((s) => s.dismissNotice);

  // Restore the autosaved document once on mount, if present.
  useEffect(() => {
    const restored = loadAutosaveFromLocalStorage();
    if (restored) {
      loadDocument(restored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave on an interval so a refresh or crash never loses work.
  useEffect(() => {
    const id = window.setInterval(() => {
      const doc = toDocument();
      const ok = autosaveToLocalStorage(doc);
      if (!ok) {
        pushNotice(
          "autosave-failed",
          "Autosave failed — your browser's local storage may be full or disabled."
        );
      }
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [toDocument, pushNotice]);

  const handleSave = useCallback(() => {
    try {
      const doc = toDocument();
      const json = serializeDocument(doc);
      const blob = new Blob([json], { type: "application/json" });
      const filename = `${(canvasName || "canvas").replace(/[^a-z0-9-_]+/gi, "_")}.json`;
      downloadBlob(blob, filename);
    } catch (err) {
      pushNotice("save-failed", messageFor(err, "Save failed — please try again."));
    }
  }, [toDocument, canvasName, pushNotice]);

  const handleLoadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChosen = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        const text = await file.text();
        const doc = deserializeDocument(text);
        loadDocument(doc);
      } catch (err) {
        if (err instanceof UnsupportedVersionError) {
          pushNotice("load-failed", err.message);
        } else if (err instanceof DocumentParseError) {
          pushNotice("load-failed", err.message);
        } else {
          pushNotice("load-failed", "Couldn't load this file — it may be corrupted.");
        }
      }
    },
    [loadDocument, pushNotice]
  );

  const handleExport = useCallback(async () => {
    try {
      const blob = await exportCanvasToPng(strokes, {}, shapes, connectors, textObjects);
      downloadBlob(blob, `${(canvasName || "canvas").replace(/[^a-z0-9-_]+/gi, "_")}.png`);
    } catch (err) {
      if (err instanceof EmptyCanvasExportError) {
        pushNotice("export-failed", err.message);
      } else {
        pushNotice("export-failed", messageFor(err, "PNG export failed — please try again."));
      }
    }
  }, [strokes, shapes, connectors, textObjects, canvasName, pushNotice]);

  const handleClear = useCallback(() => {
    if (strokes.length === 0 && shapes.length === 0 && connectors.length === 0 && textObjects.length === 0) return;
    const confirmed = window.confirm("Clear the whole canvas? This can still be undone.");
    if (confirmed) {
      clearCanvas();
    }
  }, [strokes.length, shapes.length, connectors.length, textObjects.length, clearCanvas]);

  // Dev-only helper for performance testing: run `__seedStrokes(5000)` in the
  // browser console to generate a stress-test document without drawing by hand.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __seedStrokes: (n: number) => void }).__seedStrokes = (n: number) => {
      seedRandomStrokes(n);
    };
  }, []);

  useKeyboardShortcuts({
    onSave: handleSave,
    onLoad: handleLoadClick,
    onExport: handleExport,
    onToggleHelp: () => setHelpOpen((v) => !v),
    onManualAnalyze: () => triggerManualAnalysis(),
    onToggleMetrics: () => setMetricsOpen((v) => !v),
  });

  return (
    <div className="app">
      <CanvasView onManualAnalyze={() => triggerManualAnalysis()} />
      <AiObjectLayer />
      <AiStatusBadge />
      <Toolbar
        onManualAnalyze={() => triggerManualAnalysis()}
        isShapePaletteOpen={shapePaletteOpen}
        onToggleShapePalette={() => setShapePaletteOpen((v) => !v)}
      />
      <TopRightActions
        onSave={handleSave}
        onLoad={handleLoadClick}
        onExport={handleExport}
        onClear={handleClear}
        onToggleHelp={() => setHelpOpen((v) => !v)}
      />
      <ShapePalette
        isOpen={shapePaletteOpen}
        onClose={() => setShapePaletteOpen(false)}
      />
      <BottomControls />
      <PromptSidebar onSubmitPrompt={(prompt) => triggerManualAnalysis(prompt)} />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="app__hidden-input"
        onChange={handleFileChosen}
      />
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
      {metricsOpen && <MetricsPanel onClose={() => setMetricsOpen(false)} />}
      <NoticeStack notices={notices} onDismiss={dismissNotice} />
      {/* Referenced so the camera stays a live subscription for future debug tooling. */}
      <span className="app__sr-only">{camera.zoom.toFixed(2)}</span>
    </div>
  );
}

function messageFor(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
