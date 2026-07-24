"""Worker consommateur du bus ZDL — exécutable : ``python -m app.bus.consumer [timeframe]``.

Consomme le stream des bar-close (consumer group), avec ACK / retry / DLQ / reclaim gérés
par ``RedisStreamBus``. Le handler par défaut journalise l'événement de façon structurée ;
les moteurs quant réels s'abonneront via le même mécanisme.

Arrêt propre sur SIGINT / SIGTERM.
"""

from __future__ import annotations

import asyncio
import logging
import signal
import sys

from ..config import get_settings
from ..logging_config import configure_logging
from .events import EventEnvelope, bars_stream
from .redis_bus import close_bus, get_bus

_logger = logging.getLogger(__name__)


async def default_handler(event: EventEnvelope) -> None:
    """Sink par défaut : trace l'événement (remplacé par les moteurs quant en aval)."""
    _logger.info(
        "bus_event",
        extra={"event_id": event.id, "type": event.type, "payload_keys": sorted(event.payload)},
    )


async def run(timeframe: str) -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    if not settings.bus_enabled:
        _logger.error("bus_disabled", extra={"hint": "QX_BUS_ENABLED=true requis"})
        return

    bus = get_bus()
    stream = bars_stream(timeframe)

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, bus.request_stop)
        except NotImplementedError:  # pragma: no cover - plateformes sans signaux
            pass

    try:
        await bus.run_consumer(stream, default_handler)
    finally:
        await close_bus()


def main() -> None:
    timeframe = sys.argv[1] if len(sys.argv) > 1 else "1m"
    asyncio.run(run(timeframe))


if __name__ == "__main__":
    main()
