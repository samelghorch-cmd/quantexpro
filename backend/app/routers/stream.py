"""Streaming temps réel des bar-close vers le terminal via WebSocket.

Le client tail le stream Redis (XREAD) à partir des nouveaux messages ; la reconnexion
est gérée côté client (le serveur ferme proprement à la déconnexion). Auth par clé d'API
en query (``?api_key=``) si des clés sont configurées.
"""

from __future__ import annotations

import hmac
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from ..bus import bars_stream, get_bus
from ..bus.redis_bus import _parse_read
from ..config import get_settings
from ..schemas import Timeframe

router = APIRouter(tags=["stream"])
_logger = logging.getLogger(__name__)


def _authorized(api_key: str | None) -> bool:
    settings = get_settings()
    if not settings.api_keys:
        return not settings.is_production
    return bool(api_key) and any(hmac.compare_digest(api_key or "", k) for k in settings.api_keys)


@router.websocket("/stream/bars/{timeframe}")
async def stream_bars(
    websocket: WebSocket,
    timeframe: Timeframe,
    api_key: str | None = Query(default=None),
) -> None:
    settings = get_settings()
    if not _authorized(api_key):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    if not settings.bus_enabled:
        await websocket.close(code=status.WS_1013_TRY_AGAIN_LATER)
        return

    await websocket.accept()
    bus = get_bus()
    stream = bars_stream(str(timeframe))
    last_id = "$"  # uniquement les nouveaux messages
    try:
        client = await bus.client()
        while True:
            resp = await client.xread(
                {stream: last_id}, count=settings.bus_batch, block=settings.bus_block_ms
            )
            for _stream_name, messages in _parse_read(resp):
                for msg_id, fields in messages:
                    last_id = msg_id
                    data = fields.get("data")
                    if data is not None:
                        await websocket.send_text(data)
    except WebSocketDisconnect:
        return
    except Exception:  # noqa: BLE001 - on ferme proprement, le client se reconnectera
        _logger.exception("ws_stream_error", extra={"stream": stream})
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
