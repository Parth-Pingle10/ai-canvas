import {
  type CanvasDocument,
  type Stroke,
  DOCUMENT_VERSION,
} from "../types/document";
import { boundsOfPoints } from "../canvas/CoordinateSystem";

export class DocumentParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentParseError";
  }
}

export class UnsupportedVersionError extends Error {
  foundVersion: number;
  constructor(foundVersion: number) {
    super(
      `This file was saved with document format v${foundVersion}, which this app version (v${DOCUMENT_VERSION}) doesn't support.`
    );
    this.name = "UnsupportedVersionError";
    this.foundVersion = foundVersion;
  }
}

export function serializeDocument(doc: CanvasDocument): string {
  return JSON.stringify(doc, null, 2);
}

/**
 * Parses and validates a canvas document from raw JSON text. Throws a
 * specific, catchable error for each failure mode so the UI can show an
 * honest, non-blocking message instead of a silent failure or crash.
 */
export function deserializeDocument(raw: string): CanvasDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DocumentParseError("This file isn't valid JSON — it may be corrupted.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new DocumentParseError("This file doesn't contain a canvas document.");
  }

  const doc = parsed as Partial<CanvasDocument>;

  if (typeof doc.version !== "number") {
    throw new DocumentParseError("This file is missing a document version.");
  }
  if (doc.version !== DOCUMENT_VERSION) {
    throw new UnsupportedVersionError(doc.version);
  }
  if (!Array.isArray(doc.strokes)) {
    throw new DocumentParseError("This file's stroke data is malformed.");
  }
  if (!doc.camera || typeof doc.camera.x !== "number") {
    throw new DocumentParseError("This file's camera data is malformed.");
  }

  // Recompute bounds defensively rather than trusting cached values from disk.
  const strokes: Stroke[] = doc.strokes.map((s) => normalizeStroke(s as Stroke));
  const aiObjects = Array.isArray(doc.aiObjects) ? doc.aiObjects.map(normalizeAiObject) : [];

  return {
    version: doc.version,
    canvas: { name: doc.canvas?.name ?? "Untitled" },
    camera: doc.camera,
    strokes,
    aiObjects,
    createdAt: doc.createdAt ?? Date.now(),
    updatedAt: doc.updatedAt ?? Date.now(),
  };
}

function normalizeStroke(s: Stroke): Stroke {
  if (!s || !Array.isArray(s.points)) {
    throw new DocumentParseError("This file contains an invalid stroke.");
  }
  return { ...s, bounds: boundsOfPoints(s.points) };
}

function normalizeAiObject(o: unknown): NonNullable<CanvasDocument["aiObjects"]>[number] {
  const obj = o as Record<string, unknown>;
  if (
    !obj ||
    typeof obj.id !== "string" ||
    typeof obj.bounds !== "object" ||
    obj.bounds === null
  ) {
    throw new DocumentParseError("This file contains an invalid AI object.");
  }
  return obj as unknown as NonNullable<CanvasDocument["aiObjects"]>[number];
}

const AUTOSAVE_KEY = "ai-canvas:autosave";

export function autosaveToLocalStorage(doc: CanvasDocument): boolean {
  try {
    window.localStorage.setItem(AUTOSAVE_KEY, serializeDocument(doc));
    return true;
  } catch {
    return false;
  }
}

export function loadAutosaveFromLocalStorage(): CanvasDocument | null {
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    return deserializeDocument(raw);
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try {
    window.localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Ignore — nothing meaningful to recover from here.
  }
}
