from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.ai.base import (
    MultimodalModel,
    ModelAnalyzeResult,
    ModelTimeoutError,
    ModelUnavailableError,
    ProviderUnavailableError,
)
from app.ai.parsing import DraftParseError, parse_draft_content
from app.ai.prompts import build_user_prompt
from app.config import Settings, get_settings
from app.dependencies import get_fallback_provider, get_model_provider
from app.images import InvalidImageError, decode_and_validate_image
from app.metrics.cost import calculate_cost
from app.metrics.instrumentation import measure_ms
from app.metrics.tokens import tokens_from_provider_result
from app.metrics.trace import TraceRecord, append_trace_line, get_session_store, now_iso
from app.schemas.request import AnalyzeRequest
from app.schemas.response import (
    AnalyzeErrorCode,
    AnalyzeErrorResponse,
    AnalyzeResponse,
    LatencyBreakdown,
)

router = APIRouter(prefix="/api", tags=["analyze"])

_ERROR_STATUS = {
    AnalyzeErrorCode.ollama_unavailable: 503,
    AnalyzeErrorCode.model_unavailable: 503,
    AnalyzeErrorCode.timeout: 504,
    AnalyzeErrorCode.invalid_model_output: 502,
    AnalyzeErrorCode.network_error: 502,
    AnalyzeErrorCode.validation_error: 422,
    AnalyzeErrorCode.internal_error: 500,
}

_ERROR_MESSAGES = {
    AnalyzeErrorCode.ollama_unavailable: "Could not connect to Ollama. Make sure Ollama is running.",
    AnalyzeErrorCode.model_unavailable: "Configured vision model is unavailable.",
    AnalyzeErrorCode.timeout: "AI generation is taking longer than expected. You can try again.",
    AnalyzeErrorCode.invalid_model_output: "The model returned an invalid response.",
    AnalyzeErrorCode.network_error: "Could not reach the AI service.",
}


def _error_response(
    code: AnalyzeErrorCode, request_id: str, *, detail: str | None = None
) -> JSONResponse:
    message = detail or _ERROR_MESSAGES.get(code, "The AI request failed.")
    body = AnalyzeErrorResponse(request_id=request_id, error_code=code, message=message)
    return JSONResponse(status_code=_ERROR_STATUS[code], content=body.model_dump(mode="json"))


