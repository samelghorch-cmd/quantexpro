"""QuantEXPro backend — source de vérité des séries temporelles (TimescaleDB).

Couche P0-B de la feuille de route institutionnelle : ingestion idempotente et lecture
paginée des ticks / bars / orderbook L2. Le bus ZDL (Redis Streams) vit dans ``app.bus``.
"""

__all__ = ["__version__"]

__version__ = "0.1.0"
