import { beforeEach, describe, expect, it } from "vitest";
import { useCanvasStore } from "../state/canvasStore";
import { boundsOfPoints } from "../canvas/CoordinateSystem";
import type { Stroke } from "../types/document";

function stroke(id: string): Stroke {
  const points = [{ x: 0, y: 0 }, { x: 5, y: 5 }];
  return {
    id,
    type: "stroke",
    points,
    color: "#000",
    width: 2,
    tool: "pen",
    opacity: 1,
    bounds: boundsOfPoints(points),
    createdAt: 0,
    version: 1,
  };
}

describe("undo/redo", () => {
  beforeEach(() => {
    useCanvasStore.setState({
      strokes: [],
      selectedIds: [],
      history: { past: [], future: [] },
    });
  });

  it("undoes an add-stroke action back to the previous state", () => {
    const { addStroke, undo } = useCanvasStore.getState();
    addStroke(stroke("a"));
    expect(useCanvasStore.getState().strokes).toHaveLength(1);

    undo();
    expect(useCanvasStore.getState().strokes).toHaveLength(0);
  });

  it("redoes after an undo to restore the change", () => {
    const { addStroke, undo, redo } = useCanvasStore.getState();
    addStroke(stroke("a"));
    undo();
    redo();
    expect(useCanvasStore.getState().strokes).toHaveLength(1);
    expect(useCanvasStore.getState().strokes[0].id).toBe("a");
  });

  it("clears the redo stack when a new action is taken after undo", () => {
    const { addStroke, undo } = useCanvasStore.getState();
    addStroke(stroke("a"));
    undo();
    addStroke(stroke("b"));
    expect(useCanvasStore.getState().canRedo()).toBe(false);
    expect(useCanvasStore.getState().strokes.map((s) => s.id)).toEqual(["b"]);
  });

  it("supports multiple sequential undo/redo steps", () => {
    const { addStroke, undo, redo } = useCanvasStore.getState();
    addStroke(stroke("a"));
    addStroke(stroke("b"));
    addStroke(stroke("c"));
    expect(useCanvasStore.getState().strokes.map((s) => s.id)).toEqual(["a", "b", "c"]);

    undo();
    undo();
    expect(useCanvasStore.getState().strokes.map((s) => s.id)).toEqual(["a"]);

    redo();
    expect(useCanvasStore.getState().strokes.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("undoes a delete-selection action", () => {
    const { addStroke, setSelection, deleteSelection, undo } = useCanvasStore.getState();
    addStroke(stroke("a"));
    addStroke(stroke("b"));
    setSelection(["a"]);
    deleteSelection();
    expect(useCanvasStore.getState().strokes.map((s) => s.id)).toEqual(["b"]);

    undo();
    expect(useCanvasStore.getState().strokes.map((s) => s.id).sort()).toEqual(["a", "b"]);
  });

  it("undoes a clear-canvas action", () => {
    const { addStroke, clearCanvas, undo } = useCanvasStore.getState();
    addStroke(stroke("a"));
    clearCanvas();
    expect(useCanvasStore.getState().strokes).toHaveLength(0);

    undo();
    expect(useCanvasStore.getState().strokes).toHaveLength(1);
  });

  it("is a no-op when there is nothing to undo or redo", () => {
    const { undo, redo } = useCanvasStore.getState();
    undo();
    redo();
    expect(useCanvasStore.getState().strokes).toHaveLength(0);
  });
});
