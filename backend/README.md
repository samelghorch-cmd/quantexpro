# QuantEXPro Backend — Séries temporelles (P0-B)

Source de vérité des séries de marché (ticks / bars / orderbook L2) sur **TimescaleDB**,
exposée via une API **FastAPI** async. Ingestion **idempotente** (ZDL) et lecture paginée.

## Stack

- FastAPI + Uvicorn (ASGI)
- SQLAlchemy 2.0 async + asyncpg
- TimescaleDB (hypertables)
- Pydantic v2 (validation stricte) / pydantic-settings (config)
- Alembic (migrations)

## Structure

```
backend/
├── app/
│   ├── config.py         # Settings (env QX_*)
│   ├── db.py             # moteur/session async, dispose au shutdown
│   ├── models.py         # ORM typé (bars_1m, bars_5m, ticks, orderbook_l2_snapshots)
│   ├── schemas.py        # contrats Pydantic v2
│   ├── security.py       # auth clé d'API (X-API-Key), fail-safe prod
│   ├── repositories.py   # upserts idempotents + lecture keyset
│   ├── routers/          # health, bars, ticks, orderbook
│   └── main.py           # app FastAPI + lifespan
├── alembic/              # migration 0001 → tables + create_hypertable
├── tests/                # schémas + idempotence SQL (sans DB)
├── Dockerfile            # image prod (migrate + uvicorn)
└── pyproject.toml
```

## Démarrage local

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env            # ajuster QX_DATABASE_URL / QX_API_KEYS

# TimescaleDB via Docker (dev)
docker run -d --name qx-tsdb -p 5432:5432 \
  -e POSTGRES_USER=quant -e POSTGRES_PASSWORD=quant -e POSTGRES_DB=quantexpro \
  timescale/timescaledb:latest-pg16

alembic upgrade head             # crée les hypertables
uvicorn app.main:app --reload
```

## API

| Méthode | Route | Rôle |
|---------|-------|------|
| GET  | `/health` · `/health/ready` | liveness / readiness (DB) |
| POST | `/v1/bars/{timeframe}` | ingestion idempotente de barres (`1m`/`5m`) |
| GET  | `/v1/bars/{symbol}?timeframe=&start=&end=&cursor=&limit=` | lecture paginée (keyset) |
| POST | `/v1/ticks` | ingestion idempotente de ticks |
| POST | `/v1/orderbook` | ingestion idempotente d'instantanés L2 |
| WS   | `/stream/bars/{timeframe}?api_key=` | flux temps réel des bar-close (bus ZDL) |
| POST | `/v1/strategy/from-prompt` | prompt langage naturel → stratégie JSON (LLM local) |

Auth : header `X-API-Key` (clés dans `QX_API_KEYS`, CSV). En production, aucune clé
configurée ⇒ API verrouillée (503).

**Idempotence** : `INSERT ... ON CONFLICT (clé naturelle) DO UPDATE`. Rejouer un lot
(retry réseau, replay du bus ZDL) ne duplique jamais et converge vers la dernière valeur.

## Tests

```bash
pytest            # validation schémas + idempotence SQL (aucune DB requise)
```

## Bus ZDL (P0-C) — `app/bus/`

Redis Streams : publication sur bar-close, consumer groups (ACK), retry backoff
exponentiel, **Dead-Letter Queue** (`<stream>.dlq`), reclaim des messages en attente
(XAUTOCLAIM), reconnexion auto et backpressure (MAXLEN approx).

- **Opt-in** : `QX_BUS_ENABLED=true` (+ `QX_REDIS_URL`). Désactivé → publication no-op
  (la base TS reste la source de vérité), idéal pour un hébergement gratuit sans Redis.
- **Publication** : automatique à l'ingestion de barres (best-effort, n'échoue jamais l'API).
- **Worker consommateur** : `python -m app.bus.consumer 1m` (handler par défaut = log).
- **WebSocket** : `GET /stream/bars/{timeframe}` — tail temps réel pour le terminal.
- **Redis gratuit** : Upstash (free tier) ou Redis Cloud free ; sinon laisser désactivé.

```bash
# Redis local (dev)
docker run -d --name qx-redis -p 6379:6379 redis:7-alpine
QX_BUS_ENABLED=true uvicorn app.main:app --reload
QX_BUS_ENABLED=true python -m app.bus.consumer 1m
```

## LLM local (P0-D) — `app/llm/`

Prompt Mode « zero-token » : un endpoint local traduit une idée en langage naturel en une
stratégie JSON **validée contre le même contrat que le Rule Builder** (`src/engine/ruleBuilder.js`).
Aucune sortie non conforme ne peut sortir de l'API (parité Importer / Core Mode garantie).

- **Endpoint** : `POST /v1/strategy/from-prompt` `{ "prompt": "...", "name": "..." }`
  → `{ "strategy": { "name", "rules": { long, short } }, "source": "qwen-local" }`.
- **Opt-in** : `QX_LLM_ENABLED=true` + un serveur d'inférence OpenAI-compatible local.
- **Modèle recommandé** : Qwen2.5-Coder-7B via **Ollama** (le plus simple) :

```bash
# 1) Installer Ollama (https://ollama.com), puis :
ollama pull qwen2.5-coder:7b
ollama serve                 # expose http://localhost:11434

# 2) Activer côté backend
QX_LLM_ENABLED=true QX_LLM_BASE_URL=http://localhost:11434/v1 \
QX_LLM_MODEL=qwen2.5-coder:7b uvicorn app.main:app --reload

# 3) Tester
curl -X POST localhost:8000/v1/strategy/from-prompt -H 'X-API-Key: <clé>' \
  -H 'content-type: application/json' \
  -d '{"prompt":"achat quand EMA20 croise au-dessus de EMA50 et RSI < 70"}'
```

Alternatives d'inférence : **llama.cpp** (`llama-server`), **vLLM**, **LM Studio** — tout
endpoint exposant `/v1/chat/completions` (variable `QX_LLM_BASE_URL`).
