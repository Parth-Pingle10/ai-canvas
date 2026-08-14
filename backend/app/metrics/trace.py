"""
JSONL tracing + in-memory session aggregation.

Every request appends a line to traces/traces.jsonl. Because a request's
final *outcome* (accepted/discarded/cancelled/...) is only known after the
frontend user acts on the draft — which happens well after the HTTP request
that produced it has already returned — a single request produces two trace
lines over its lifetime:

  1. On response (success or error): the full record with outcome="pending"
     (or a terminal outcome like "error"/"timeout" if the request itself
     failed — those never go through the accept/discard flow).
  2. On POST /api/metrics/outcome: a second line with the same request_id
     and the final outcome, once the frontend reports what the user did.

Consumers should treat the *last* line for a given request_id as the source
of truth — this module also keeps an in-memory index for exactly that
purpose, which is what GET /api/metrics/session reads from (re-reading and
folding the whole JSONL file on every metrics request would be needlessly
slow and is unnecessary for a single local backend process).
"""

from __future__ import annotations

import json
import threading
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.config import Settings

_TRACE_FILENAME = "traces.jsonl"


@dataclass
class TraceRecord:
    request_id: str
    session_id: str
    ts_start: str
    trigger: str
    provider: str
    model: str
    config_id: str
    input: dict
    latency_ms: dict
    tokens: dict
    cost_usd: float
    outcome: str
    error: str | None = None
    retries: int = 0


class SessionStore:
    """In-memory, process-local store of trace records grouped by session.
    Intentionally not persisted beyond the JSONL file — a restart losing
    live session counters is an acceptable tradeoff for a local dev tool;
    the JSONL file remains the durable record."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._records: dict[str, dict[str, TraceRecord]] = {}  # session_id -> request_id -> record

    def upsert(self, record: TraceRecord) -> None:
        with self._lock:
            self._records.setdefault(record.session_id, {})[record.request_id] = record

    def set_outcome(self, session_id: str, request_id: str, outcome: str) -> TraceRecord | None:
        with self._lock:
            session = self._records.get(session_id)
            if not session or request_id not in session:
                return None
            session[request_id].outcome = outcome
            return session[request_id]

    def find_by_request_id(self, request_id: str) -> TraceRecord | None:
        with self._lock:
            for session in self._records.values():
                if request_id in session:
                    return session[request_id]
        return None

    def records_for_session(self, session_id: str) -> list[TraceRecord]:
        with self._lock:
            return list(self._records.get(session_id, {}).values())


_store = SessionStore()


def get_session_store() -> SessionStore:
    return _store


def append_trace_line(record: TraceRecord, settings: Settings) -> None:
    path: Path = settings.traces_path / _TRACE_FILENAME
    line = json.dumps(asdict(record), default=str)
    with path.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
