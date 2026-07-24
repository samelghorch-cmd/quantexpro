"""Endpoints de santé — liveness (process up) et readiness (DB joignable)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .. import __version__
from ..db import get_session

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Liveness : le process répond."""
    return {"status": "ok", "version": __version__}


@router.get("/health/ready")
async def ready(session: AsyncSession = Depends(get_session)) -> JSONResponse:
    """Readiness : la base répond à un ``SELECT 1``."""
    try:
        await session.execute(text("SELECT 1"))
    except Exception as exc:  # pragma: no cover - dépend d'une vraie DB
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unavailable", "db": "down", "error": str(exc)},
        )
    return JSONResponse(content={"status": "ok", "db": "up"})
