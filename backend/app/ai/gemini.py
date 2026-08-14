"""
Gemini multimodal provider adapter using the official google-genai SDK.

Kept strictly behind the MultimodalModel interface so swapping providers or
configuring fallback requires zero changes to the rest of the application.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from google import genai
from google.genai import types
from google.genai.errors import APIError, ClientError

from app.ai.base import (
    ModelAnalyzeResult,
    ModelTimeoutError,
    ModelUnavailableError,
    MultimodalModel,
    ProviderUnavailableError,
)
from app.ai.prompts import SYSTEM_PROMPT
from app.images import ensure_png_bytes


class GeminiProvider(MultimodalModel):
    """Primary cloud provider using Google Gemini multimodal models."""

    def __init__(self, *, api_key: str, model: str = "gemini-2.5-flash", timeout_ms: int = 30_000) -> None:
        self._api_key = api_key.strip()
        self._model = model.strip()
        self._timeout_s = max(1.0, timeout_ms / 1000.0)
        self._client: genai.Client | None = None
        if self._api_key:
            self._client = genai.Client(api_key=self._api_key)

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self._model

    async def is_available(self) -> bool:
        """Lightweight reachability / credential check."""
        return bool(self._api_key and self._client is not None)

    async def analyze(
        self,
        *,
        image_bytes: bytes,
        image_mime: str,
        prompt: str,
        context: dict,
    ) -> ModelAnalyzeResult:
        if not self._client or not self._api_key:
            raise ProviderUnavailableError("Gemini API key is not configured.")

        # Ensure image is valid PNG bytes for multimodal consumption
        png_bytes, final_mime = ensure_png_bytes(image_bytes, image_mime)
        image_part = types.Part.from_bytes(data=png_bytes, mime_type=final_mime)

        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            temperature=0.2,
        )

        t_start = time.perf_counter()

        try:
            # Run the synchronous SDK call in an async executor with strict timeout
            response: Any = await asyncio.wait_for(
                asyncio.to_thread(
                    self._client.models.generate_content,
                    model=self._model,
                    contents=[image_part, prompt],
                    config=config,
                ),
                timeout=self._timeout_s,
            )
        except asyncio.TimeoutError as exc:
            raise ModelTimeoutError(f"Gemini request timed out after {self._timeout_s:.1f}s.") from exc
        except ClientError as exc:
            msg = str(exc)
            if "NOT_FOUND" in msg or "404" in msg:
                raise ModelUnavailableError(f"Gemini model '{self._model}' is unavailable.") from exc
            if "API_KEY_INVALID" in msg or "PERMISSION_DENIED" in msg or "401" in msg or "403" in msg:
                raise ProviderUnavailableError(f"Gemini authentication failed: {msg}") from exc
            raise ProviderUnavailableError(f"Gemini client error: {msg}") from exc
        except APIError as exc:
            raise ProviderUnavailableError(f"Gemini API error ({exc.code}): {exc.message}") from exc
        except Exception as exc:
            raise ProviderUnavailableError(f"Gemini connection failed: {exc}") from exc

        elapsed_ms = (time.perf_counter() - t_start) * 1000.0

        raw_text = (response.text or "").strip()

        # Extract token usage from response metadata
        usage = getattr(response, "usage_metadata", None)
        prompt_tokens = getattr(usage, "prompt_token_count", None) if usage else None
        candidates_tokens = getattr(usage, "candidates_token_count", None) if usage else None
        total_tokens = getattr(usage, "total_token_count", None) if usage else None

        return ModelAnalyzeResult(
            raw_text=raw_text,
            input_text_tokens=prompt_tokens,
            input_image_tokens=None,
            input_image_token_source="provider_reported" if prompt_tokens is not None else "not_reported",
            output_tokens=candidates_tokens,
            total_tokens=total_tokens,
            ttfb_ms=elapsed_ms,
            ttft_ms=elapsed_ms,
            t_stream_ms=None,
        )
