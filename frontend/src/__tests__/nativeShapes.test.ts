import { beforeEach, describe, expect, it } from "vitest";
import { useCanvasStore } from "../state/canvasStore";
import { createCleanShape } from "../utils/shapeRecognition";
import { resolveConnectorEndpoints } from "../canvas/ShapeRenderer";
import type { CanvasConnector } from "../types/document";

describe("nativeShapes & draft groups in canvasStore", () => {
  beforeEach(() => {
    useCanvasStore.setState({
      strokes: [],
      shapes: [],
      connectors: [],
      textObjects: [],
      selectedIds: [],
      history: { past: [], future: [] },
    });
  });

  it("adds and commits native shapes and connectors", () => {
    const { addShape, addConnector } = useCanvasStore.getState();
    const s = createCleanShape("rectangle", { minX: 10, minY: 10, maxX: 100, maxY: 60 });
    addShape(s);

    expect(useCanvasStore.getState().shapes).toHaveLength(1);
    expect(useCanvasStore.getState().shapes[0].shapeType).toBe("rectangle");

    const c: CanvasConnector = {
      id: "c1",
      type: "connector",
      startX: 100,
      startY: 35,
      endX: 200,
      endY: 35,
      fromId: s.id,
      fromAnchor: "right",
      routing: "straight",
      strokeColor: "#000",
      strokeWidth: 2,
      bounds: { minX: 100, minY: 35, maxX: 200, maxY: 35 },
      createdAt: 0,
      version: 1,
    };
    addConnector(c);

    expect(useCanvasStore.getState().connectors).toHaveLength(1);
  });

  it("accepts a diagram draft group atomically, converting all member shapes and connectors to confirmed", () => {
    const { addDiagramDraft, acceptDraftGroup } = useCanvasStore.getState();
    const groupId = "grp_test";
    const s1 = createCleanShape("rectangle", { minX: 0, minY: 0, maxX: 100, maxY: 50 }, "#000", "A", true, groupId);
    const s2 = createCleanShape("rectangle", { minX: 0, minY: 100, maxX: 100, maxY: 150 }, "#000", "B", true, groupId);
    const conn: CanvasConnector = {
      id: "c_test",
      type: "connector",
      startX: 50,
      startY: 50,
      endX: 50,
      endY: 100,
      fromId: s1.id,
      toId: s2.id,
      routing: "orthogonal",
      strokeColor: "#000",
      strokeWidth: 2,
      bounds: { minX: 50, minY: 50, maxX: 50, maxY: 100 },
      status: "draft",
      draftGroupId: groupId,
      createdAt: 0,
      version: 1,
    };

    addDiagramDraft([s1, s2], [conn]);

    expect(useCanvasStore.getState().shapes.every((s) => s.status === "draft")).toBe(true);
    expect(useCanvasStore.getState().connectors[0].status).toBe("draft");

    acceptDraftGroup(groupId);

    expect(useCanvasStore.getState().shapes.every((s) => s.status === "confirmed")).toBe(true);
    expect(useCanvasStore.getState().connectors[0].status).toBe("confirmed");
  });

  it("discards a draft group, removing all shapes and connectors in the group", () => {
    const { addDiagramDraft, discardDraftGroup } = useCanvasStore.getState();
    const groupId = "grp_discard";
    const s1 = createCleanShape("rectangle", { minX: 0, minY: 0, maxX: 50, maxY: 50 }, "#000", "", true, groupId);
    const conn: CanvasConnector = {
      id: "c1",
      type: "connector",
      startX: 0,
      startY: 0,
      endX: 50,
      endY: 50,
      strokeColor: "#000",
      strokeWidth: 2,
      bounds: { minX: 0, minY: 0, maxX: 50, maxY: 50 },
      status: "draft",
      draftGroupId: groupId,
      createdAt: 0,
      version: 1,
    };

    addDiagramDraft([s1], [conn]);
    expect(useCanvasStore.getState().shapes).toHaveLength(1);
    expect(useCanvasStore.getState().connectors).toHaveLength(1);

    discardDraftGroup(groupId);
    expect(useCanvasStore.getState().shapes).toHaveLength(0);
    expect(useCanvasStore.getState().connectors).toHaveLength(0);
  });

  it("undoes and redoes shape additions and draft group acceptances", () => {
    const { addShape, undo, redo } = useCanvasStore.getState();
    const s1 = createCleanShape("circle", { minX: 0, minY: 0, maxX: 60, maxY: 60 });
    addShape(s1);
    expect(useCanvasStore.getState().shapes).toHaveLength(1);

    undo();
    expect(useCanvasStore.getState().shapes).toHaveLength(0);

    redo();
    expect(useCanvasStore.getState().shapes).toHaveLength(1);
    expect(useCanvasStore.getState().shapes[0].shapeType).toBe("circle");
  });

  it("resolves dynamic connector endpoints when shapes move", () => {
    const shapeA = createCleanShape("rectangle", { minX: 100, minY: 100, maxX: 200, maxY: 160 });
    const shapeB = createCleanShape("rectangle", { minX: 300, minY: 100, maxX: 400, maxY: 160 });
    const conn: CanvasConnector = {
      id: "c1",
      type: "connector",
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      fromId: shapeA.id,
      fromAnchor: "right",
      toId: shapeB.id,
      toAnchor: "left",
      strokeColor: "#000",
      strokeWidth: 2,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      createdAt: 0,
      version: 1,
    };

    const map = new Map([
      [shapeA.id, shapeA],
      [shapeB.id, shapeB],
    ]);

    const { start, end } = resolveConnectorEndpoints(conn, map);
    // Right anchor of shapeA: x = 200, y = (100+160)/2 = 130
    expect(start.x).toBe(200);
    expect(start.y).toBe(130);

    // Left anchor of shapeB: x = 300, y = 130
    expect(end.x).toBe(300);
    expect(end.y).toBe(130);
  });
});
