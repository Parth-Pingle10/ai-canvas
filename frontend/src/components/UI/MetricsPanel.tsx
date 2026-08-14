import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useMetricsStore } from "../../state/metricsStore";
import { fetchSessionMetrics, type SessionMetrics } from "../../ai/apiClient";
import "./MetricsPanel.css";

interface MetricsPanelProps {
  onClose: () => void;
}

const POLL_INTERVAL_MS = 3000;

/**
 * Polls GET /api/metrics/session on a slow interval rather than after every
 * outcome — outcome-reporting is fire-and-forget from the UI's perspective,
 * and a 3s poll is imperceptible lag for a metrics readout while adding
 * zero risk of this panel causing canvas jank (it never touches the canvas
 * render loop at all).
 */
export function MetricsPanel({ onClose }: MetricsPanelProps) {
  const sessionId = useMetricsStore((s) => s.sessionId);
  const lastRequest = useMetricsStore((s) => s.lastRequest);
  const localCounts = useMetricsStore((s) => ({
    requests: s.requestCount,
    accepted: s.acceptedCount,
    discarded: s.discardedCount,
    cancelled: s.cancelledCount,
    superseded: s.supersededCount,
    errors: s.errorCount,
  }));

  const [sessionMetrics, setSessionMetrics] = useState<SessionMetrics | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const m = await fetchSessionMetrics(sessionId);
      if (!cancelled && m) setSessionMetrics(m);
    };
    void poll();
    const id = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [sessionId]);

  return (
    <div className="metrics-panel">
      <div className="metrics-panel__header">
        <h3>AI Metrics</h3>
        <button type="button" className="metrics-panel__close" onClick={onClose} aria-label="Close">
          <X size={15} />
        </button>
      </div>

      <section className="metrics-panel__section">
        <h4>Last Request</h4>
        {lastRequest ? (
          <div className="metrics-panel__grid">
            <Row label="Capture" value={fmtMs(lastRequest.latencyMs.t_capture)} />
            <Row label="Dispatch" value={fmtMs(lastRequest.latencyMs.t_dispatch)} />
            <Row label="TTFT" value={fmtMs(lastRequest.latencyMs.ttft)} />
            <Row label="E2E" value={fmtMs(lastRequest.latencyMs.e2e)} />
            <Row label="Input tokens" value={fmtNum(lastRequest.tokens.input_text)} />
            <Row label="Output tokens" value={fmtNum(lastRequest.tokens.output)} />
            <Row label="Total tokens" value={fmtNum(lastRequest.tokens.total)} />
            <Row label="Cost (local)" value="$0.00" />
            <Row label="Cost (notional)" value={`$${lastRequest.costUsd.toFixed(4)}`} />
            <Row label="Model" value={lastRequest.model} />
          </div>
        ) : (
          <p className="metrics-panel__empty">No requests yet this session.</p>
        )}
      </section>

      <section className="metrics-panel__section">
        <h4>Session</h4>
        <div className="metrics-panel__grid">
          <Row label="Requests" value={String(localCounts.requests)} />
          <Row label="Accepted" value={String(localCounts.accepted)} />
          <Row label="Discarded" value={String(localCounts.discarded)} />
          <Row label="Cancelled" value={String(localCounts.cancelled)} />
          <Row label="Superseded" value={String(localCounts.superseded)} />
          <Row label="Errors" value={String(localCounts.errors)} />
        </div>
      </section>

      <section className="metrics-panel__section">
        <h4>KPIs (server-computed)</h4>
        {sessionMetrics ? (
          <div className="metrics-panel__grid">
            <Row label="DAR" value={fmtPct(sessionMetrics.dar)} title="Draft Acceptance Rate" />
            <Row label="WTR" value={fmtPct(sessionMetrics.wtr)} title="Wasted Token Ratio" />
            <Row label="BC" value={fmtPct(sessionMetrics.bc)} title="Budget Compliance" />
            <Row
              label="CPAD"
              value={sessionMetrics.cpad_usd != null ? `$${sessionMetrics.cpad_usd.toFixed(4)}` : "—"}
              title="Cost Per Accepted Draft (notional)"
            />
          </div>
        ) : (
          <p className="metrics-panel__empty">Waiting for the backend…</p>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="metrics-panel__row" title={title}>
      <span className="metrics-panel__label">{label}</span>
      <span className="metrics-panel__value">{value}</span>
    </div>
  );
}

function fmtMs(v: number | null | undefined): string {
  if (v == null) return "—";
  return v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(2)} s`;
}

function fmtNum(v: number | null | undefined): string {
  return v == null ? "—" : String(v);
}

function fmtPct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}
