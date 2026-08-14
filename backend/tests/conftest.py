from __future__ import annotations

import base64
import struct
import zlib

import pytest
from fastapi.testclient import TestClient

from app.ai.base import (
    ModelAnalyzeResult,
    ModelTimeoutError,
    ModelUnavailableError,
    MultimodalModel,
    ProviderUnavailableError,
)
from app.dependencies import get_model_provider
from app.main import app


class FakeProvider(MultimodalModel):
    """A fully in-memory stand-in for OllamaProvider, so the test suite never
    needs a real Ollama daemon. Behavior is controlled per-test via the
    `mode` attribute."""

    def __init__(self) -> None:
        self.mode = "ok"
        self.response_json = '{"type": "markdown", "content": "x = 5", "title": "Solution", "confidence": 0.9}'
        self.calls = 0

    async def analyze(self, *, image_bytes, image_mime, prompt, context) -> ModelAnalyzeResult:
        self.calls += 1
        if self.mode == "unavailable":
            raise ProviderUnavailableError("fake: connection refused")
        if self.mode == "model_missing":
            raise ModelUnavailableError("fake: model not pulled")
        if self.mode == "timeout":
            raise ModelTimeoutError("fake: timed out")
        if self.mode == "malformed":
            return ModelAnalyzeResult(
                raw_text="not json at all, sorry",
                input_text_tokens=100,
                input_image_tokens=None,
                input_image_token_source="not_reported",
                output_tokens=20,
                total_tokens=120,
                ttfb_ms=50.0,
                ttft_ms=50.0,
                t_stream_ms=0.0,
            )
        if self.mode == "recoverable":
            return ModelAnalyzeResult(
                raw_text=f"```json\n{self.response_json}\n```",
                input_text_tokens=100,
                input_image_tokens=None,
                input_image_token_source="not_reported",
                output_tokens=20,
                total_tokens=120,
                ttfb_ms=50.0,
                ttft_ms=50.0,
                t_stream_ms=0.0,
            )
        return ModelAnalyzeResult(
            raw_text=self.response_json,
            input_text_tokens=214,
            input_image_tokens=None,
            input_image_token_source="not_reported",
            output_tokens=48,
            total_tokens=262,
            ttfb_ms=120.0,
            ttft_ms=120.0,
            t_stream_ms=0.0,
        )

    async def is_available(self) -> bool:
        return self.mode != "unavailable"


@pytest.fixture
def fake_provider() -> FakeProvider:
    return FakeProvider()


@pytest.fixture
def client(fake_provider: FakeProvider) -> TestClient:
    app.dependency_overrides[get_model_provider] = lambda: fake_provider
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def make_test_png(width: int = 64, height: int = 48) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw = b""
    for _ in range(height):
        raw += b"\x00" + b"\xff\x00\x00" * width
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


@pytest.fixture
def test_image_b64() -> str:
    return base64.b64encode(make_test_png()).decode("ascii")


def make_analyze_payload(image_b64: str, **overrides) -> dict:
    payload = {
        "request_id": "req_test_1",
        "image": image_b64,
        "context": {
            "world_bounds": {"x": 0, "y": 0, "width": 200, "height": 150},
            "crop_width": 64,
            "crop_height": 48,
            "zoom": 1.0,
            "stroke_count": 3,
            "format": "png",
            "session_id": "ses_test_1",
            "t_capture_ms": 12.0,
            "t_dispatch_ms": 4.0,
        },
        "trigger": "manual",
    }
    payload.update(overrides)
    return payload
