from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.metrics.kpi import compute_session_metrics
from app.metrics.trace import TraceRecord, append_trace_line, get_session_store, now_iso
from app.schemas.request import OutcomeRequest
from app.schemas.response import SessionMetricsResponse

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.get("/session", response_model=SessionMetricsResponse)
async def session_metrics(
    session_id: str, settings: Settings = Depends(get_settings)
) -> SessionMetricsResponse:
    records = get_session_store().records_for_session(session_id)
    return compute_session_metrics(session_id, records, settings)


@router.post("/outcome")
async def report_outcome(
    body: OutcomeRequest, settings: Settings = Depends(get_settings)
) -> dict:
    store = get_session_store()
    record = store.find_by_request_id(body.request_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Unknown request_id — was /api/analyze called first?")

    updated = store.set_outcome(record.session_id, body.request_id, body.outcome.value)
    assert updated is not None  # find_by_request_id already confirmed it exists

    # Append a correction line to the JSONL trace with the final outcome —
    # see trace.py's module docstring for why this is two lines, not a
    # rewritten one.
    outcome_line = TraceRecord(
        request_id=updated.request_id,
        session_id=updated.session_id,
        ts_start=now_iso(),
        trigger=updated.trigger,
        provider=updated.provider,
        model=updated.model,
        config_id=updated.config_id,
        input=updated.input,
        latency_ms=updated.latency_ms,
        tokens=updated.tokens,
        cost_usd=updated.cost_usd,
        outcome=body.outcome.value,
        error=updated.error,
        retries=updated.retries,
    )
    append_trace_line(outcome_line, settings)

    return {"request_id": body.request_id, "outcome": body.outcome.value}
