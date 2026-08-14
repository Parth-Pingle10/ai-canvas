"""
FastAPI dependency wiring. Kept separate from main.py so tests can override
`get_model_provider` with a mock/fake without touching app startup at all —
see tests/conftest.py.
"""

from __future__ import annotations

from app.ai.base import MultimodalModel
from app.ai.gemini import GeminiProvider
from app.ai.ollama import OllamaProvider
from app.config import get_settings

_primary_provider: MultimodalModel | None = None
_fallback_provider: MultimodalModel | None = None


def get_model_provider() -> MultimodalModel:
    global _primary_provider
    if _primary_provider is None:
        settings = get_settings()
        if settings.ai_primary_provider.lower() == "gemini":
            _primary_provider = GeminiProvider(
                api_key=settings.gemini_api_key,
                model=settings.gemini_model,
                timeout_ms=settings.gemini_request_timeout_ms,
            )
        else:
            _primary_provider = OllamaProvider(
                base_url=settings.ollama_base_url,
                model=settings.ollama_model,
                timeout_ms=settings.ollama_request_timeout_ms,
            )
    return _primary_provider


def get_fallback_provider() -> MultimodalModel | None:
    global _fallback_provider
    if _fallback_provider is None:
        settings = get_settings()
        if settings.ai_fallback_provider.lower() == "ollama":
            _fallback_provider = OllamaProvider(
                base_url=settings.ollama_base_url,
                model=settings.ollama_fallback_model or settings.ollama_model,
                timeout_ms=settings.ollama_request_timeout_ms,
            )
        elif settings.ai_fallback_provider.lower() == "gemini":
            _fallback_provider = GeminiProvider(
                api_key=settings.gemini_api_key,
                model=settings.gemini_model,
                timeout_ms=settings.gemini_request_timeout_ms,
            )
        else:
            _fallback_provider = None
    return _fallback_provider

