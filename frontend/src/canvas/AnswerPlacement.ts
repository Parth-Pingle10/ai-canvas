import type { BoundingBox, CanvasConnector, CanvasShape, CanvasText, Stroke } from "../types/document";
import { boundsIntersect, boundsWidth, boundsHeight } from "./CoordinateSystem";
import { generateId } from "../utils/id";

export interface PlaceAnswerOptions {
  answerText: string;
  sourceBounds: BoundingBox;
  sourceText?: string;
  sourceStrokeIds?: string[];
  cameraZoom: number;
  viewportWidth: number;
  viewportHeight: number;
  existingStrokes?: Stroke[];
  existingShapes?: CanvasShape[];
  existingConnectors?: CanvasConnector[];
  existingTexts?: CanvasText[];
  draftGroupId?: string;
}

export interface PlacedAnswerResult {
  textObject: CanvasText;
  bounds: BoundingBox;
  placementKind: "inline_question_mark" | "under_question" | "side_whitespace";
}

/**
 * Cleanly formats and wraps plain text for whiteboard legibility.
 */
export function formatAnswerText(text: string): string {
  if (!text) return "";
  // Strip unnecessary markdown code block wrappers if any
  let cleaned = text.trim();
  if (cleaned.startsWith("```") && cleaned.endsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }
  return cleaned;
}

/**
 * Wraps text into lines that fit within a maximum world width.
 */
