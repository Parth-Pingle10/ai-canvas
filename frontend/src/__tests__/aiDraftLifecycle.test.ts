import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCanvasStore } from "../state/canvasStore";
import type { AiObject, PendingAiRequest } from "../types/ai";

function draft(id: string, requestId = "req_1"): AiObject {
  return {
    id,
    kind: "ai-object",
    status: "draft",
    contentType: "markdown",
    title: "Solution",
    content: "x = 5",
    confidence: 0.9,
    bounds: { x: 100, y: 100, width: 280, height: 140 },
    sourceBounds: { minX: 0, minY: 0, maxX: 50, maxY: 50 },
    requestId,
    createdAt: 0,
    version: 1,
  };
}

describe("AI draft object lifecycle", () => {
  beforeEach(() => {
    useCanvasStore.setState({
      strokes: [],
      aiObjects: [],
      pendingRequests: [],
      selectedIds: [],
      history: { past: [], future: [] },
    });
  });

  it("adds a draft object with draft status", () => {
    useCanvasStore.getState().addDraft(draft("d1"));
    const objects = useCanvasStore.getState().aiObjects;
    expect(objects).toHaveLength(1);
    expect(objects[0].status).toBe("draft");
  });

  it("accepting a draft flips its status to confirmed without changing its id", () => {
    useCanvasStore.getState().addDraft(draft("d1"));
    useCanvasStore.getState().acceptDraft("d1");
    const obj = useCanvasStore.getState().aiObjects[0];
    expect(obj.status).toBe("confirmed");
    expect(obj.id).toBe("d1");
  });

  it("discarding a draft removes it entirely", () => {
    useCanvasStore.getState().addDraft(draft("d1"));
    useCanvasStore.getState().discardDraft("d1");
    expect(useCanvasStore.getState().aiObjects).toHaveLength(0);
  });

  it("accepting a draft is undoable", () => {
    useCanvasStore.getState().addDraft(draft("d1"));
    useCanvasStore.getState().acceptDraft("d1");
    expect(useCanvasStore.getState().aiObjects[0].status).toBe("confirmed");

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().aiObjects[0].status).toBe("draft");
  });

  it("discarding a draft is undoable", () => {
    useCanvasStore.getState().addDraft(draft("d1"));
    useCanvasStore.getState().discardDraft("d1");
    expect(useCanvasStore.getState().aiObjects).toHaveLength(0);

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().aiObjects).toHaveLength(1);
    expect(useCanvasStore.getState().aiObjects[0].status).toBe("draft");
  });

  it("adding a draft itself is undoable", () => {
    useCanvasStore.getState().addDraft(draft("d1"));
    expect(useCanvasStore.getState().aiObjects).toHaveLength(1);
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().aiObjects).toHaveLength(0);
  });

  it("moving a confirmed AI object updates its bounds and is undoable", () => {
    useCanvasStore.getState().addDraft(draft("d1"));
    useCanvasStore.getState().acceptDraft("d1");
    useCanvasStore.getState().moveAiObject("d1", { x: 500, y: 500, width: 280, height: 140 });

    expect(useCanvasStore.getState().aiObjects[0].bounds.x).toBe(500);
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().aiObjects[0].bounds.x).toBe(100);
  });

  it("deleting a confirmed AI object removes it and is undoable", () => {
    useCanvasStore.getState().addDraft(draft("d1"));
    useCanvasStore.getState().acceptDraft("d1");
    useCanvasStore.getState().deleteAiObject("d1");
    expect(useCanvasStore.getState().aiObjects).toHaveLength(0);

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().aiObjects).toHaveLength(1);
  });

  it("undoing an ai-object change never affects unrelated strokes", () => {
    useCanvasStore.getState().addStroke({
      id: "s1",
      type: "stroke",
      points: [{ x: 0, y: 0 }],
      color: "#000",
      width: 2,
      tool: "pen",
      opacity: 1,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      createdAt: 0,
      version: 1,
    });
    useCanvasStore.getState().addDraft(draft("d1"));
    useCanvasStore.getState().undo(); // undoes the draft add
    expect(useCanvasStore.getState().aiObjects).toHaveLength(0);
    expect(useCanvasStore.getState().strokes).toHaveLength(1); // stroke untouched
  });
});

describe("pending AI request cancellation", () => {
  beforeEach(() => {
    useCanvasStore.setState({ pendingRequests: [] });
  });

  function pending(id: string): PendingAiRequest {
    return {
      id,
      sourceBounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      anchorBounds: { x: 20, y: 0, width: 280, height: 140 },
      trigger: "manual",
      startedAt: 0,
      controller: new AbortController(),
    };
  }

  it("addPendingRequest makes the request visible in state", () => {
    useCanvasStore.getState().addPendingRequest(pending("r1"));
    expect(useCanvasStore.getState().pendingRequests).toHaveLength(1);
  });

  it("cancelPendingRequest aborts the controller and removes the entry", () => {
    const req = pending("r1");
    const abortSpy = vi.spyOn(req.controller, "abort");
    useCanvasStore.getState().addPendingRequest(req);

    useCanvasStore.getState().cancelPendingRequest("r1");

    expect(abortSpy).toHaveBeenCalledOnce();
    expect(useCanvasStore.getState().pendingRequests).toHaveLength(0);
  });

  it("cancelAllPendingRequests aborts every in-flight request", () => {
    const r1 = pending("r1");
    const r2 = pending("r2");
    const spy1 = vi.spyOn(r1.controller, "abort");
    const spy2 = vi.spyOn(r2.controller, "abort");
    useCanvasStore.getState().addPendingRequest(r1);
    useCanvasStore.getState().addPendingRequest(r2);

    useCanvasStore.getState().cancelAllPendingRequests();

    expect(spy1).toHaveBeenCalledOnce();
    expect(spy2).toHaveBeenCalledOnce();
    expect(useCanvasStore.getState().pendingRequests).toHaveLength(0);
  });

  it("pending requests are not part of undo history", () => {
    useCanvasStore.setState({ history: { past: [], future: [] } });
    useCanvasStore.getState().addPendingRequest(pending("r1"));
    // No history entries should have been created by a pending-request change.
    expect(useCanvasStore.getState().history.past).toHaveLength(0);
  });
});
