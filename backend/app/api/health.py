from __future__ import annotations

from fastapi import APIRouter, Depends

from app.ai.base import MultimodalModel
from app.ai.ollama import OllamaProvider
from app.config import Settings, get_settings
from app.dependencies import get_model_provider
from app.schemas.response import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(
    provider: MultimodalModel = Depends(get_model_provider),
    settings: Settings = Depends(get_settings),
) -> HealthResponse:
    reachable = await provider.is_available()

    model_installed = False
    if reachable:
        if isinstance(provider, OllamaProvider):
            model_installed = await provider.is_model_installed()
        else:
            model_installed = True

    status = "ok" if (reachable and model_installed) else "degraded"
    return HealthResponse(
        status=status,
        ollama=reachable,
        model=settings.ollama_model,
        model_installed=model_installed,
    )

