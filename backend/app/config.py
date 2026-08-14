"""
Central configuration, read once from environment variables (see .env.example).

Nothing in the rest of the backend should call os.environ directly — every
tunable value (model name, timeouts, ROI defaults, cost rates, latency
budget) is read here, so changing behavior is a config edit, not a code
change. This is the same principle the frontend's RegionExtractor follows:
one seam, not scattered constants.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env", str(Path(__file__).resolve().parent.parent / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Ollama / model provider -------------------------------------------------
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3-vl:4b"
    ollama_fallback_model: str = "qwen3-vl:4b"

    # --- Request behavior ----------------------------------------------------------
    ai_idle_delay_ms: int = 700
    ai_request_timeout_ms: int = 60_000

    # --- Region-of-interest defaults (mirrored on the frontend; backend only
    #     uses these for validation bounds, not for performing extraction —
    #     extraction happens client-side against the structured document) ---
    roi_margin: float = 100.0
    roi_format: str = "png"  # "webp" | "png"
    roi_resolution: int = 1024

    # --- Latency budget for Budget Compliance (BC) KPI ---
    latency_budget_ms: int = 8000

    # --- Cost rate table. All zero by default (Ollama is free/local); set these
    #     to a documented hosted-provider price to compute a *notional* cost for
    #     comparison. Never fabricated — see metrics/cost.py. ---
    cost_model_name: str = "local-ollama"
    cost_input_per_million: float = 0.0
    cost_output_per_million: float = 0.0

    # --- Request/image safety limits ---
    max_request_bytes: int = 8 * 1024 * 1024  # 8 MB base64 payload ceiling
    max_image_dimension: int = 4096
    min_image_dimension: int = 8

    # --- CORS: the Vite dev server origin(s) allowed to call this API ---
    cors_allow_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:3000,http://127.0.0.1:3000"

    # --- Trace output ---
    traces_dir: str = "traces"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]

    @property
    def traces_path(self) -> Path:
        p = Path(self.traces_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p


@lru_cache
def get_settings() -> Settings:
    return Settings()

