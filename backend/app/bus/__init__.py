"""Bus d'événements Zero-Data-Loss (Redis Streams).

- ``events``    : enveloppe d'événement typée + helpers (bar.closed, noms de streams).
- ``redis_bus`` : publication (retry/backoff), consumer groups (ACK, retry, DLQ, reclaim),
                  reconnexion automatique et backpressure (MAXLEN approximatif).

La base TimescaleDB reste la source de vérité : le bus sert au fan-out temps réel vers
les moteurs quant et le terminal (WebSocket). En cas d'échec durable de traitement, le
message part en Dead-Letter Queue (``<stream>.dlq``) — aucune perte silencieuse.
"""

from .events import BAR_CLOSED, EventEnvelope, bars_stream, make_bar_closed
from .redis_bus import RedisStreamBus, get_bus

__all__ = [
    "BAR_CLOSED",
    "EventEnvelope",
    "RedisStreamBus",
    "bars_stream",
    "get_bus",
    "make_bar_closed",
]
