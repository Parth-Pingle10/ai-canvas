import type {
  BoundingBox,
  CanvasConnector,
  CanvasShape,
  ConnectorAnchor,
  ShapeType,
} from "../types/document";
import type { DiagramEdge, DiagramNode } from "../ai/apiClient";
import { generateId } from "../utils/id";
import { boundsOfShape, getAnchorPoint } from "./ShapeRenderer";

export interface LayoutOptions {
  originX?: number;
  originY?: number;
  layoutDirection?: "top_to_bottom" | "left_to_right";
  draftGroupId?: string;
  isDraft?: boolean;
  sourceStrokeIds?: string[];
  sourceBounds?: BoundingBox;
  replaceSource?: boolean;
  strokeColor?: string;
  fillColor?: string;
}

export interface LayoutResult {
  shapes: CanvasShape[];
  connectors: CanvasConnector[];
  bounds: BoundingBox;
}

/**
 * Deterministic Canvas Layout Engine:
 * Converts semantic nodes and edges into neatly aligned, spaced, and routed
 * native canvas objects (shapes & connectors) placed near the source region.
 */
export function layoutDiagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  options: LayoutOptions = {}
): LayoutResult {
  if (nodes.length === 0) {
    return { shapes: [], connectors: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  }

  const originX = options.originX ?? 100;
  const originY = options.originY ?? 100;
  const direction = options.layoutDirection ?? "top_to_bottom";
  const draftGroupId = options.draftGroupId ?? generateId("draft_grp");
  const isDraft = options.isDraft ?? true;
  const strokeColor = options.strokeColor ?? "#2b3a4a";
  const fillColor = options.fillColor ?? "#ffffff";

  // 1. Measure and size each node
  const nodeDimensions = new Map<string, { width: number; height: number; shapeType: ShapeType }>();
  for (const node of nodes) {
    const dims = calculateNodeDimensions(node.label, node.shape_type);
    nodeDimensions.set(node.id, { ...dims, shapeType: node.shape_type });
  }

  // 2. Build graph adjacency and in-degree maps for rank assignment
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }

  for (const edge of edges) {
    if (adj.has(edge.from_node) && inDegree.has(edge.to_node)) {
      adj.get(edge.from_node)!.push(edge.to_node);
      inDegree.set(edge.to_node, (inDegree.get(edge.to_node) ?? 0) + 1);
    }
  }

  // 3. Assign topological levels/ranks (longest path layering)
  const ranks = new Map<string, number>();
  const queue: string[] = [];

  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      ranks.set(id, 0);
      queue.push(id);
    }
  }

  // Handle cycles or disconnected graphs by defaulting unvisited nodes
  if (queue.length === 0 && nodes.length > 0) {
    ranks.set(nodes[0].id, 0);
    queue.push(nodes[0].id);
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const curr = queue.shift()!;
    visited.add(curr);
    const currRank = ranks.get(curr) ?? 0;

    for (const next of adj.get(curr) ?? []) {
      const nextRank = Math.max(ranks.get(next) ?? 0, currRank + 1);
      ranks.set(next, nextRank);
      if (!visited.has(next) && !queue.includes(next)) {
        queue.push(next);
      }
    }
  }

  // Any remaining nodes not reached by BFS
  for (const node of nodes) {
    if (!ranks.has(node.id)) {
      ranks.set(node.id, 0);
    }
  }

  // 4. Group nodes by rank level
  const levels = new Map<number, string[]>();
  for (const [id, rank] of ranks.entries()) {
    if (!levels.has(rank)) levels.set(rank, []);
    levels.get(rank)!.push(id);
  }

  const sortedRankKeys = Array.from(levels.keys()).sort((a, b) => a - b);

  // 5. Calculate coordinates for each node
  const nodePositions = new Map<string, { x: number; y: number; width: number; height: number }>();
  const HORIZONTAL_GAP = 60;
  const VERTICAL_GAP = 80;

  if (direction === "top_to_bottom") {
    // Calculate max level width to center the diagram
    let currentY = originY;

    // Find max width among all levels
    let maxLevelWidth = 0;
    for (const rank of sortedRankKeys) {
      const nodeIds = levels.get(rank)!;
      let levelW = 0;
      for (const id of nodeIds) {
        const dims = nodeDimensions.get(id)!;
        levelW += dims.width;
      }
      levelW += (nodeIds.length - 1) * HORIZONTAL_GAP;
      if (levelW > maxLevelWidth) maxLevelWidth = levelW;
    }

    for (const rank of sortedRankKeys) {
      const nodeIds = levels.get(rank)!;
      let levelWidth = 0;
      let maxHeightInLevel = 0;

      for (const id of nodeIds) {
        const dims = nodeDimensions.get(id)!;
        levelWidth += dims.width;
        if (dims.height > maxHeightInLevel) maxHeightInLevel = dims.height;
      }
      levelWidth += (nodeIds.length - 1) * HORIZONTAL_GAP;

      let currentX = originX + (maxLevelWidth - levelWidth) / 2;

      for (const id of nodeIds) {
        const dims = nodeDimensions.get(id)!;
        // Vertically center inside this rank row
        const posY = currentY + (maxHeightInLevel - dims.height) / 2;
        nodePositions.set(id, {
          x: currentX,
          y: posY,
          width: dims.width,
          height: dims.height,
        });
        currentX += dims.width + HORIZONTAL_GAP;
      }

      currentY += maxHeightInLevel + VERTICAL_GAP;
    }
  } else {
    // left_to_right
    let currentX = originX;
    let maxLevelHeight = 0;

    for (const rank of sortedRankKeys) {
      const nodeIds = levels.get(rank)!;
      let levelH = 0;
      for (const id of nodeIds) {
        const dims = nodeDimensions.get(id)!;
        levelH += dims.height;
      }
      levelH += (nodeIds.length - 1) * VERTICAL_GAP;
      if (levelH > maxLevelHeight) maxLevelHeight = levelH;
    }

    for (const rank of sortedRankKeys) {
      const nodeIds = levels.get(rank)!;
      let levelHeight = 0;
      let maxWidthInLevel = 0;

      for (const id of nodeIds) {
        const dims = nodeDimensions.get(id)!;
        levelHeight += dims.height;
        if (dims.width > maxWidthInLevel) maxWidthInLevel = dims.width;
      }
      levelHeight += (nodeIds.length - 1) * VERTICAL_GAP;

      let currentY = originY + (maxLevelHeight - levelHeight) / 2;

      for (const id of nodeIds) {
        const dims = nodeDimensions.get(id)!;
        const posX = currentX + (maxWidthInLevel - dims.width) / 2;
        nodePositions.set(id, {
          x: posX,
          y: currentY,
          width: dims.width,
          height: dims.height,
        });
        currentY += dims.height + VERTICAL_GAP;
      }

      currentX += maxWidthInLevel + HORIZONTAL_GAP;
    }
  }

  // 6. Build CanvasShape objects
  const shapes: CanvasShape[] = [];
  const shapesMap = new Map<string, CanvasShape>();
  const now = Date.now();

  for (const node of nodes) {
    const pos = nodePositions.get(node.id)!;
    const shape: CanvasShape = {
      id: node.id,
      type: "shape",
      shapeType: node.shape_type,
      x: pos.x,
      y: pos.y,
      width: pos.width,
      height: pos.height,
      strokeColor,
      fillColor,
      strokeWidth: 2.5,
      opacity: 1,
      text: node.label,
      textColor: strokeColor,
      fontSize: 14,
      bounds: {
        minX: pos.x,
        minY: pos.y,
        maxX: pos.x + pos.width,
        maxY: pos.y + pos.height,
      },
      status: isDraft ? "draft" : "confirmed",
      draftGroupId,
      sourceStrokeIds: options.sourceStrokeIds,
      sourceBounds: options.sourceBounds,
      replaceSource: options.replaceSource,
      createdAt: now,
      version: 1,
    };
    shape.bounds = boundsOfShape(shape);
    shapes.push(shape);
    shapesMap.set(node.id, shape);
  }

  // 7. Build CanvasConnector objects
  const connectors: CanvasConnector[] = [];
  for (const edge of edges) {
    const srcShape = shapesMap.get(edge.from_node);
    const dstShape = shapesMap.get(edge.to_node);
    if (!srcShape || !dstShape) continue;

    let fromAnchor: ConnectorAnchor = "bottom";
    let toAnchor: ConnectorAnchor = "top";

    if (direction === "left_to_right") {
      fromAnchor = "right";
      toAnchor = "left";
    } else {
      // For top_to_bottom: if dst is on the same rank or higher Y, route horizontally
      const srcRank = ranks.get(edge.from_node) ?? 0;
      const dstRank = ranks.get(edge.to_node) ?? 0;
      if (srcRank === dstRank) {
        fromAnchor = srcShape.x < dstShape.x ? "right" : "left";
        toAnchor = srcShape.x < dstShape.x ? "left" : "right";
      }
    }

    const startPt = getAnchorPoint(srcShape, fromAnchor);
    const endPt = getAnchorPoint(dstShape, toAnchor);

    const connector: CanvasConnector = {
      id: generateId("conn"),
      type: "connector",
      startX: startPt.x,
      startY: startPt.y,
      endX: endPt.x,
      endY: endPt.y,
      fromId: edge.from_node,
      fromAnchor,
      toId: edge.to_node,
      toAnchor,
      routing: "orthogonal",
      strokeColor,
      strokeWidth: 2,
      startArrow: false,
      endArrow: true,
      label: edge.label || undefined,
      bounds: {
        minX: Math.min(startPt.x, endPt.x) - 10,
        minY: Math.min(startPt.y, endPt.y) - 10,
        maxX: Math.max(startPt.x, endPt.x) + 10,
        maxY: Math.max(startPt.y, endPt.y) + 10,
      },
      status: isDraft ? "draft" : "confirmed",
      draftGroupId,
      sourceStrokeIds: options.sourceStrokeIds,
      sourceBounds: options.sourceBounds,
      replaceSource: options.replaceSource,
      createdAt: now,
      version: 1,
    };
    connectors.push(connector);
  }

  // 8. Overall bounding box
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const s of shapes) {
    if (s.bounds.minX < minX) minX = s.bounds.minX;
    if (s.bounds.minY < minY) minY = s.bounds.minY;
    if (s.bounds.maxX > maxX) maxX = s.bounds.maxX;
    if (s.bounds.maxY > maxY) maxY = s.bounds.maxY;
  }

  return {
    shapes,
    connectors,
    bounds: {
      minX: minX === Infinity ? originX : minX,
      minY: minY === Infinity ? originY : minY,
      maxX: maxX === -Infinity ? originX + 200 : maxX,
      maxY: maxY === -Infinity ? originY + 200 : maxY,
    },
  };
}

