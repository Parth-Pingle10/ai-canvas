from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.ai.base import (
    MultimodalModel,
    ModelTimeoutError,
    ModelUnavailableError,
    ProviderUnavailableError,
)
from app.ai.parsing import DraftParseError, parse_draft_content
from app.ai.prompts import build_user_prompt
from app.config import Settings, get_settings
from app.dependencies import get_model_provider
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
    AnalyzeErrorCode.ollama_unavailable: "Ollama is not running.",
    AnalyzeErrorCode.model_unavailable: "Configured model is unavailable.",
    AnalyzeErrorCode.timeout: "AI request timed out.",
    AnalyzeErrorCode.invalid_model_output: "The model returned an invalid response.",
    AnalyzeErrorCode.network_error: "Could not reach the AI backend.",
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
    e2e_ms: float,
) -> None:
    record = TraceRecord(
        request_id=request.request_id,
        session_id=request.context.session_id,
        ts_start=now_iso(),
        trigger=request.trigger.value,
        provider="ollama",
        model=settings.ollama_model,
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
    settings: Settings = Depends(get_settings),
):
    with measure_ms() as elapsed_total:
        # 1. Decode + validate the image before it goes anywhere near the model.
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
                e2e_ms=elapsed_total(),
            )
            return _error_response(
                AnalyzeErrorCode.validation_error, request.request_id, detail=str(exc)
            )

        prompt = build_user_prompt(
            stroke_count=request.context.stroke_count,
            zoom=request.context.zoom,
            prompt_override=request.prompt_override,
        )

        # 2. Call the model provider, mapping every failure mode to a
        #    specific, honest error — never a bare 500 with no context, and
        #    never a silently-hung request (the provider enforces its own
        #    timeout via AI_REQUEST_TIMEOUT_MS).
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
        except ProviderUnavailableError as exc:
            _record_failure(
                request=request, settings=settings, outcome="error",
                error_message=str(exc), e2e_ms=elapsed_total(),
            )
            return _error_response(
                AnalyzeErrorCode.ollama_unavailable, request.request_id, detail=str(exc)
            )
        except ModelUnavailableError as exc:
            _record_failure(
                request=request, settings=settings, outcome="error",
                error_message=str(exc), e2e_ms=elapsed_total(),
            )
            return _error_response(
                AnalyzeErrorCode.model_unavailable, request.request_id, detail=str(exc)
            )
        except ModelTimeoutError as exc:
            _record_failure(
                request=request, settings=settings, outcome="timeout",
                error_message=str(exc), e2e_ms=elapsed_total(),
            )
            return _error_response(
                AnalyzeErrorCode.timeout, request.request_id, detail=str(exc)
            )
        except Exception as exc:  # never let an unexpected error crash the server
            _record_failure(
                request=request, settings=settings, outcome="error",
                error_message=f"Unexpected error: {exc}", e2e_ms=elapsed_total(),
            )
            return _error_response(
                AnalyzeErrorCode.network_error, request.request_id, detail=str(exc)
            )

        # 3. Parse + validate the model's structured output. A malformed
        #    response is a recoverable/reportable failure, not a crash.
        try:
            draft = parse_draft_content(result.raw_text)
        except DraftParseError as exc:
            _record_failure(
                request=request, settings=settings, outcome="error",
                error_message=str(exc), e2e_ms=elapsed_total(),
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
            t_render=None,  # reported by the frontend once the draft is actually painted
            e2e=e2e_ms,
        )

        record = TraceRecord(
            request_id=request.request_id,
            session_id=request.context.session_id,
            ts_start=now_iso(),
            trigger=request.trigger.value,
            provider="ollama",
            model=settings.ollama_model,
            config_id=f"cfg_{request.context.format.value}_{request.context.crop_width}",
            input={
                "crop_px": [request.context.crop_width, request.context.crop_height],
                "format": request.context.format.value,
                "bytes": len(request.image),
                "zoom": request.context.zoom,
                "stroke_count": request.context.stroke_count,
                "prompt_chars": len(prompt),
            },
            latency_ms=latency.model_dump(),
            tokens=tokens.model_dump(),
            cost_usd=cost.notional_hosted_cost_usd,
            outcome="pending",  # updated by POST /api/metrics/outcome once the user acts
        )
        get_session_store().upsert(record)
        append_trace_line(record, settings)

        return AnalyzeResponse(
            request_id=request.request_id,
            draft=draft,
            model=settings.ollama_model,
            provider="ollama",
            latency_ms=latency,
            tokens=tokens,
            cost_usd=cost.notional_hosted_cost_usd,
        )
