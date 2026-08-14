"""
Provider-agnostic model abstraction.

Everything above this layer (the API route) talks only to `MultimodalModel`.
Everything below it (ollama.py) is free to change — swapping in Gemini,
Claude, or OpenAI later means writing one new class that implements this
interface and pointing `main.py`'s provider factory at it. No route, schema,
or metrics code should need to change.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ModelAnalyzeResult:
    """Raw result from a provider call, before it's validated into a
    DraftContent schema. Kept provider-shape-agnostic: every field here is
    either directly reported by the provider or explicitly None."""

    raw_text: str
    """The provider's raw text output — may or may not be valid JSON; the
    caller (api/analyze.py) is responsible for parsing/validating it."""

    input_text_tokens: int | None
    input_image_tokens: int | None
    input_image_token_source: str  # "provider_reported" | "estimated" | "not_reported"
    output_tokens: int | None
    total_tokens: int | None

    ttfb_ms: float | None
    """Time from dispatch to the first byte of the provider's response."""
    ttft_ms: float | None
    """Time from dispatch to the first generated token becoming available.
    For a non-streaming provider call this is identical to ttfb — see
    ollama.py for why, and docs/METRICS.md for the streaming follow-up."""
    t_stream_ms: float | None
    """Time spent receiving/generating tokens after the first one."""


class ModelUnavailableError(Exception):
    """The provider is reachable but the requested model isn't installed/loaded."""


class ProviderUnavailableError(Exception):
    """The provider itself (e.g. the Ollama daemon) could not be reached."""


class ModelTimeoutError(Exception):
    """The provider did not respond within the configured timeout."""


class MultimodalModel(ABC):
    """Abstract interface every model provider implements."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name of the provider (e.g. 'gemini', 'ollama')."""
        raise NotImplementedError

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Name of the underlying model (e.g. 'gemini-2.5-flash', 'qwen3-vl:4b')."""
        raise NotImplementedError

    @abstractmethod
    async def analyze(
        self,
        *,
        image_bytes: bytes,
        image_mime: str,
        prompt: str,
        context: dict,
    ) -> ModelAnalyzeResult:
        """Send an image + prompt + lightweight spatial context to the model
        and return its raw output plus whatever usage/timing data the
        provider reports. Must raise one of the typed errors above on
        failure rather than a bare exception, so the API layer can map it to
        a specific, honest error response instead of a generic 500."""
        raise NotImplementedError

    @abstractmethod
    async def is_available(self) -> bool:
        """Cheap reachability check used by GET /health. Must not raise."""
        raise NotImplementedError
