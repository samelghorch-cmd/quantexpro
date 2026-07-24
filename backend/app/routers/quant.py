"""Quant engines API — HMM régimes (P5-HMM-PY)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..quant.hmm import hmm_regimes
from ..schemas import HmmRequest, HmmResponse
from ..security import Principal, Role, require_role

router = APIRouter(prefix="/v1/quant", tags=["quant"])


@router.post(
    "/hmm",
    response_model=HmmResponse,
    summary="Régimes Trend/Range/Vol/Choppy (parité hmmRegimes JS)",
)
async def post_hmm(
    body: HmmRequest,
    _principal: Principal = Depends(require_role(Role.pm, Role.risk, Role.analyst)),
) -> HmmResponse:
    result = hmm_regimes(body.returns, n_states=body.n_states, iters=body.iters)
    if result is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Série trop courte ou features insuffisantes (min ~40 returns, warmup 20).",
        )
    return HmmResponse.model_validate(result)
