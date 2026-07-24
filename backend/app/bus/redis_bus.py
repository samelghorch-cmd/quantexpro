"""Bus Redis Streams — publication et consommation Zero-Data-Loss.

Garanties :
  • Publication : retry avec backoff exponentiel + reconnexion transparente.
  • Consommation : consumer groups (at-least-once), ACK après succès, retry borné avec
    backoff, puis Dead-Letter Queue (``<stream>.dlq``) — jamais de perte silencieuse.
  • Reprise : au démarrage, réclamation (XAUTOCLAIM) des messages restés en attente d'un
    consommateur mort (crash) → aucun message orphelin.
  • Backpressure : XADD avec MAXLEN approximatif pour borner la mémoire des streams.

Le client Redis est abstrait derrière ``RedisLike`` (Protocol) : le vrai client
``redis.asyncio`` est injecté via cast, et les tests injectent un faux client en mémoire.
"""

from __future__ import annotations

import asyncio
import logging
import os
import socket
from collections.abc import Awaitable, Callable
from typing import Any, Protocol, cast

from ..config import Settings, get_settings
from .events import EventEnvelope

_logger = logging.getLogger(__name__)

Handler = Callable[[EventEnvelope], Awaitable[None]]


class RedisLike(Protocol):
    """Sous-ensemble de l'API redis.asyncio réellement utilisé par le bus."""

    async def xadd(
        self, name: str, fields: dict[str, str], *,
        maxlen: int | None = None, approximate: bool = True,
    ) -> Any: ...

    async def xgroup_create(
        self, name: str, groupname: str, id: str = "0", mkstream: bool = False
    ) -> Any: ...

    async def xreadgroup(
        self,
        groupname: str,
        consumername: str,
        streams: dict[str, str],
        count: int | None = None,
        block: int | None = None,
    ) -> Any: ...

    async def xread(
        self, streams: dict[str, str], count: int | None = None, block: int | None = None
    ) -> Any: ...

    async def xack(self, name: str, groupname: str, *ids: str) -> Any: ...

    async def xautoclaim(
        self,
        name: str,
        groupname: str,
        consumername: str,
        min_idle_time: int,
        start_id: str = "0-0",
        count: int | None = None,
    ) -> Any: ...

    async def aclose(self) -> None: ...


