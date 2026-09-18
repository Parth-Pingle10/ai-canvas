import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeRegion, AnalyzeApiError, reportOutcome } from "../ai/apiClient";

function payload(overrides: Partial<Parameters<typeof analyzeRegion>[0]> = {}) {
  return {
    requestId: "req_1",
    imageBase64: "aGVsbG8=",
    format: "png" as const,
    worldBounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    cropWidth: 64,
    cropHeight: 48,
    zoom: 1,
    strokeCount: 2,
    sessionId: "ses_1",
    trigger: "manual" as const,
    tCaptureMs: 5,
    tDispatchMs: 2,
    ...overrides,
  };
}

describe("analyzeRegion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves with the parsed response on a 200", async () => {
    const mockResponse = {
      request_id: "req_1",
      draft: { type: "markdown", content: "hi", title: "T", confidence: 0.5 },
      model: "qwen3-vl:8b",
      provider: "ollama",
      latency_ms: {},
      tokens: {},
      cost_usd: 0,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })
    );

    const result = await analyzeRegion(payload(), new AbortController().signal);
    expect(result.draft.content).toBe("hi");
  });

  it("includes prompt_override in JSON payload when promptOverride is provided", async () => {
    let capturedBody: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            request_id: "req_1",
            draft: { type: "markdown", content: "ok", title: "T", confidence: 0.9 },
            model: "test",
            provider: "test",
            latency_ms: {},
            tokens: {},
            cost_usd: 0,
          }),
        });
      })
    );

    await analyzeRegion(
      payload({ promptOverride: "Generate flowchart" }),
      new AbortController().signal
    );
    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.prompt_override).toBe("Generate flowchart");
  });

  it("throws an AnalyzeApiError with the server's error_code on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          request_id: "req_1",
          error_code: "ollama_unavailable",
          message: "Ollama is not running.",
        }),
      })
    );

    await expect(analyzeRegion(payload(), new AbortController().signal)).rejects.toMatchObject({
      code: "ollama_unavailable",
      message: "Ollama is not running.",
    });
  });

  it("throws a network_error AnalyzeApiError when fetch itself rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    );

    await expect(analyzeRegion(payload(), new AbortController().signal)).rejects.toBeInstanceOf(
      AnalyzeApiError
    );
  });

  it("re-throws AbortError as-is rather than wrapping it", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(analyzeRegion(payload(), new AbortController().signal)).rejects.toBe(abortError);
  });
});

describe("reportOutcome", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never throws even if the network call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(reportOutcome("req_1", "accepted")).resolves.toBeUndefined();
  });
});
