import type { BoundingBox } from "../types/document";

/**
 * The only module that knows the backend's HTTP shape. Everything else
 * (the trigger hook, the metrics panel) calls these typed functions —
 * mirroring the backend's own MultimodalModel abstraction: one seam,
 * swappable later without touching callers.
 */

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

import type { ShapeType } from "../types/document";

export type DraftContentType = "markdown" | "latex" | "diagram" | "shape";

export interface DiagramNode {
  id: string;
  label: string;
  shape_type: ShapeType;
}

export interface DiagramEdge {
  from_node: string;
  to_node: string;
  label?: string;
}

export interface ShapeData {
  shape_type: ShapeType;
  label?: string;
}

export interface DraftContent {
  type: DraftContentType;
  content: string;
  title: string;
  confidence: number;
  layout_direction?: "top_to_bottom" | "left_to_right";
  nodes?: DiagramNode[];
  edges?: DiagramEdge[];
  shape?: ShapeData;
}

export interface LatencyBreakdown {
  t_capture: number | null;
  t_dispatch: number | null;
  ttfb: number | null;
  ttft: number | null;
  t_stream: number | null;
  t_render: number | null;
  e2e: number | null;
}

export interface TokenUsage {
  input_text: number | null;
  input_image: number | null;
  input_image_source: string;
  output: number | null;
  reasoning: number | null;
  cache_read: number | null;
  total: number | null;
}

export interface AnalyzeResponse {
  request_id: string;
  draft: DraftContent;
  model: string;
  provider: string;
  latency_ms: LatencyBreakdown;
  tokens: TokenUsage;
  cost_usd: number;
}

export type AnalyzeErrorCode =
  | "ollama_unavailable"
  | "model_unavailable"
  | "timeout"
  | "invalid_model_output"
  | "network_error"
  | "validation_error"
  | "internal_error";

export class AnalyzeApiError extends Error {
  code: AnalyzeErrorCode;
  requestId: string | null;
  constructor(code: AnalyzeErrorCode, message: string, requestId: string | null) {
    super(message);
    this.name = "AnalyzeApiError";
    this.code = code;
    this.requestId = requestId;
  }
}

export interface AnalyzeRequestPayload {
  requestId: string;
  imageBase64: string;
  format: "png" | "webp";
  worldBounds: BoundingBox;
  cropWidth: number;
  cropHeight: number;
  zoom: number;
  strokeCount: number;
  sessionId: string;
  trigger: "idle_pause" | "manual";
  canvasTexts?: string[];
  promptOverride?: string;
  tCaptureMs: number;
  tDispatchMs: number;
}

async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  const url = API_BASE_URL ? `${API_BASE_URL.replace(/\/$/, "")}${path}` : path;
  return await fetch(url, init);
}

export async function analyzeRegion(
  payload: AnalyzeRequestPayload,
  signal: AbortSignal
): Promise<AnalyzeResponse> {
  const body = {
    request_id: payload.requestId,
    image: payload.imageBase64,
    context: {
      world_bounds: {
        x: payload.worldBounds.minX,
        y: payload.worldBounds.minY,
        width: payload.worldBounds.maxX - payload.worldBounds.minX,
        height: payload.worldBounds.maxY - payload.worldBounds.minY,
      },
      crop_width: payload.cropWidth,
      crop_height: payload.cropHeight,
      zoom: payload.zoom,
      stroke_count: payload.strokeCount,
      format: payload.format,
      session_id: payload.sessionId,
      canvas_texts: payload.canvasTexts ?? [],
      t_capture_ms: payload.tCaptureMs,
      t_dispatch_ms: payload.tDispatchMs,
    },
    trigger: payload.trigger,
    ...(payload.promptOverride ? { prompt_override: payload.promptOverride } : {}),
  };

  let resp: Response;
  try {
    resp = await fetchApi("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new AnalyzeApiError("network_error", "Could not reach the AI backend.", payload.requestId);
  }

  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    const code: AnalyzeErrorCode = data?.error_code ?? "internal_error";
    const message: string = data?.message ?? `Request failed with status ${resp.status}.`;
    throw new AnalyzeApiError(code, message, data?.request_id ?? payload.requestId);
  }

  return data as AnalyzeResponse;
}

export type OutcomeType = "accepted" | "discarded" | "cancelled" | "superseded" | "error" | "timeout";

const reportedOutcomes = new Set<string>();

export async function reportOutcome(requestId: string, outcome: OutcomeType): Promise<void> {
  const key = `${requestId}:${outcome}`;
  if (reportedOutcomes.has(key)) return;
  reportedOutcomes.add(key);

  try {
    await fetchApi("/api/metrics/outcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id: requestId, outcome }),
    });
  } catch {
    // Outcome reporting is best-effort metrics plumbing — never block or
    // surface an error to the user over a failed metrics call.
  }
}

export interface SessionMetrics {
  session_id: string;
  requests: number;
  accepted: number;
  discarded: number;
  cancelled: number;
  superseded: number;
  errors: number;
  timeouts: number;
  dar: number | null;
  wtr: number | null;
  bc: number | null;
  cpad_usd: number | null;
  total_cost_usd: number;
  total_tokens: number;
}

export async function fetchSessionMetrics(sessionId: string): Promise<SessionMetrics | null> {
  try {
    const resp = await fetchApi(
      `/api/metrics/session?session_id=${encodeURIComponent(sessionId)}`
    );
    if (!resp.ok) return null;
    return (await resp.json()) as SessionMetrics;
  } catch {
    return null;
  }
}

export interface HealthStatus {
  status: "ok" | "degraded";
  ollama: boolean;
  model: string;
  model_installed: boolean;
}

export async function fetchHealth(): Promise<HealthStatus | null> {
  try {
    const resp = await fetchApi("/health");
    if (!resp.ok) return null;
    return (await resp.json()) as HealthStatus;
  } catch {
    return null;
  }
}