function calculateNodeDimensions(
  label: string,
  shapeType: ShapeType
): { width: number; height: number } {
  const charCount = label.length;

  switch (shapeType) {
    case "diamond": {
      // Decision diamonds need wider proportions for inscribed text
      const w = Math.max(160, Math.min(260, 140 + charCount * 3.5));
      const h = Math.max(90, Math.min(150, 80 + Math.floor(charCount / 12) * 16));
      return { width: w, height: h };
    }
    case "rounded_rectangle": {
      const w = Math.max(140, Math.min(240, 120 + charCount * 3.2));
      const h = Math.max(50, Math.min(80, 48 + Math.floor(charCount / 20) * 14));
      return { width: w, height: h };
    }
    case "circle":
    case "ellipse": {
      const w = Math.max(130, Math.min(220, 110 + charCount * 3.5));
      const h = Math.max(70, Math.min(130, 60 + Math.floor(charCount / 15) * 14));
      return { width: w, height: h };
    }
    case "triangle": {
      const w = Math.max(150, Math.min(240, 130 + charCount * 3.5));
      const h = Math.max(100, Math.min(160, 90 + Math.floor(charCount / 12) * 15));
      return { width: w, height: h };
    }
    case "rectangle":
    default: {
      const w = Math.max(160, Math.min(260, 140 + charCount * 3.2));
      const h = Math.max(60, Math.min(100, 54 + Math.floor(charCount / 20) * 14));
      return { width: w, height: h };
    }
  }
}
