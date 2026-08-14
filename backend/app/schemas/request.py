"""
Request schemas for POST /api/analyze. Every field the frontend sends is
validated here — no arbitrary/unvalidated JSON reaches the model adapter.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, field_validator


class TriggerType(str, Enum):
    idle_pause = "idle_pause"
    manual = "manual"


class ImageFormat(str, Enum):
    webp = "webp"
    png = "png"


class WorldBounds(BaseModel):
    """World-space rectangle the image was rasterized from (matches the
    frontend's BoundingBox-derived region, converted to x/y/width/height)."""

    x: float
    y: float
    width: float = Field(gt=0)
    height: float = Field(gt=0)


class AnalyzeContext(BaseModel):
    world_bounds: WorldBounds
    crop_width: int = Field(gt=0, le=8192)
    crop_height: int = Field(gt=0, le=8192)
    zoom: float = Field(gt=0)
    stroke_count: int = Field(ge=0)
    format: ImageFormat = ImageFormat.webp
    session_id: str = Field(min_length=1, max_length=128)
    # Client-measured timing marks, forwarded so the backend's trace can
    # report an accurate end-to-end figure without re-deriving t_capture.
    t_capture_ms: float | None = Field(default=None, ge=0)
    t_dispatch_ms: float | None = Field(default=None, ge=0)


class AnalyzeRequest(BaseModel):
    request_id: str = Field(min_length=1, max_length=128)
    image: str = Field(min_length=1, description="Base64-encoded image bytes, no data: URI prefix")
    context: AnalyzeContext
    trigger: TriggerType
    prompt_override: str | None = Field(default=None, max_length=2000)

    @field_validator("image")
    @classmethod
    def image_must_look_like_base64(cls, v: str) -> str:
        # Reject an obviously-not-base64 payload cheaply, before we even try
        # to decode it (real decoding/validation happens in api/analyze.py,
        # where we also know the declared format to cross-check magic bytes).
        if v.startswith("data:"):
            raise ValueError("image must be raw base64, not a data: URI")
        if len(v) < 16:
            raise ValueError("image payload is too short to be a real image")
        return v


class OutcomeType(str, Enum):
    accepted = "accepted"
    discarded = "discarded"
    cancelled = "cancelled"
    superseded = "superseded"
    error = "error"
    timeout = "timeout"


class OutcomeRequest(BaseModel):
    request_id: str = Field(min_length=1, max_length=128)
    outcome: OutcomeType
