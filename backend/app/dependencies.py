"""
FastAPI dependency wiring. Kept separate from main.py so tests can override
`get_model_provider` with a mock/fake without touching app startup at all —
see tests/conftest.py.
"""

from __future__ import annotations

from app.ai.base import MultimodalModel
from app.ai.ollama import OllamaProvider
from app.config import get_settings

_provider_singleton: MultimodalModel | None = None


def get_model_provider() -> MultimodalModel:
    global _provider_singleton
    if _provider_singleton is None:
        settings = get_settings()
        _provider_singleton = OllamaProvider(
            base_url=settings.ollama_base_url,
            model=settings.ollama_model,
            timeout_ms=settings.ai_request_timeout_ms,
        )
    return _provider_singleton

