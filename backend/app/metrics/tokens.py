"""
Token accounting. Deliberately thin: this module's only job is to turn a
provider's raw usage numbers into our TokenUsage schema, without inventing
anything the provider didn't report.
"""

from __future__ import annotations

from app.ai.base import ModelAnalyzeResult
from app.schemas.response import TokenUsage


def tokens_from_provider_result(result: ModelAnalyzeResult) -> TokenUsage:
    return TokenUsage(
        input_text=result.input_text_tokens,
        input_image=result.input_image_tokens,
        input_image_source=result.input_image_token_source,
        output=result.output_tokens,
        reasoning=None,  # Ollama's /api/generate does not report reasoning tokens
        cache_read=None,  # not reported by Ollama for this endpoint
        total=result.total_tokens,
    )


def estimate_image_tokens(width_px: int, height_px: int) -> int:
    """A rough, clearly-labeled *estimate* for providers/models that don't
    report image token counts at all. Not used for Ollama (which reports a
    combined figure instead — see ai/ollama.py) but kept available for a
    future provider that reports text tokens only. Uses a common
    patch-based heuristic (~14x14px effective patches after resize), which
    will not match any specific provider's real accounting — callers must
    mark results produced by this function as "estimated", never
    "provider_reported".
    """
    patch_px = 14
    patches = max(1, (width_px // patch_px)) * max(1, (height_px // patch_px))
    return patches