export function wrapTextToWidth(
  text: string,
  maxCharsPerLine = 48
): { lines: string[]; maxLineLength: number } {
  const rawLines = text.split("\n");
  const resultLines: string[] = [];

  for (const rawLine of rawLines) {
    if (rawLine.length <= maxCharsPerLine) {
      resultLines.push(rawLine);
      continue;
    }

    const words = rawLine.split(" ");
    let currentLine = "";

    for (const word of words) {
      if ((currentLine + " " + word).trim().length <= maxCharsPerLine) {
        currentLine = (currentLine + " " + word).trim();
      } else {
        if (currentLine) resultLines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) resultLines.push(currentLine);
  }

  const maxLineLength = Math.max(...resultLines.map((l) => l.length), 1);
  return { lines: resultLines, maxLineLength };
}

/**
 * Determines whether the source represents a question ending in a literal question mark.
 */
export function hasTrailingQuestionMark(sourceText?: string): boolean {
  if (!sourceText) return false;
  const trimmed = sourceText.trim();
  return trimmed.endsWith("?") || trimmed.endsWith("? ");
}

/**
 * Determines optimal placement and text sizing for an AI answer relative to the source question.
 */
export function placeAnswerRelativeToQuestion(options: PlaceAnswerOptions): PlacedAnswerResult {
  const {
    answerText,
    sourceBounds,
    sourceText,
    sourceStrokeIds = [],
    cameraZoom,
    existingStrokes = [],
    existingShapes = [],
    existingConnectors = [],
    existingTexts = [],
    draftGroupId = generateId("draft_grp"),
  } = options;

  const cleanedText = formatAnswerText(answerText);
  const isTrailingQuestion = hasTrailingQuestionMark(sourceText);

  // Derive readable font size based on camera perspective and source bounds
  const sourceH = boundsHeight(sourceBounds);
  let fontSize = 20;
  if (sourceH > 10 && sourceH < 50) {
    fontSize = Math.max(16, Math.min(26, Math.round(sourceH * 0.75)));
  } else {
    // Adapt to current perspective: ~18-22px world space
    fontSize = Math.max(16, Math.min(24, Math.round(20 / Math.max(0.5, Math.min(1.5, cameraZoom)))));
  }

  // Wrap text appropriately
  const isShortAnswer = cleanedText.length < 40 && !cleanedText.includes("\n");
  const maxChars = isShortAnswer ? 50 : 42;
  const { lines, maxLineLength } = wrapTextToWidth(cleanedText, maxChars);
  const formattedText = lines.join("\n");

  const charWidthFactor = 0.62;
  const lineHeightFactor = 1.35;
  const textWidth = Math.max(40, Math.round(maxLineLength * fontSize * charWidthFactor + 16));
  const textHeight = Math.max(24, Math.round(lines.length * fontSize * lineHeightFactor + 8));

  // Collect existing obstacle bounding boxes for collision avoidance
  const obstacles: BoundingBox[] = [
    ...existingStrokes.map((s) => s.bounds),
    ...existingShapes.filter((sh) => !sh.draftGroupId || sh.status === "confirmed").map((sh) => sh.bounds),
    ...existingConnectors.filter((c) => !c.draftGroupId || c.status === "confirmed").map((c) => c.bounds),
    ...existingTexts.filter((t) => !t.draftGroupId || t.status === "confirmed").map((t) => t.bounds),
  ];

  // Preferred Placements
  let targetX = sourceBounds.minX;
  let targetY = sourceBounds.maxY + 14;
  let placementKind: PlacedAnswerResult["placementKind"] = "under_question";

  if (isTrailingQuestion && isShortAnswer) {
    // Try inline placement to the right of the question mark
    const inlineX = sourceBounds.maxX + 14;
    const inlineY = sourceBounds.minY + Math.max(0, (sourceH - textHeight) / 2);
    const inlineBounds: BoundingBox = {
      minX: inlineX,
      minY: inlineY,
      maxX: inlineX + textWidth,
      maxY: inlineY + textHeight,
    };

    const collides = obstacles.some((obs) => boundsIntersect(obs, inlineBounds));
    if (!collides) {
      targetX = inlineX;
      targetY = inlineY;
      placementKind = "inline_question_mark";
    }
  }

  if (placementKind !== "inline_question_mark") {
    // Placement directly under question
    targetX = sourceBounds.minX;
    targetY = sourceBounds.maxY + 14;

    const underBounds: BoundingBox = {
      minX: targetX,
      minY: targetY,
      maxX: targetX + textWidth,
      maxY: targetY + textHeight,
    };

    const collides = obstacles.some((obs) => boundsIntersect(obs, underBounds));
    if (collides) {
      // Try side whitespace to the right
      const sideX = sourceBounds.maxX + 20;
      const sideY = sourceBounds.minY;
      const sideBounds: BoundingBox = {
        minX: sideX,
        minY: sideY,
        maxX: sideX + textWidth,
        maxY: sideY + textHeight,
      };

      const sideCollides = obstacles.some((obs) => boundsIntersect(obs, sideBounds));
      if (!sideCollides) {
        targetX = sideX;
        targetY = sideY;
        placementKind = "side_whitespace";
      } else {
        // Offset further down below the obstacle
        const maxObstacleBottom = Math.max(
          ...obstacles
            .filter((obs) => boundsIntersect(obs, underBounds))
            .map((obs) => obs.maxY),
          sourceBounds.maxY
        );
        targetY = maxObstacleBottom + 16;
        placementKind = "under_question";
      }
    }
  }

  const bounds: BoundingBox = {
    minX: targetX,
    minY: targetY,
    maxX: targetX + textWidth,
    maxY: targetY + textHeight,
  };

  const textObject: CanvasText = {
    id: generateId("text_ai"),
    type: "text",
    x: targetX,
    y: targetY,
    width: textWidth,
    height: textHeight,
    text: formattedText,
    fontSize,
    fontColor: "#1e1e1e",
    fontFamily: '"Trebuchet MS", "Lucida Sans Unicode", "Segoe UI", sans-serif',
    fontWeight: "600",
    align: "left",
    bounds,
    status: "draft",
    draftGroupId,
    sourceStrokeIds,
    sourceBounds,
    createdAt: Date.now(),
    version: 1,
  };

  return {
    textObject,
    bounds,
    placementKind,
  };
}
