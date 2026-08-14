"""
Session-level KPI calculation, computed on demand from the in-memory
SessionStore (see trace.py) rather than stored incrementally, since a local
single-session dev tool never has enough records for this to be a
performance concern and computing on demand avoids any risk of the running
totals drifting from the underlying records.
"""

from __future__ import annotations

from app.config import Settings
from app.metrics.trace import TraceRecord
from app.schemas.response import SessionMetricsResponse

_WASTED_OUTCOMES = {"discarded", "cancelled", "superseded", "timeout", "error"}
_TERMINAL_FAILURE_OUTCOMES = {"error", "timeout"}


def compute_session_metrics(
    session_id: str, records: list[TraceRecord], settings: Settings
) -> SessionMetricsResponse:
    total = len(records)
    accepted = sum(1 for r in records if r.outcome == "accepted")
    discarded = sum(1 for r in records if r.outcome == "discarded")
    cancelled = sum(1 for r in records if r.outcome == "cancelled")
    superseded = sum(1 for r in records if r.outcome == "superseded")
    errors = sum(1 for r in records if r.outcome == "error")
    timeouts = sum(1 for r in records if r.outcome == "timeout")

    # DAR — Draft Acceptance Rate: accepted / returned drafts. "Returned"
    # means the model actually produced a draft the user could act on, i.e.
    # excludes requests that errored/timed out before a draft existed.
    returned = sum(1 for r in records if r.outcome not in _TERMINAL_FAILURE_OUTCOMES and r.outcome != "pending")
    dar = (accepted / returned) if returned > 0 else None

    total_tokens = sum(r.tokens.get("total") or 0 for r in records)
    wasted_tokens = sum(
        (r.tokens.get("total") or 0) for r in records if r.outcome in _WASTED_OUTCOMES
    )
    wtr = (wasted_tokens / total_tokens) if total_tokens > 0 else None

    budget = settings.latency_budget_ms
    successful = [r for r in records if r.outcome not in _TERMINAL_FAILURE_OUTCOMES and r.outcome != "cancelled"]
    within_budget = sum(
        1 for r in successful if (r.latency_ms.get("e2e") or float("inf")) <= budget
    )
    bc = (within_budget / len(successful)) if successful else None

    total_cost = sum(r.cost_usd for r in records)
    cpad = (total_cost / accepted) if accepted > 0 else None

    return SessionMetricsResponse(
        session_id=session_id,
        requests=total,
        accepted=accepted,
        discarded=discarded,
        cancelled=cancelled,
        superseded=superseded,
        errors=errors,
        timeouts=timeouts,
        dar=dar,
        wtr=wtr,
        bc=bc,
        cpad_usd=cpad,
        total_cost_usd=round(total_cost, 8),
        total_tokens=total_tokens,
    )
