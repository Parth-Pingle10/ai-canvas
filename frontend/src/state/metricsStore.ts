import { create } from "zustand";
import type { AnalyzeResponse } from "../ai/apiClient";

interface LastRequestMetrics {
  requestId: string;
  latencyMs: AnalyzeResponse["latency_ms"];
  tokens: AnalyzeResponse["tokens"];
  costUsd: number;
  model: string;
}

interface MetricsState {
  sessionId: string;
  lastRequest: LastRequestMetrics | null;
  requestCount: number;
  acceptedCount: number;
  discardedCount: number;
  cancelledCount: number;
  supersededCount: number;
  errorCount: number;

  recordRequestSent: () => void;
  recordRequestResult: (result: LastRequestMetrics) => void;
  recordOutcome: (outcome: "accepted" | "discarded" | "cancelled" | "superseded" | "error") => void;
  reset: () => void;
}

function generateSessionId(): string {
  return `ses_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export const useMetricsStore = create<MetricsState>((set) => ({
  sessionId: generateSessionId(),
  lastRequest: null,
  requestCount: 0,
  acceptedCount: 0,
  discardedCount: 0,
  cancelledCount: 0,
  supersededCount: 0,
  errorCount: 0,

  recordRequestSent: () => set((s) => ({ requestCount: s.requestCount + 1 })),

  recordRequestResult: (result) => set({ lastRequest: result }),

  recordOutcome: (outcome) =>
    set((s) => {
      switch (outcome) {
        case "accepted":
          return { acceptedCount: s.acceptedCount + 1 };
        case "discarded":
          return { discardedCount: s.discardedCount + 1 };
        case "cancelled":
          return { cancelledCount: s.cancelledCount + 1 };
        case "superseded":
          return { supersededCount: s.supersededCount + 1 };
        case "error":
          return { errorCount: s.errorCount + 1 };
        default:
          return {};
      }
    }),

  reset: () =>
    set({
      lastRequest: null,
      requestCount: 0,
      acceptedCount: 0,
      discardedCount: 0,
      cancelledCount: 0,
      supersededCount: 0,
      errorCount: 0,
    }),
}));
