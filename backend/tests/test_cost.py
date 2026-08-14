from __future__ import annotations

from app.config import Settings
from app.metrics.cost import calculate_cost
from app.schemas.response import TokenUsage


def test_local_cost_is_always_zero_regardless_of_rate_table():
    settings = Settings(cost_input_per_million=3.0, cost_output_per_million=15.0)
    tokens = TokenUsage(input_text=1000, output=500, total=1500)
    cost = calculate_cost(tokens, settings)
    assert cost.actual_local_cost_usd == 0.0


def test_notional_cost_uses_configured_rate_table():
    settings = Settings(cost_input_per_million=2.0, cost_output_per_million=10.0)
    tokens = TokenUsage(input_text=1_000_000, output=1_000_000, total=2_000_000)
    cost = calculate_cost(tokens, settings)
    assert cost.notional_hosted_cost_usd == 12.0  # 2.0 + 10.0


def test_notional_cost_is_zero_when_rate_table_is_zero():
    settings = Settings(cost_input_per_million=0.0, cost_output_per_million=0.0)
    tokens = TokenUsage(input_text=500_000, output=200_000, total=700_000)
    cost = calculate_cost(tokens, settings)
    assert cost.notional_hosted_cost_usd == 0.0


def test_notional_cost_handles_missing_token_counts_as_zero():
    settings = Settings(cost_input_per_million=5.0, cost_output_per_million=5.0)
    tokens = TokenUsage(input_text=None, output=None, total=None)
    cost = calculate_cost(tokens, settings)
    assert cost.notional_hosted_cost_usd == 0.0
