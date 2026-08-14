import { describe, expect, it } from "vitest";
import { layoutDiagram } from "../canvas/LayoutEngine";
import type { DiagramEdge, DiagramNode } from "../ai/apiClient";

describe("LayoutEngine", () => {
  it("returns empty result when nodes list is empty", () => {
    const res = layoutDiagram([], []);
    expect(res.shapes).toHaveLength(0);
    expect(res.connectors).toHaveLength(0);
  });

  it("lays out a linear sequence of nodes with deterministic spacing and connectors", () => {
    const nodes: DiagramNode[] = [
      { id: "node1", label: "Start", shape_type: "rounded_rectangle" },
      { id: "node2", label: "Process Data", shape_type: "rectangle" },
      { id: "node3", label: "End", shape_type: "rounded_rectangle" },
    ];
    const edges: DiagramEdge[] = [
      { from_node: "node1", to_node: "node2", label: "start" },
      { from_node: "node2", to_node: "node3" },
    ];

    const res = layoutDiagram(nodes, edges, { originX: 200, originY: 150 });
    expect(res.shapes).toHaveLength(3);
    expect(res.connectors).toHaveLength(2);

    // Topological ordering: node1 is above node2, node2 is above node3
    const n1 = res.shapes.find((s) => s.id === "node1")!;
    const n2 = res.shapes.find((s) => s.id === "node2")!;
    const n3 = res.shapes.find((s) => s.id === "node3")!;

    expect(n1.y).toBeLessThan(n2.y);
    expect(n2.y).toBeLessThan(n3.y);

    // Shapes should be marked as draft with matching draftGroupId
    expect(n1.status).toBe("draft");
    expect(n1.draftGroupId).toBeTruthy();
    expect(n2.draftGroupId).toBe(n1.draftGroupId);
    expect(n3.draftGroupId).toBe(n1.draftGroupId);

    // Connectors should link the right nodes
    const c1 = res.connectors.find((c) => c.fromId === "node1")!;
    expect(c1.toId).toBe("node2");
    expect(c1.label).toBe("start");
    expect(c1.endArrow).toBe(true);
    expect(c1.draftGroupId).toBe(n1.draftGroupId);
  });

  it("supports branching and decision diamonds", () => {
    const nodes: DiagramNode[] = [
      { id: "start", label: "Start", shape_type: "rounded_rectangle" },
      { id: "dec", label: "Is Valid?", shape_type: "diamond" },
      { id: "yes", label: "Success Flow", shape_type: "rectangle" },
      { id: "no", label: "Error Flow", shape_type: "rectangle" },
    ];
    const edges: DiagramEdge[] = [
      { from_node: "start", to_node: "dec" },
      { from_node: "dec", to_node: "yes", label: "Yes" },
      { from_node: "dec", to_node: "no", label: "No" },
    ];

    const res = layoutDiagram(nodes, edges, { originX: 0, originY: 0 });
    expect(res.shapes).toHaveLength(4);
    expect(res.connectors).toHaveLength(3);

    const yesShape = res.shapes.find((s) => s.id === "yes")!;
    const noShape = res.shapes.find((s) => s.id === "no")!;

    // Both yes and no are at the same rank level below dec
    expect(yesShape.y).toBe(noShape.y);
    // They should be spaced apart horizontally
    expect(Math.abs(yesShape.x - noShape.x)).toBeGreaterThanOrEqual(100);
  });

  it("supports left_to_right layout direction", () => {
    const nodes: DiagramNode[] = [
      { id: "a", label: "Input", shape_type: "rectangle" },
      { id: "b", label: "Output", shape_type: "rectangle" },
    ];
    const edges: DiagramEdge[] = [{ from_node: "a", to_node: "b" }];

    const res = layoutDiagram(nodes, edges, {
      originX: 100,
      originY: 100,
      layoutDirection: "left_to_right",
    });

    const a = res.shapes.find((s) => s.id === "a")!;
    const b = res.shapes.find((s) => s.id === "b")!;

    expect(a.x).toBeLessThan(b.x);
  });
});