class RedisStreamBus:
    """Client de haut niveau du bus ZDL."""

    def __init__(
        self,
        url: str,
        *,
        settings: Settings | None = None,
        client: RedisLike | None = None,
    ) -> None:
        self._url = url
        self._settings = settings or get_settings()
        self._client: RedisLike | None = client
        self._owns_client = client is None
        self._lock = asyncio.Lock()
        self._stop = asyncio.Event()

    # ---- Connexion / cycle de vie -------------------------------------------------

    async def _connect(self) -> RedisLike:
        # Import local : redis n'est requis que si le bus est réellement utilisé.
        import redis.asyncio as redis  # noqa: PLC0415

        client = redis.from_url(
            self._url,
            encoding="utf-8",
            decode_responses=True,
            health_check_interval=30,
        )
        return cast(RedisLike, client)

    async def client(self) -> RedisLike:
        """Retourne le client connecté (le crée sous verrou si nécessaire)."""
        if self._client is None:
            async with self._lock:
                if self._client is None:
                    self._client = await self._connect()
        return self._client

    async def _reset_client(self) -> None:
        """Invalide le client après une erreur réseau → reconnexion au prochain usage."""
        async with self._lock:
            old, self._client = self._client, None
        if old is not None and self._owns_client:
            try:
                await old.aclose()
            except Exception:  # noqa: BLE001 - fermeture best-effort
                pass

    async def close(self) -> None:
        self._stop.set()
        if self._client is not None and self._owns_client:
            try:
                await self._client.aclose()
            finally:
                self._client = None

    def request_stop(self) -> None:
        self._stop.set()

    # ---- Retry / backoff ----------------------------------------------------------

    async def _with_retry(self, op: Callable[[RedisLike], Awaitable[Any]], what: str) -> Any:
        attempts = self._settings.bus_max_retries
        base = self._settings.bus_backoff_base_s
        last_exc: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                return await op(await self.client())
            except (TimeoutError, ConnectionError, OSError) as exc:
                last_exc = exc
                await self._reset_client()
                if attempt >= attempts:
                    break
                delay = base * (2 ** (attempt - 1))
                _logger.warning(
                    "bus_retry", extra={"op": what, "attempt": attempt, "delay_s": delay}
                )
                await asyncio.sleep(delay)
        assert last_exc is not None
        raise last_exc

    # ---- Publication --------------------------------------------------------------

    async def publish(self, stream: str, envelope: EventEnvelope) -> str:
        """Publie un événement (idempotent côté consommateur via ``envelope.id``)."""
        fields = envelope.to_fields()
        maxlen = self._settings.bus_stream_maxlen

        async def _op(client: RedisLike) -> Any:
            return await client.xadd(stream, fields, maxlen=maxlen, approximate=True)

        msg_id = await self._with_retry(_op, "xadd")
        return str(msg_id)

    # ---- Groupes de consommateurs -------------------------------------------------

    async def ensure_group(self, stream: str, group: str) -> None:
        client = await self.client()
        try:
            await client.xgroup_create(stream, group, id="0", mkstream=True)
        except Exception as exc:  # noqa: BLE001 - BUSYGROUP = déjà créé
            if "BUSYGROUP" in str(exc):
                return
            raise

    async def _to_dlq(self, stream: str, fields: dict[str, str], reason: str) -> None:
        dlq = f"{stream}.dlq"
        payload = {**fields, "_dlq_reason": reason, "_dlq_from": stream}
        try:
            client = await self.client()
            await client.xadd(
                dlq, payload, maxlen=self._settings.bus_stream_maxlen, approximate=True
            )
        except Exception:  # noqa: BLE001 - le DLQ ne doit jamais bloquer la boucle
            _logger.exception("bus_dlq_failed", extra={"stream": stream, "reason": reason})

    async def _process(
        self, stream: str, group: str, msg_id: str, fields: dict[str, str], handler: Handler
    ) -> None:
        """Traite un message : décode, exécute le handler avec retry, ACK, sinon DLQ."""
        client = await self.client()
        try:
            envelope = EventEnvelope.from_fields(fields)
        except Exception:  # noqa: BLE001 - message empoisonné → DLQ direct
            _logger.warning("bus_poison_message", extra={"stream": stream, "id": msg_id})
            await self._to_dlq(stream, fields, reason="decode_error")
            await client.xack(stream, group, msg_id)
            return

        attempts = self._settings.bus_max_retries
        base = self._settings.bus_backoff_base_s
        for attempt in range(1, attempts + 1):
            try:
                await handler(envelope)
                await client.xack(stream, group, msg_id)
                return
            except Exception:  # noqa: BLE001 - échec applicatif → retry puis DLQ
                if attempt >= attempts:
                    _logger.exception(
                        "bus_handler_dead",
                        extra={"stream": stream, "id": msg_id, "event": envelope.id},
                    )
                    await self._to_dlq(stream, fields, reason="handler_error")
                    await client.xack(stream, group, msg_id)
                    return
                _logger.warning(
                    "bus_handler_retry",
                    extra={"stream": stream, "id": msg_id, "attempt": attempt},
                )
                await asyncio.sleep(base * (2 ** (attempt - 1)))

    async def reclaim_pending(
        self, stream: str, group: str, consumer: str, handler: Handler
    ) -> int:
        """Réclame/retraite les messages en attente d'un consommateur mort ; renvoie le total."""
        client = await self.client()
        idle = self._settings.bus_reclaim_idle_ms
        start = "0-0"
        processed = 0
        while not self._stop.is_set():
            result = await client.xautoclaim(
                stream, group, consumer, idle, start_id=start, count=100
            )
            cursor, messages = _parse_autoclaim(result)
            for msg_id, fields in messages:
                await self._process(stream, group, msg_id, fields, handler)
                processed += 1
            if not cursor or cursor == "0-0":
                break
            start = cursor
        return processed

    async def run_consumer(
        self,
        stream: str,
        handler: Handler,
        *,
        group: str | None = None,
        consumer: str | None = None,
    ) -> None:
        """Boucle de consommation résiliente (à lancer dans une tâche/worker)."""
        group = group or self._settings.bus_consumer_group
        consumer = consumer or f"{socket.gethostname()}-{os.getpid()}"
        await self.ensure_group(stream, group)
        await self.reclaim_pending(stream, group, consumer, handler)

        block = self._settings.bus_block_ms
        count = self._settings.bus_batch
        _logger.info(
            "bus_consumer_start",
            extra={"stream": stream, "group": group, "consumer": consumer},
        )
        while not self._stop.is_set():
            try:
                client = await self.client()
                resp = await client.xreadgroup(
                    group, consumer, {stream: ">"}, count=count, block=block
                )
            except (TimeoutError, ConnectionError, OSError):
                _logger.warning("bus_read_reconnect", extra={"stream": stream})
                await self._reset_client()
                await asyncio.sleep(self._settings.bus_backoff_base_s)
                continue
            for _stream_name, messages in _parse_read(resp):
                for msg_id, fields in messages:
                    await self._process(stream, group, msg_id, fields, handler)
        _logger.info("bus_consumer_stop", extra={"stream": stream})


# ---- Parsing défensif des réponses Redis ------------------------------------------


def _parse_read(resp: Any) -> list[tuple[str, list[tuple[str, dict[str, str]]]]]:
    """Normalise la réponse XREADGROUP/XREAD en [(stream, [(id, fields), ...]), ...]."""
    out: list[tuple[str, list[tuple[str, dict[str, str]]]]] = []
    if not resp:
        return out
    for entry in resp:
        stream_name, messages = entry[0], entry[1]
        out.append((str(stream_name), [(str(mid), dict(fields)) for mid, fields in messages]))
    return out


def _parse_autoclaim(result: Any) -> tuple[str, list[tuple[str, dict[str, str]]]]:
    """Normalise XAUTOCLAIM → (next_cursor, [(id, fields), ...])."""
    if not result:
        return "0-0", []
    cursor = str(result[0])
    messages = [(str(mid), dict(fields)) for mid, fields in result[1]]
    return cursor, messages


# ---- Singleton applicatif ---------------------------------------------------------

_bus: RedisStreamBus | None = None


def get_bus() -> RedisStreamBus:
    """Retourne le bus applicatif (singleton lié à la config)."""
    global _bus
    if _bus is None:
        settings = get_settings()
        _bus = RedisStreamBus(settings.redis_url, settings=settings)
    return _bus


async def close_bus() -> None:
    global _bus
    if _bus is not None:
        await _bus.close()
        _bus = None
