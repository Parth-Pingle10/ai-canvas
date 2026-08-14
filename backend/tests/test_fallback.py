"""
Unit tests for intelligent primary provider execution and automatic fallback.
"""

from __future__ import annotations

import base64
import pytest
from fastapi.testclient import TestClient

from app.ai.base import (
    ModelAnalyzeResult,
    ModelTimeoutError,
    MultimodalModel,
    ProviderUnavailableError,
)
from app.dependencies import get_fallback_provider, get_model_provider
from app.main import app


class MockPrimaryProvider(MultimodalModel):
    def __init__(self, should_fail: bool = False, fail_type: str = "unavailable") -> None:
        self.should_fail = should_fail
        self.fail_type = fail_type
        self.calls = 0

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return "gemini-2.5-flash"

    async def is_available(self) -> bool:
        return not self.should_fail

    async def analyze(self, *, image_bytes, image_mime, prompt, context) -> ModelAnalyzeResult:
        self.calls += 1
        if self.should_fail:
            if self.fail_type == "timeout":
                raise ModelTimeoutError("Gemini timed out")
            raise ProviderUnavailableError("Gemini unavailable")
        return ModelAnalyzeResult(
            raw_text='{"type": "markdown", "title": "Gemini Answer", "content": "x = 42", "confidence": 0.95}',
            input_text_tokens=50,
            input_image_tokens=None,
            input_image_token_source="provider_reported",
            output_tokens=15,
            total_tokens=65,
            ttfb_ms=80.0,
            ttft_ms=80.0,
            t_stream_ms=0.0,
        )


class MockFallbackProvider(MultimodalModel):
    def __init__(self, should_fail: bool = False) -> None:
        self.should_fail = should_fail
        self.calls = 0

    @property
    def provider_name(self) -> str:
        return "ollama"

    @property
    def model_name(self) -> str:
        return "qwen3-vl:4b"

    async def is_available(self) -> bool:
        return not self.should_fail

    async def analyze(self, *, image_bytes, image_mime, prompt, context) -> ModelAnalyzeResult:
        self.calls += 1
        if self.should_fail:
            raise ProviderUnavailableError("Ollama unavailable")
        return ModelAnalyzeResult(
            raw_text='{"type": "markdown", "title": "Ollama Answer", "content": "x = 42 from backup", "confidence": 0.9}',
            input_text_tokens=60,
            input_image_tokens=None,
            input_image_token_source="not_reported",
            output_tokens=20,
            total_tokens=80,
            ttfb_ms=150.0,
            ttft_ms=150.0,
            t_stream_ms=0.0,
        )


from tests.conftest import make_analyze_payload


def test_primary_gemini_succeeds_without_fallback(test_image_b64: str):
    primary = MockPrimaryProvider(should_fail=False)
    fallback = MockFallbackProvider(should_fail=False)

    app.dependency_overrides[get_model_provider] = lambda: primary
    app.dependency_overrides[get_fallback_provider] = lambda: fallback

    with TestClient(app) as client:
        resp = client.post("/api/analyze", json=make_analyze_payload(test_image_b64))
        assert resp.status_code == 200
        data = resp.json()
        assert data["provider"] == "gemini"
        assert data["model"] == "gemini-2.5-flash"
        assert data["draft"]["title"] == "Gemini Answer"
        assert primary.calls == 1
        assert fallback.calls == 0

    app.dependency_overrides.clear()


def test_primary_fails_and_transparently_falls_back_to_ollama(test_image_b64: str):
    primary = MockPrimaryProvider(should_fail=True, fail_type="unavailable")
    fallback = MockFallbackProvider(should_fail=False)

    app.dependency_overrides[get_model_provider] = lambda: primary
    app.dependency_overrides[get_fallback_provider] = lambda: fallback

    with TestClient(app) as client:
        resp = client.post("/api/analyze", json=make_analyze_payload(test_image_b64))
        assert resp.status_code == 200
        data = resp.json()
        assert data["provider"] == "ollama"
        assert data["model"] == "qwen3-vl:4b"
        assert data["draft"]["title"] == "Ollama Answer"
        assert primary.calls == 1
        assert fallback.calls == 1

    app.dependency_overrides.clear()


def test_both_providers_fail_returns_clean_error(test_image_b64: str):
    primary = MockPrimaryProvider(should_fail=True, fail_type="unavailable")
    fallback = MockFallbackProvider(should_fail=True)

    app.dependency_overrides[get_model_provider] = lambda: primary
    app.dependency_overrides[get_fallback_provider] = lambda: fallback

    with TestClient(app) as client:
        resp = client.post("/api/analyze", json=make_analyze_payload(test_image_b64))
        assert resp.status_code in (502, 503)
        data = resp.json()
        assert "error_code" in data
        assert primary.calls == 1
        assert fallback.calls == 1

    app.dependency_overrides.clear()
