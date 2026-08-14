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
    // Left anchor of shapeB: x = 300, y = 130
    expect(end.x).toBe(300);
    expect(end.y).toBe(130);
  });

  it("accepts a clean AI shape and removes the rough source strokes atomically", () => {
    const { addStroke, addShape, acceptDraftGroup, undo } = useCanvasStore.getState();

    // 1. User draws rough stroke
    const roughStroke = {
      id: "rough_1",
      type: "stroke" as const,
      points: [{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 60 }, { x: 10, y: 60 }],
      color: "#000",
      width: 2,
      tool: "pen" as const,
      opacity: 1,
      bounds: { minX: 10, minY: 10, maxX: 100, maxY: 60 },
      createdAt: 0,
      version: 1,
    };
    addStroke(roughStroke);
    expect(useCanvasStore.getState().strokes).toHaveLength(1);

    // 2. AI creates clean replacement shape referencing the rough stroke ID
    const groupId = "draft_shape_grp";
    const cleanShape = createCleanShape(
      "rectangle",
      { minX: 10, minY: 10, maxX: 100, maxY: 60 },
      "#000",
      "",
      true,
      groupId,
      ["rough_1"]
    );
    addShape(cleanShape);

    // Both rough and clean draft exist before accept
    expect(useCanvasStore.getState().strokes).toHaveLength(1);
    expect(useCanvasStore.getState().shapes).toHaveLength(1);
    expect(useCanvasStore.getState().shapes[0].status).toBe("draft");

    // 3. User accepts: rough stroke is removed, clean shape becomes confirmed
    acceptDraftGroup(groupId);

    expect(useCanvasStore.getState().strokes).toHaveLength(0);
    expect(useCanvasStore.getState().shapes).toHaveLength(1);
    expect(useCanvasStore.getState().shapes[0].status).toBe("confirmed");

    // 4. Undo restores the rough stroke and previous state
    undo();
    expect(useCanvasStore.getState().strokes).toHaveLength(1);
    expect(useCanvasStore.getState().strokes[0].id).toBe("rough_1");
  });

  it("discarding a clean AI shape leaves the original rough stroke untouched", () => {
    const { addStroke, addShape, discardDraftGroup } = useCanvasStore.getState();

    const roughStroke = {
      id: "rough_2",
      type: "stroke" as const,
      points: [{ x: 0, y: 0 }, { x: 50, y: 50 }],
      color: "#000",
      width: 2,
      tool: "pen" as const,
      opacity: 1,
      bounds: { minX: 0, minY: 0, maxX: 50, maxY: 50 },
      createdAt: 0,
      version: 1,
    };
    addStroke(roughStroke);

    const groupId = "draft_discard_grp";
    const cleanShape = createCleanShape(
      "circle",
      { minX: 0, minY: 0, maxX: 50, maxY: 50 },
      "#000",
      "",
      true,
      groupId,
      ["rough_2"]
    );
    addShape(cleanShape);

    // Discard draft: clean shape is removed, rough stroke remains
    discardDraftGroup(groupId);

    expect(useCanvasStore.getState().shapes).toHaveLength(0);
    expect(useCanvasStore.getState().strokes).toHaveLength(1);
    expect(useCanvasStore.getState().strokes[0].id).toBe("rough_2");
  });
});

