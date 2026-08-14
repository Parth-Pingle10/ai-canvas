"""
Cost calculation.

Local Ollama requests genuinely cost $0 — no metering, no API key, no bill.
That $0 figure (`actual_local_cost`) is always reported honestly as zero.

Separately, `notional_hosted_cost` estimates what the same token counts
*would* cost against a configured hosted rate table (COST_INPUT_PER_MILLION /
COST_OUTPUT_PER_MILLION in .env), purely so the assignment's cost-comparison
experiments have a number to work with. This is 0 by default — the person
running the backend must deliberately fill in a real, documented price
before it means anything. Nothing here fabricates a provider's price.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.config import Settings
from app.schemas.response import TokenUsage


@dataclass
class CostBreakdown:
    actual_local_cost_usd: float
    notional_hosted_cost_usd: float
    cost_model_name: str
    input_rate_per_million: float
    output_rate_per_million: float


def calculate_cost(tokens: TokenUsage, settings: Settings) -> CostBreakdown:
    input_tokens = tokens.input_text or 0
    output_tokens = tokens.output or 0

    notional = (
        (input_tokens / 1_000_000) * settings.cost_input_per_million
        + (output_tokens / 1_000_000) * settings.cost_output_per_million
    )

    return CostBreakdown(
        actual_local_cost_usd=0.0,
        notional_hosted_cost_usd=round(notional, 8),
        cost_model_name=settings.cost_model_name,
        input_rate_per_million=settings.cost_input_per_million,
        output_rate_per_million=settings.cost_output_per_million,
    )
