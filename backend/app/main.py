"""Point d'entrée FastAPI — backend séries temporelles QuantEXPro (P0-B).

Assemble les routeurs (health, bars, ticks, orderbook), configure le logging structuré,
gère le cycle de vie (dispose du pool DB au shutdown) et normalise les erreurs de validation.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .config import get_settings
from .db import dispose_engine
from .logging_config import configure_logging
from .routers import bars, health, orderbook, ticks

_logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    _logger.info("backend_start", extra={"env": settings.env, "version": __version__})
    try:
        yield
    finally:
        await dispose_engine()
        _logger.info("backend_stop")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="QuantEXPro Timeseries API",
        version=__version__,
        description="Ingestion idempotente et lecture des séries (ticks / bars / orderbook L2).",
        lifespan=lifespan,
    )

    # CORS : le dashboard (Vite/Next) consomme cette API depuis le navigateur.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if not settings.is_production else [],
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(bars.router)
    app.include_router(ticks.router)
    app.include_router(orderbook.router)

    @app.exception_handler(RequestValidationError)
    async def _on_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        _logger.warning(
            "validation_error",
            extra={"path": request.url.path, "errors": exc.errors()},
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": exc.errors()},
        )

    return app


app = create_app()
