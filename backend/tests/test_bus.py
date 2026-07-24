"""Tests du bus ZDL (Redis Streams) — avec un faux client Redis en mémoire.

Couvre les garanties clés : publication, ACK après succès, retry borné puis Dead-Letter
Queue, message empoisonné → DLQ, boucle de consommation, et reclaim des messages en attente.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest

from app.bus.events import EventEnvelope, bars_stream
from app.bus.redis_bus import RedisStreamBus
from app.config import Settings

UTC = dt.UTC


def _fast_settings() -> Settings:
    return Settings(bus_max_retries=3, bus_backoff_base_s=0.001, bus_reclaim_idle_ms=1000)


def _envelope(i: int = 1) -> EventEnvelope:
    return EventEnvelope(
        id=f"BTC:1m:{i}", type="bar.closed", ts=dt.datetime(2026, 7, 24, tzinfo=UTC),
        payload={"symbol": "BTC", "close": 100 + i},
    )


class FakeRedis:
    """Redis Streams minimal en mémoire (sous-ensemble utilisé par le bus)."""

    def __init__(self) -> None:
        self.streams: dict[str, list[tuple[str, dict[str, str]]]] = {}
        self.groups: dict[tuple[str, str], dict[str, Any]] = {}
        self._counter = 0

    async def xadd(
        self, name: str, fields: dict[str, str], *,
        maxlen: int | None = None, approximate: bool = True,
    ) -> str:
        self._counter += 1
        mid = f"{self._counter}-0"
        self.streams.setdefault(name, []).append((mid, dict(fields)))
        if maxlen and len(self.streams[name]) > maxlen:
            self.streams[name] = self.streams[name][-maxlen:]
        return mid

    async def xgroup_create(
        self, name: str, groupname: str, id: str = "0", mkstream: bool = False
    ) -> bool:
        if name not in self.streams and mkstream:
            self.streams[name] = []
        key = (name, groupname)
        if key in self.groups:
            raise RuntimeError("BUSYGROUP Consumer Group name already exists")
        cursor = 0 if id == "0" else len(self.streams.get(name, []))
        self.groups[key] = {"cursor": cursor, "pending": {}}
        return True

    async def xreadgroup(
        self, groupname: str, consumername: str, streams: dict[str, str],
        count: int | None = None, block: int | None = None,
    ) -> list[Any]:
        out: list[Any] = []
        for name in streams:
            g = self.groups[(name, groupname)]
            msgs = self.streams.get(name, [])
            delivered: list[tuple[str, dict[str, str]]] = []
            i = g["cursor"]
            while i < len(msgs) and (count is None or len(delivered) < count):
                mid, fields = msgs[i]
                g["pending"][mid] = dict(fields)
                delivered.append((mid, dict(fields)))
                i += 1
            g["cursor"] = i
            if delivered:
                out.append([name, delivered])
        return out

    async def xack(self, name: str, groupname: str, *ids: str) -> int:
        g = self.groups.get((name, groupname))
        n = 0
        if g:
            for i in ids:
                if i in g["pending"]:
                    del g["pending"][i]
                    n += 1
        return n

    async def xautoclaim(
        self, name: str, groupname: str, consumername: str, min_idle_time: int,
        start_id: str = "0-0", count: int | None = None,
    ) -> list[Any]:
        g = self.groups.get((name, groupname))
        if not g:
            return ["0-0", [], []]
        claimed = [(mid, dict(f)) for mid, f in g["pending"].items()]
        return ["0-0", claimed, []]

    async def xread(
        self, streams: dict[str, str], count: int | None = None, block: int | None = None
    ) -> list[Any]:
        out: list[Any] = []
        for name, last in streams.items():
            msgs = self.streams.get(name, [])
            if last == "$":
                sel: list[tuple[str, dict[str, str]]] = []
            elif last in ("0", "0-0"):
                sel = list(msgs)
            else:
                idx = next((k for k, (mid, _) in enumerate(msgs) if mid == last), -1)
                sel = msgs[idx + 1 :] if idx >= 0 else list(msgs)
            if count:
                sel = sel[:count]
            if sel:
                out.append([name, [(mid, dict(f)) for mid, f in sel]])
        return out

    async def aclose(self) -> None:
        return None


def _bus(fake: FakeRedis) -> RedisStreamBus:
    return RedisStreamBus("redis://fake", settings=_fast_settings(), client=fake)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_publish_adds_to_stream() -> None:
    fake = FakeRedis()
    bus = _bus(fake)
    stream = bars_stream("1m")
    mid = await bus.publish(stream, _envelope())
    assert mid.endswith("-0")
    assert len(fake.streams[stream]) == 1


@pytest.mark.asyncio
async def test_consume_acks_on_success() -> None:
    fake = FakeRedis()
    bus = _bus(fake)
    stream = bars_stream("1m")
    group = "g"
    await bus.publish(stream, _envelope(1))
    await bus.ensure_group(stream, group)
    resp = await fake.xreadgroup(group, "c", {stream: ">"})
    (_name, messages) = resp[0]
    received: list[str] = []

    async def handler(ev: EventEnvelope) -> None:
        received.append(ev.id)

    for mid, fields in messages:
        await bus._process(stream, group, mid, fields, handler)

    assert received == ["BTC:1m:1"]
    assert fake.groups[(stream, group)]["pending"] == {}  # ACK effectué


@pytest.mark.asyncio
async def test_retry_then_dead_letter() -> None:
    fake = FakeRedis()
    bus = _bus(fake)
    stream = bars_stream("1m")
    group = "g"
    await bus.publish(stream, _envelope(2))
    await bus.ensure_group(stream, group)
    (_name, messages) = (await fake.xreadgroup(group, "c", {stream: ">"}))[0]
    calls = {"n": 0}

    async def failing(ev: EventEnvelope) -> None:
        calls["n"] += 1
        raise RuntimeError("boom")

    for mid, fields in messages:
        await bus._process(stream, group, mid, fields, failing)

    assert calls["n"] == 3  # bus_max_retries tentatives
    assert len(fake.streams[f"{stream}.dlq"]) == 1  # basculé en DLQ
    assert fake.groups[(stream, group)]["pending"] == {}  # puis ACK (pas de blocage)


@pytest.mark.asyncio
async def test_poison_message_to_dlq() -> None:
    fake = FakeRedis()
    bus = _bus(fake)
    stream = bars_stream("1m")
    group = "g"
    await fake.xadd(stream, {"garbage": "no-data-field"})  # message empoisonné
    await bus.ensure_group(stream, group)
    (_name, messages) = (await fake.xreadgroup(group, "c", {stream: ">"}))[0]

    async def handler(ev: EventEnvelope) -> None:  # ne doit jamais être appelé
        raise AssertionError("handler ne devrait pas voir un message empoisonné")

    for mid, fields in messages:
        await bus._process(stream, group, mid, fields, handler)

    dlq = fake.streams[f"{stream}.dlq"]
    assert len(dlq) == 1
    assert dlq[0][1]["_dlq_reason"] == "decode_error"


@pytest.mark.asyncio
async def test_run_consumer_processes_then_stops() -> None:
    fake = FakeRedis()
    bus = _bus(fake)
    stream = bars_stream("1m")
    await bus.publish(stream, _envelope(1))
    await bus.publish(stream, _envelope(2))
    seen: list[str] = []

    async def handler(ev: EventEnvelope) -> None:
        seen.append(ev.id)
        if len(seen) >= 2:
            bus.request_stop()

    await bus.run_consumer(stream, handler, group="g", consumer="c")
    assert sorted(seen) == ["BTC:1m:1", "BTC:1m:2"]


@pytest.mark.asyncio
async def test_reclaim_pending_reprocesses() -> None:
    fake = FakeRedis()
    bus = _bus(fake)
    stream = bars_stream("1m")
    group = "g"
    await bus.publish(stream, _envelope(9))
    await bus.ensure_group(stream, group)
    # Livré à un consommateur « mort » (pending, jamais acké).
    await fake.xreadgroup(group, "dead", {stream: ">"})
    assert len(fake.groups[(stream, group)]["pending"]) == 1

    seen: list[str] = []

    async def handler(ev: EventEnvelope) -> None:
        seen.append(ev.id)

    processed = await bus.reclaim_pending(stream, group, "rescuer", handler)
    assert processed == 1
    assert seen == ["BTC:1m:9"]
    assert fake.groups[(stream, group)]["pending"] == {}
