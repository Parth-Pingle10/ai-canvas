"""
OllamaProvider — the only file in the backend that speaks to Ollama's HTTP API.

Uses `POST /api/generate` (non-streaming: `"stream": false`) with the image
passed via the `images` field, which is how Ollama's multimodal models accept
vision input. `"format": "json"` is passed to bias the model toward emitting
valid JSON matching our schema; the caller (api/analyze.py) still validates
the result defensively, since `format: json` constrains structure but not
our specific field names.

Non-streaming tradeoff: Ollama's non-streaming response arrives as a single
JSON body once generation is complete, so this provider cannot distinguish
"first byte received" from "generation fully complete" — ttfb and ttft are
therefore reported as the same value, and t_stream_ms is 0. Switching to
`"stream": true` and reading NDJSON chunks would let ttft/t_stream be
measured separately; that's flagged in docs/METRICS.md as the natural next
step, deliberately not built now to keep the request/response path simple to
reason about and cheap to test with a mocked provider.
"""

from __future__ import annotations

import base64
import re
import time

import httpx

from app.ai.base import (
    ModelAnalyzeResult,
    ModelTimeoutError,
    ModelUnavailableError,
    MultimodalModel,
    ProviderUnavailableError,
)
from app.ai.prompts import SYSTEM_PROMPT
from app.images import ensure_png_bytes


def _extract_generate_text(data: dict) -> str:
    """Return the model's draft JSON text from an Ollama /api/generate body.

    Cleanly extracts user-facing structured JSON without leaking raw thinking
    or internal chain-of-thought tokens.
    """
    response = (data.get("response") or "").strip()
    if response:
        # Strip internal thinking tags if model emitted them inside response
        cleaned_resp = re.sub(r"<think>[\s\S]*?</think>", "", response).strip()
        if cleaned_resp:
            return cleaned_resp
        return response

    thinking = (data.get("thinking") or "").strip()
    if thinking:
        # If model emitted JSON in the thinking stream, extract only the JSON object
        json_match = re.search(r"\{[\s\S]*\}", thinking)
        if json_match:
            return json_match.group(0).strip()
        cleaned_thinking = re.sub(r"<think>[\s\S]*?</think>", "", thinking).strip()
        return cleaned_thinking

    return ""


class OllamaProvider(MultimodalModel):
    def __init__(self, *, base_url: str, model: str, timeout_ms: int) -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout_s = timeout_ms / 1000

    @property
    def provider_name(self) -> str:
        return "ollama"

    @property
    def model_name(self) -> str:
        return self._model

    async def analyze(
        self,
        *,
        image_bytes: bytes,
        image_mime: str,
        prompt: str,
        context: dict,
    ) -> ModelAnalyzeResult:
        # Ensure image is in PNG format before sending to Ollama (Ollama's stb_image does not support WebP)
        png_bytes, _ = ensure_png_bytes(image_bytes, image_mime)
        image_b64 = base64.b64encode(png_bytes).decode("ascii")

        payload = {
            "model": self._model,
            "system": SYSTEM_PROMPT,
            "prompt": prompt,
            "images": [image_b64],
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.1},
        }

        t_dispatch = time.perf_counter()

        try:
            async with httpx.AsyncClient(timeout=self._timeout_s) as client:
                resp = await client.post(f"{self._base_url}/api/generate", json=payload)
        except httpx.ConnectError as exc:
            raise ProviderUnavailableError(f"Could not connect to Ollama at {self._base_url}") from exc
        except httpx.TimeoutException as exc:
            raise ModelTimeoutError("Ollama did not respond within the configured timeout") from exc
        except httpx.HTTPError as exc:  # anything else network-shaped
            raise ProviderUnavailableError(str(exc)) from exc

        t_received = time.perf_counter()
        ttfb_ms = (t_received - t_dispatch) * 1000

        if resp.status_code == 404:
            raise ModelUnavailableError(f"Model '{self._model}' is not available on this Ollama instance")
        if resp.status_code >= 400:
            raise ProviderUnavailableError(f"Ollama returned HTTP {resp.status_code}: {resp.text[:200]}")

        try:
            data = resp.json()
        except ValueError as exc:
            raise ProviderUnavailableError("Ollama returned a non-JSON response") from exc

        raw_text = _extract_generate_text(data)

        prompt_eval_count = data.get("prompt_eval_count")
        eval_count = data.get("eval_count")
        total_tokens = (
            (prompt_eval_count or 0) + (eval_count or 0)
            if prompt_eval_count is not None or eval_count is not None
            else None
        )

        return ModelAnalyzeResult(
            raw_text=raw_text,
            # Ollama reports one combined "prompt_eval_count" for everything
            # fed into the model (text + image patches) — it does not split
            # image tokens out separately, so we surface the combined figure
            # under input_text_tokens and are explicit (via the source field)
            # that the image/text split itself is not something Ollama gives
            # us, rather than silently mislabeling an estimate as reported.
            input_text_tokens=prompt_eval_count,
            input_image_tokens=None,
            input_image_token_source="not_reported",
            output_tokens=eval_count,
            total_tokens=total_tokens,
            ttfb_ms=ttfb_ms,
            ttft_ms=ttfb_ms,  # see module docstring: not distinguishable without streaming
            t_stream_ms=0.0,
        )

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(f"{self._base_url}/api/tags")
            return resp.status_code == 200
        except httpx.HTTPError:
            return False

    async def is_model_installed(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(f"{self._base_url}/api/tags")
            if resp.status_code != 200:
                return False
            names = {m.get("name") for m in resp.json().get("models", [])}
            # Ollama tag names sometimes include ":latest" implicitly; compare
            # both the exact configured name and its bare (untagged) form.
            bare = self._model.split(":")[0]
            return self._model in names or any(n and n.split(":")[0] == bare for n in names)
        except httpx.HTTPError:
            return False
