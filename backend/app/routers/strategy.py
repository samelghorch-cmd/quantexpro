"""Génération de stratégies via le LLM local (Qwen2.5-Coder-7B) — Prompt Mode."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..config import Settings, get_settings
from ..llm import compile_strategy
from ..llm.errors import LLMInvalidOutput, LLMUnavailable
from ..schemas import PromptRequest, StrategyResponse
from ..security import require_api_key

router = APIRouter(prefix="/v1/strategy", tags=["strategy"])


@router.post(
    "/from-prompt",
    response_model=StrategyResponse,
    summary="Prompt en langage naturel → stratégie JSON (Rule Builder), via LLM local",
)
async def from_prompt(
    body: PromptRequest,
    settings: Settings = Depends(get_settings),
    _identity: str = Depends(require_api_key),
) -> StrategyResponse:
    if not settings.llm_enabled:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Moteur LLM local désactivé (QX_LLM_ENABLED=true requis).",
        )
    try:
        draft = await compile_strategy(body.prompt, name=body.name)
    except LLMUnavailable as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"Inférence locale injoignable : {exc}"
        ) from exc
    except LLMInvalidOutput as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"Sortie LLM non conforme : {exc}"
        ) from exc

    return StrategyResponse(strategy=draft.model_dump(exclude_none=True), source="qwen-local")
