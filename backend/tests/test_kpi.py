from __future__ import annotations

from app.config import Settings
from app.metrics.kpi import compute_session_metrics
from app.metrics.trace import TraceRecord


def _record(request_id: str, outcome: str, *, total_tokens: int = 100, e2e_ms: float = 1000, cost: float = 0.0) -> TraceRecord:
    return TraceRecord(
        request_id=request_id,
        session_id="ses_1",
        ts_start="2026-01-01T00:00:00Z",
        trigger="manual",
        provider="ollama",
        model="qwen3-vl:8b",
        config_id="cfg_webp_1024",
        input={},
        latency_ms={"e2e": e2e_ms},
        tokens={"total": total_tokens},
        cost_usd=cost,
        outcome=outcome,
    )


def test_dar_counts_accepted_over_returned_drafts():
    settings = Settings()
    records = [
        _record("r1", "accepted"),
        _record("r2", "accepted"),
        _record("r3", "discarded"),
        _record("r4", "error"),  # excluded from "returned" — never produced a draft
    ]
    metrics = compute_session_metrics("ses_1", records, settings)
    assert metrics.requests == 4
    assert metrics.accepted == 2
    # returned = accepted + discarded (error excluded) = 3
    assert metrics.dar == 2 / 3


def test_dar_is_none_when_no_drafts_returned():
    settings = Settings()
    records = [_record("r1", "error"), _record("r2", "timeout")]
    metrics = compute_session_metrics("ses_1", records, settings)
    assert metrics.dar is None


def test_wtr_ratio_of_wasted_to_total_tokens():
    settings = Settings()
    records = [
        _record("r1", "accepted", total_tokens=100),
        _record("r2", "discarded", total_tokens=50),
        _record("r3", "cancelled", total_tokens=25),
    ]
    metrics = compute_session_metrics("ses_1", records, settings)
    # wasted = discarded + cancelled = 75, total = 175
    assert metrics.wtr == 75 / 175


def test_budget_compliance_fraction_within_budget():
    settings = Settings(latency_budget_ms=1000)
    records = [
        _record("r1", "accepted", e2e_ms=500),
        _record("r2", "accepted", e2e_ms=1500),
        _record("r3", "discarded", e2e_ms=900),
    ]
    metrics = compute_session_metrics("ses_1", records, settings)
    # 2 of 3 successful requests within the 1000ms budget
    assert metrics.bc == 2 / 3


def test_cpad_cost_per_accepted_draft():
    settings = Settings()
    records = [
        _record("r1", "accepted", cost=0.02),
        _record("r2", "accepted", cost=0.04),
        _record("r3", "discarded", cost=0.01),
    ]
    metrics = compute_session_metrics("ses_1", records, settings)
    assert metrics.total_cost_usd == 0.07
    assert metrics.cpad_usd == 0.07 / 2


def test_cpad_is_none_with_no_accepted_drafts():
    settings = Settings()
    records = [_record("r1", "discarded")]
    metrics = compute_session_metrics("ses_1", records, settings)
    assert metrics.cpad_usd is None


def test_empty_session_returns_zeroed_metrics():
    settings = Settings()
    metrics = compute_session_metrics("ses_empty", [], settings)
    assert metrics.requests == 0
    assert metrics.dar is None
    assert metrics.wtr is None
    assert metrics.bc is None
    assert metrics.cpad_usd is None
