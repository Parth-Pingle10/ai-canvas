"""Response schemas returned by the API."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class DraftContentType(str, Enum):
    markdown = "markdown"
    latex = "latex"


class DraftContent(BaseModel):
    """The structured payload the model must produce. Validated against this
    schema in api/analyze.py before it's ever sent back to the frontend —
    an unparseable or non-conforming model response never reaches the canvas
    as-is (see ai/ollama.py's recovery/error handling)."""

    type: DraftContentType
    content: str
    title: str = ""
    confidence: float = Field(ge=0, le=1)


class TokenUsage(BaseModel):
    input_text: int | None = None
    input_image: int | None = None
    input_image_source: str = "not_reported"  # "provider_reported" | "estimated" | "not_reported"
    output: int | None = None
    reasoning: int | None = None
    cache_read: int | None = None
    total: int | None = None


class LatencyBreakdown(BaseModel):
    t_capture: float | None = None
    t_dispatch: float | None = None
    ttfb: float | None = None
    ttft: float | None = None
    t_stream: float | None = None
    t_render: float | None = None
    e2e: float | None = None


class AnalyzeResponse(BaseModel):
    request_id: str
    draft: DraftContent
    model: str
    provider: str
    latency_ms: LatencyBreakdown
    tokens: TokenUsage
    cost_usd: float


class AnalyzeErrorCode(str, Enum):
    ollama_unavailable = "ollama_unavailable"
    model_unavailable = "model_unavailable"
    timeout = "timeout"
    invalid_model_output = "invalid_model_output"
    network_error = "network_error"
    validation_error = "validation_error"
    internal_error = "internal_error"


class AnalyzeErrorResponse(BaseModel):
    request_id: str | None = None
    error_code: AnalyzeErrorCode
    message: str


class HealthResponse(BaseModel):
    status: str  # "ok" | "degraded"
    ollama: bool
    model: str
    model_installed: bool


class SessionMetricsResponse(BaseModel):
    session_id: str
    requests: int
    accepted: int
    discarded: int
    cancelled: int
    superseded: int
    errors: int
    timeouts: int
    dar: float | None  # Draft Acceptance Rate
    wtr: float | None  # Wasted Token Ratio
    bc: float | None  # Budget Compliance
    cpad_usd: float | None  # Cost Per Accepted Draft
    total_cost_usd: float
    total_tokens: int
