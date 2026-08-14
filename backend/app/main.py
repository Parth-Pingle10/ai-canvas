from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import analyze, health, metrics
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title="AI Canvas — Analysis Backend",
    description=(
        "Region-of-interest -> local multimodal model (Ollama) -> structured "
        "draft pipeline for the AI Canvas frontend. See backend/README.md."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(analyze.router)
app.include_router(metrics.router)


@app.get("/")
async def root() -> dict:
    return {
        "service": "ai-canvas-backend",
        "docs": "/docs",
        "health": "/health",
    }
