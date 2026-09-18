from __future__ import annotations

import time
from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/laser", tags=["laser"])


class LaserPoint(BaseModel):
    x: float
    y: float
    timestamp: Optional[float] = Field(default_factory=time.time)


class LaserTrailRequest(BaseModel):
    id: str
    points: List[LaserPoint]
    color: str = "#ff2a5f"
    width: float = 5.0
    duration_ms: int = 3000


class LaserTrailResponse(BaseModel):
    id: str
    status: str = "ok"
    expires_at: float
    duration_ms: int = 3000


@router.post("/ping", response_model=LaserTrailResponse)
async def broadcast_laser_trail(trail: LaserTrailRequest) -> LaserTrailResponse:
    """Receives active laser pointer trail data and computes expiration lifecycle."""
    now = time.time()
    expires_at = now + (trail.duration_ms / 1000.0)
    return LaserTrailResponse(
        id=trail.id,
        status="ok",
        expires_at=expires_at,
        duration_ms=trail.duration_ms,
    )
