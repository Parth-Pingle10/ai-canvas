import { describe, it, expect } from "vitest";
import { layoutDiagram } from "../canvas/LayoutEngine";
import { computeRoi, roiSignature } from "../canvas/RegionExtractor";
import type { DiagramEdge, DiagramNode } from "../ai/apiClient";
import type { CanvasText } from "../types/document";

describe("Dynamic Canvas Creation Pipeline", () => {
  it("computes ROI including CanvasText objects when user types instruction", () => {
    const textObj: CanvasText = {
      id: "txt_1",
      type: "text",
      x: 100,
      y: 150,
      width: 250,
      height: 40,
      text: "Design a CI/CD deployment pipeline",
      fontSize: 18,
      fontColor: "#1e1e1e",
      bounds: { minX: 100, minY: 150, maxX: 350, maxY: 190 },
      status: "confirmed",
      createdAt: Date.now(),
      version: 1,
    };

    const roi = computeRoi({
      strokes: [],
      textObjects: [textObj],
      recentStrokeIds: new Set(),
      recentTextIds: new Set(["txt_1"]),
      selectedIds: [],
      viewportWorldBounds: { minX: 0, minY: 0, maxX: 1920, maxY: 1080 },
    });

    expect(roi.source).toBe("recent-strokes");
    expect(roi.textIds).toEqual(["txt_1"]);
    expect(roi.bounds.minX).toBe(100);
    expect(roi.bounds.minY).toBe(150);
    expect(roi.bounds.maxX).toBe(350);
    expect(roi.bounds.maxY).toBe(190);
  });

  it("generates distinct signatures when text changes", () => {
    const textA: CanvasText = {
      id: "txt_1",
      type: "text",
      x: 0,
      y: 0,
      width: 100,
      height: 30,
      text: "A",
      fontSize: 16,
      fontColor: "#000",
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 30 },
      status: "confirmed",
      createdAt: 1,
      version: 1,
    };
    const textB: CanvasText = { ...textA, version: 2 };

    const sig1 = roiSignature(
      { source: "recent-strokes", strokeIds: [], textIds: ["txt_1"] },
      [],
      [textA]
    );
    const sig2 = roiSignature(
      { source: "recent-strokes", strokeIds: [], textIds: ["txt_1"] },
      [],
      [textB]
    );

    expect(sig1).not.toEqual(sig2);
  });

  it("creates structured native canvas objects from multi-node diagrams with branching", () => {
    const nodes: DiagramNode[] = [
      { id: "build", label: "Build Artifact", shape_type: "rectangle" },
      { id: "test", label: "Run Unit & Integration Tests", shape_type: "rectangle" },
      { id: "decision", label: "Tests Passed?", shape_type: "diamond" },
      { id: "deploy", label: "Deploy to Production", shape_type: "rectangle" },
      { id: "rollback", label: "Trigger Rollback & Notify", shape_type: "rounded_rectangle" },
    ];

    const edges: DiagramEdge[] = [
      { from_node: "build", to_node: "test" },
      { from_node: "test", to_node: "decision" },
      { from_node: "decision", to_node: "deploy", label: "Pass" },
      { from_node: "decision", to_node: "rollback", label: "Fail" },
    ];

    const result = layoutDiagram(nodes, edges, {
      originX: 200,
      originY: 100,
      layoutDirection: "top_to_bottom",
      draftGroupId: "grp_cicd",
      isDraft: true,
    });

    expect(result.shapes.length).toBe(5);
    expect(result.connectors.length).toBe(4);

    // Shapes should retain their shape types and draftGroupId
    const diamondShape = result.shapes.find((s) => s.shapeType === "diamond");
    expect(diamondShape).toBeDefined();
    expect(diamondShape?.text).toBe("Tests Passed?");
    expect(diamondShape?.status).toBe("draft");
    expect(diamondShape?.draftGroupId).toBe("grp_cicd");

    // Connectors should route to the respective shape anchors
    const rollbackEdge = result.connectors.find((c) => c.label === "Fail");
    expect(rollbackEdge).toBeDefined();
  });
});
