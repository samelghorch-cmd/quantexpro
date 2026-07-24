"""Pont MT5 — signaux (PM/Risque), pull par l'EA, et acquittement d'exécution.

Flux basse-latence sans flux entrant vers le VPS : l'EA MT5 *poll* les signaux en attente
puis *ACK* l'exécution. Chaque étape est journalisée (audit immuable) et idempotente
(``client_order_id``). Modes : paper → demo → live.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..audit import record_audit
from ..config import Settings, get_settings
from ..db import get_session
from ..repositories import apply_execution, create_signal, list_pending_signals
from ..schemas import (
    ExecutionIn,
    ExecutionResult,
    MT5Mode,
    PendingSignal,
    SignalAck,
    SignalIn,
)
from ..security import Principal, Role, require_role

router = APIRouter(prefix="/v1/mt5", tags=["mt5"])


@router.post("/signals", response_model=SignalAck, summary="Soumettre un signal (PM/Risque)")
async def submit_signal(
    signal: SignalIn,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    principal: Principal = Depends(require_role(Role.pm, Role.risk)),
) -> SignalAck:
    mode = (signal.mode.value if signal.mode else settings.mt5_default_mode)
    created = await create_signal(session, signal, mode)
    await record_audit(
        session,
        actor=principal.key_id,
        role=principal.role.value,
        action="mt5.signal.create" if created else "mt5.signal.duplicate",
        resource=signal.client_order_id,
        details={
            "symbol": signal.symbol,
            "side": signal.side.value,
            "volume": signal.volume,
            "mode": mode,
        },
    )
    return SignalAck(client_order_id=signal.client_order_id, status="pending", mode=mode)


@router.get(
    "/signals/pending",
    response_model=list[PendingSignal],
    summary="Signaux en attente à exécuter (pull par l'EA)",
)
async def pending_signals(
    mode: MT5Mode | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
    _principal: Principal = Depends(require_role(Role.ea)),
) -> list[PendingSignal]:
    effective_mode = mode.value if mode else settings.mt5_default_mode
    rows = await list_pending_signals(session, effective_mode, limit)
    return [PendingSignal.model_validate(r) for r in rows]


@router.post(
    "/executions",
    response_model=ExecutionResult,
    summary="Acquittement d'exécution renvoyé par l'EA",
)
async def report_execution(
    execution: ExecutionIn,
    session: AsyncSession = Depends(get_session),
    principal: Principal = Depends(require_role(Role.ea)),
) -> ExecutionResult:
    updated = await apply_execution(session, execution)
    if not updated:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Ordre inconnu ou déjà traité (aucun ordre 'pending' pour ce client_order_id).",
        )
    await record_audit(
        session,
        actor=principal.key_id,
        role=principal.role.value,
        action="mt5.execution",
        resource=execution.client_order_id,
        details={
            "status": execution.status.value,
            "ticket": execution.ticket,
            "filled_price": execution.filled_price,
            "reject_reason": execution.reject_reason,
        },
    )
    return ExecutionResult(client_order_id=execution.client_order_id, status=execution.status.value)
