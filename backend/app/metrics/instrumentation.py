"""
Small timing helper used by the analyze route to build the latency_ms
breakdown documented in the assignment brief:

  t_capture   — measured client-side (frontend rasterization time), passed
                through in the request context, not measured here.
  t_dispatch  — measured client-side (time from idle-trigger to request
                sent), also passed through.
  ttfb/ttft/t_stream — reported by the provider adapter (see ai/ollama.py).
  t_render    — measured client-side after the draft is placed on canvas;
                the frontend reports this back via POST /api/metrics/outcome
                is NOT where this belongs (that's outcome, not timing) — see
                docs/METRICS.md for the honest accounting of what the server
                can and cannot measure.
  e2e         — measured here: wall-clock time for the whole /api/analyze
                request, from the moment FastAPI starts handling it to the
                moment the response is about to be returned.
"""

from __future__ import annotations

import time
from contextlib import contextmanager
from dataclasses import dataclass, field


@dataclass
class Stopwatch:
    """A simple perf_counter-based stopwatch. `elapsed_ms()` can be called
    repeatedly to get a running total without stopping the clock."""

    _start: float = field(default_factory=time.perf_counter)

    def elapsed_ms(self) -> float:
        return (time.perf_counter() - self._start) * 1000


@contextmanager
def measure_ms():
    """Context manager yielding a callable that returns elapsed ms so far.
    Usage:
        with measure_ms() as elapsed:
            ...
            duration = elapsed()
    """
    sw = Stopwatch()
    yield sw.elapsed_ms