def _record_failure(
    *,
    request: AnalyzeRequest,
    settings: Settings,
    outcome: str,
    error_message: str,
    provider: str = "gemini",
    model: str = "gemini-2.5-flash",
    e2e_ms: float,
) -> None:
    record = TraceRecord(
        request_id=request.request_id,
        session_id=request.context.session_id,
        ts_start=now_iso(),
        trigger=request.trigger.value,
        provider=provider,
        model=model,
        config_id=f"cfg_{request.context.format.value}_{request.context.crop_width}",
        input={
            "crop_px": [request.context.crop_width, request.context.crop_height],
            "format": request.context.format.value,
            "bytes": len(request.image),
            "zoom": request.context.zoom,
            "stroke_count": request.context.stroke_count,
            "prompt_chars": None,
        },
        latency_ms={
            "t_capture": request.context.t_capture_ms,
            "t_dispatch": request.context.t_dispatch_ms,
            "ttfb": None,
            "ttft": None,
            "t_stream": None,
            "t_render": None,
            "e2e": e2e_ms,
        },
        tokens={
            "input_text": None,
            "input_image": None,
            "input_image_source": "not_reported",
            "output": None,
            "reasoning": None,
            "cache_read": None,
            "total": 0,
        },
        cost_usd=0.0,
        outcome=outcome,
        error=error_message,
    )
    get_session_store().upsert(record)
    append_trace_line(record, settings)


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    responses={
        422: {"model": AnalyzeErrorResponse},
        502: {"model": AnalyzeErrorResponse},
        503: {"model": AnalyzeErrorResponse},
        504: {"model": AnalyzeErrorResponse},
    },
)
async def analyze(
    request: AnalyzeRequest,
    provider: MultimodalModel = Depends(get_model_provider),
    fallback_provider: MultimodalModel | None = Depends(get_fallback_provider),
    settings: Settings = Depends(get_settings),
):
    with measure_ms() as elapsed_total:
        # 1. Decode + validate the image before passing to the AI pipeline
        try:
            image = decode_and_validate_image(
                request.image,
                declared_format=request.context.format.value,
                max_bytes=settings.max_request_bytes,
                min_dimension=settings.min_image_dimension,
                max_dimension=settings.max_image_dimension,
            )
        except InvalidImageError as exc:
            _record_failure(
                request=request,
                settings=settings,
                outcome="error",
                error_message=str(exc),
                provider=provider.provider_name,
                model=provider.model_name,
                e2e_ms=elapsed_total(),
            )
            return _error_response(
                AnalyzeErrorCode.validation_error, request.request_id, detail=str(exc)
            )

        prompt = build_user_prompt(
            stroke_count=request.context.stroke_count,
            zoom=request.context.zoom,
            prompt_override=request.prompt_override,
            canvas_texts=request.context.canvas_texts,
        )

        # 2. Call the primary provider with intelligent fallback
        result: ModelAnalyzeResult | None = None
        active_provider_name = provider.provider_name
        active_model_name = provider.model_name
        fallback_used = False
        fallback_reason: str | None = None

        try:
            result = await provider.analyze(
                image_bytes=image.data,
                image_mime=image.mime,
                prompt=prompt,
                context={
                    "world_bounds": request.context.world_bounds.model_dump(),
                    "zoom": request.context.zoom,
                    "stroke_count": request.context.stroke_count,
                },
            )
        except (ProviderUnavailableError, ModelUnavailableError, ModelTimeoutError, Exception) as primary_exc:
            # Check if fallback provider is configured and available
            if fallback_provider is not None and fallback_provider != provider:
                fallback_reason = f"{type(primary_exc).__name__}: {primary_exc}"
                fallback_used = True
                active_provider_name = fallback_provider.provider_name
                active_model_name = fallback_provider.model_name

                try:
                    result = await fallback_provider.analyze(
                        image_bytes=image.data,
                        image_mime=image.mime,
                        prompt=prompt,
                        context={
                            "world_bounds": request.context.world_bounds.model_dump(),
                            "zoom": request.context.zoom,
                            "stroke_count": request.context.stroke_count,
                        },
                    )
                except ProviderUnavailableError as exc:
                    _record_failure(
                        request=request,
                        settings=settings,
                        outcome="error",
                        error_message=f"Primary ({primary_exc}) and fallback failed: {exc}",
                        provider=active_provider_name,
                        model=active_model_name,
                        e2e_ms=elapsed_total(),
                    )
                    return _error_response(
                        AnalyzeErrorCode.ollama_unavailable,
                        request.request_id,
                        detail="Primary and backup AI services are currently unavailable. Ensure Ollama is running.",
                    )
                except ModelTimeoutError as exc:
                    _record_failure(
                        request=request,
                        settings=settings,
                        outcome="timeout",
                        error_message=f"Fallback timed out: {exc}",
                        provider=active_provider_name,
                        model=active_model_name,
                        e2e_ms=elapsed_total(),
                    )
                    return _error_response(
                        AnalyzeErrorCode.timeout,
                        request.request_id,
                        detail="AI generation is taking longer than expected. You can try again.",
                    )
                except Exception as exc:
                    _record_failure(
                        request=request,
                        settings=settings,
                        outcome="error",
                        error_message=f"Fallback failed: {exc}",
                        provider=active_provider_name,
                        model=active_model_name,
                        e2e_ms=elapsed_total(),
                    )
                    return _error_response(
                        AnalyzeErrorCode.network_error, request.request_id, detail=str(exc)
                    )
            else:
                # No fallback provider -> return typed error from primary
                if isinstance(primary_exc, ModelTimeoutError):
                    _record_failure(
                        request=request,
                        settings=settings,
                        outcome="timeout",
                        error_message=str(primary_exc),
                        provider=active_provider_name,
                        model=active_model_name,
                        e2e_ms=elapsed_total(),
                    )
                    return _error_response(
                        AnalyzeErrorCode.timeout, request.request_id, detail=str(primary_exc)
                    )
                if isinstance(primary_exc, ProviderUnavailableError):
                    _record_failure(
                        request=request,
                        settings=settings,
                        outcome="error",
                        error_message=str(primary_exc),
                        provider=active_provider_name,
                        model=active_model_name,
                        e2e_ms=elapsed_total(),
                    )
                    return _error_response(
                        AnalyzeErrorCode.ollama_unavailable, request.request_id, detail=str(primary_exc)
                    )
                if isinstance(primary_exc, ModelUnavailableError):
                    _record_failure(
                        request=request,
                        settings=settings,
                        outcome="error",
                        error_message=str(primary_exc),
                        provider=active_provider_name,
                        model=active_model_name,
                        e2e_ms=elapsed_total(),
                    )
                    return _error_response(
                        AnalyzeErrorCode.model_unavailable, request.request_id, detail=str(primary_exc)
                    )
                _record_failure(
                    request=request,
                    settings=settings,
                    outcome="error",
                    error_message=str(primary_exc),
                    provider=active_provider_name,
                    model=active_model_name,
                    e2e_ms=elapsed_total(),
                )
                return _error_response(
                    AnalyzeErrorCode.network_error, request.request_id, detail=str(primary_exc)
                )

        if result is None:
            return _error_response(
                AnalyzeErrorCode.internal_error, request.request_id, detail="No output received from AI model."
            )

        # 3. Parse and validate the model's structured output into universal DraftContent
        try:
            draft = parse_draft_content(result.raw_text)
        except DraftParseError as exc:
            _record_failure(
                request=request,
                settings=settings,
                outcome="error",
                error_message=str(exc),
                provider=active_provider_name,
                model=active_model_name,
                e2e_ms=elapsed_total(),
            )
            return _error_response(
                AnalyzeErrorCode.invalid_model_output,
                request.request_id,
                detail=str(exc),
            )

        tokens = tokens_from_provider_result(result)
        cost = calculate_cost(tokens, settings)

        e2e_ms = elapsed_total()
        latency = LatencyBreakdown(
            t_capture=request.context.t_capture_ms,
            t_dispatch=request.context.t_dispatch_ms,
            ttfb=result.ttfb_ms,
            ttft=result.ttft_ms,
            t_stream=result.t_stream_ms,
            t_render=None,
            e2e=e2e_ms,
        )

        record = TraceRecord(
            request_id=request.request_id,
            session_id=request.context.session_id,
            ts_start=now_iso(),
            trigger=request.trigger.value,
            provider=active_provider_name,
            model=active_model_name,
            config_id=f"cfg_{request.context.format.value}_{request.context.crop_width}",
            input={
                "crop_px": [request.context.crop_width, request.context.crop_height],
                "format": request.context.format.value,
                "bytes": len(request.image),
                "zoom": request.context.zoom,
                "stroke_count": request.context.stroke_count,
                "prompt_chars": len(prompt),
                "fallback_used": fallback_used,
                "fallback_reason": fallback_reason,
            },
            latency_ms=latency.model_dump(),
            tokens=tokens.model_dump(),
            cost_usd=cost.notional_hosted_cost_usd,
            outcome="pending",
        )
        get_session_store().upsert(record)
        append_trace_line(record, settings)

        return AnalyzeResponse(
            request_id=request.request_id,
            draft=draft,
            model=active_model_name,
            provider=active_provider_name,
            latency_ms=latency,
            tokens=tokens,
            cost_usd=cost.notional_hosted_cost_usd,
            cached=False,
        )
