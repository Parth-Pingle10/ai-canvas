import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { useCanvasStore } from "../../state/canvasStore";
import { useMetricsStore } from "../../state/metricsStore";
import { reportOutcome } from "../../ai/apiClient";
import "./AiStatusBadge.css";

export type AiStatusState = "idle" | "analyzing" | "success" | "fallback" | "error";

export function AiStatusBadge() {
  const pendingRequests = useCanvasStore((s) => s.pendingRequests);
  const cancelPendingRequest = useCanvasStore((s) => s.cancelPendingRequest);
  const recordOutcome = useMetricsStore((s) => s.recordOutcome);

  const [lastSuccessTime, setLastSuccessTime] = useState<number | null>(null);
  const [prevPendingCount, setPrevPendingCount] = useState(0);

  const hasPending = pendingRequests.length > 0;
  const currentReq = pendingRequests[0];

  useEffect(() => {
    if (prevPendingCount > 0 && pendingRequests.length === 0) {
      // Just completed
      setLastSuccessTime(Date.now());
      const timer = setTimeout(() => setLastSuccessTime(null), 2500);
      return () => clearTimeout(timer);
    }
    setPrevPendingCount(pendingRequests.length);
  }, [pendingRequests.length, prevPendingCount]);

  const showSuccess = !hasPending && lastSuccessTime !== null && Date.now() - lastSuccessTime < 2500;

  if (!hasPending && !showSuccess) {
    return null;
  }

  const handleCancel = () => {
    if (currentReq) {
      cancelPendingRequest(currentReq.id);
      recordOutcome("cancelled");
      void reportOutcome(currentReq.id, "cancelled");
    }
  };

  return (
    <div className="ai-status-badge" aria-live="assertive">
      <div
        className={`ai-status-badge__pill ${
          hasPending ? "ai-status-badge__pill--active" : "ai-status-badge__pill--success"
        }`}
      >
        {hasPending ? (
          <>
            <Loader2 size={14} className="ai-status-badge__spinner" />
            <span className="ai-status-badge__text">Analyzing canvas…</span>
            <button
              type="button"
              className="ai-status-badge__cancel-btn"
              onClick={handleCancel}
              title="Cancel analysis"
              aria-label="Cancel analysis"
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <>
            <Check size={14} className="ai-status-badge__icon--check" />
            <span className="ai-status-badge__text">AI response ready</span>
          </>
        )}
      </div>
    </div>
  );
}
