"""Quant engines API — HMM régimes (P5-HMM-PY + P6-HMM-BW)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..quant.hmm import hmm_regimes
from ..quant.hmm_bw import hmm_baum_welch
from ..schemas import HmmRequest, HmmResponse
from ..security import Principal, Role, require_role

router = APIRouter(prefix="/v1/quant", tags=["quant"])


@router.post(
    "/hmm",
    response_model=HmmResponse,
    summary="Régimes Trend/Range/Vol/Choppy (parity JS ou Baum-Welch)",
)
async def post_hmm(
    body: HmmRequest,
    _principal: Principal = Depends(require_role(Role.pm, Role.risk, Role.analyst)),
) -> HmmResponse:
    if body.engine == "baum_welch":
        result = hmm_baum_welch(body.returns, n_states=body.n_states, iters=max(body.iters, 15))
    else:
        result = hmm_regimes(body.returns, n_states=body.n_states, iters=body.iters)
    if result is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Série trop courte ou features insuffisantes (min ~40 returns).",
        )
    return HmmResponse.model_validate(result)
