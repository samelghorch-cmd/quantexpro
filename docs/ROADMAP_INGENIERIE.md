# Feuille de route ingénierie — QuantEXPro

Backlog exécutable pour **Cursor + Claude Code**, aligné sur `docs/AUDIT_INSTITUTIONNEL.md` et la spec Terminal Quant institutionnel.

**Règle d’or :** P0 tests & moteur JS d’abord → backend ZDL → MT5 → Next/TS massif.

---

## Sprint 0 — Reprise (1–2 jours)

- [ ] **S0.1** Vérifier `npm test` (109) + `npm run build`
- [ ] **S0.2** Committer le WIP : custom strategies, tests, CI, husky, fix id 117
- [ ] **S0.3** Pousser `main` → activer GitHub Actions CI bloquante
- [x] **S0.4** Corriger **VPIN causal** (`vpin.js` bucketVolume) — P0-T4 ✅ (amorce fixe `calibBars`)
- [x] **S0.5** Tests dossiers IndexedDB — P0-T5 ✅ (fake-indexeddb, 23 tests writeChain/grade/cycle)

---

## P0 — Fondations critiques

### P0-A — Moteur & qualité (JS, inchangé stack)

| Tâche | Fichiers / zone | DoD |
|-------|-----------------|-----|
| ~~VPIN causal~~ ✅ | `src/engine/vpin.js`, tests intégration | Fait : calibration `bucketVolume` sur amorce fixe ; sentinelle retirée ; invariance troncature verte |
| ~~Dossiers ZDL tests~~ ✅ | `dossierStore.js`, `tests/unit/dossierStore.test.js` | Fait : fake-indexeddb ; writeChain prouvée (anti lost-update) ; cycle 6 étapes snapshot |
| Couverture P0.6 | walkforward, montecarlo, fao, costModel | Seuils CI 80 % lignes moteur |
| DSR dans Reco | déjà fait | Documenter seuils dans audit |

### P0-B — Backend Python + TimescaleDB (`backend/`) — ✅ scaffolding livré

| Tâche | DoD | État |
|-------|-----|------|
| Schéma TS : `ticks`, `bars_1m`, `bars_5m`, `orderbook_l2_snapshots` | Migrations Alembic (`0001`, hypertables) | ✅ |
| Ingest REST : POST bars/ticks/orderbook | Idempotent (`ON CONFLICT DO UPDATE`, PK `symbol,ts`) | ✅ |
| API GET : `/v1/bars/{symbol}` paginé | Keyset cursor sur `ts` | ✅ |
| Health + logs structurés | `/health`, `/health/ready`, logs JSON | ✅ |
| Reste (déploiement) | Railway + brancher collector/dashboard sur l'API (remplacer lecture IndexedDB) | ⬜ |

> Livré : `backend/` (FastAPI async + SQLAlchemy 2.0 + Pydantic v2), 13 tests verts
> (schémas + idempotence SQL, sans DB). Déploiement Railway = action infra à part.

### P0-C — Bus ZDL (minimal viable) — ✅ livré (`backend/app/bus/`)

| Tâche | DoD | État |
|-------|-----|------|
| Redis Streams | Publish bar-close events (`publish` + wiring ingestion) | ✅ |
| Consumer + ACK | Consumer groups, ACK, **retry backoff exponentiel**, **DLQ**, reclaim (XAUTOCLAIM) | ✅ |
| Dashboard WS `/stream/bars` | WS `GET /stream/bars/{tf}` (tail temps réel) ; reconnexion côté client | ✅ |
| Résilience | Reconnexion auto, backpressure (MAXLEN), opt-in `QX_BUS_ENABLED` | ✅ |

> Livré : bus typé (mypy strict), 6 tests avec faux client Redis en mémoire (ACK,
> retry→DLQ, message empoisonné, run_consumer, reclaim). Worker : `python -m app.bus.consumer`.

### P0-D — LLM local (Qwen2.5-Coder-7B) — ✅ backend livré (`backend/app/llm/`)

| Tâche | DoD | État |
|-------|-----|------|
| Endpoint OpenAI-compatible local | Client httpx (Ollama/llama.cpp/vLLM), retry, opt-in `QX_LLM_ENABLED` | ✅ |
| `POST /v1/strategy/from-prompt` → JSON Rule Builder | Schéma Pydantic **miroir de `validateRules`** (parité) | ✅ |
| UI Prompt Mode | Frontend `PromptMode.jsx` branché sur `/v1/strategy/from-prompt` | ✅ |

> Livré : `app/llm/` (rules mirror + prompt + client + service), extraction JSON robuste
> (fences/prose), 15 tests (schéma + service avec faux client, sans modèle). Doc Ollama.

### P0-E — MT5 & gouvernance — ✅ livré (`backend/app/routers/mt5.py`, `mt5/`)

| Tâche | DoD | État |
|-------|-----|------|
| EA bridge : signal JSON + ACK HTTP | EA `mt5/QuantEXProBridge.mq5` (pull `/signals/pending` → exécute → ACK `/executions`) | ✅ |
| Auth API keys par environnement | `QX_API_KEYS` / `QX_API_KEY_ROLES` (aucun secret en repo) | ✅ |
| Audit log append-only | table `audit_events` + trigger anti UPDATE/DELETE, hash SHA-256 payload, `GET /v1/audit` | ✅ |
| RBAC rôles PM/Analyste/Risque(/EA) | `require_role`, signaux réservés PM/Risque, EA = pull/ACK | ✅ |

> Idempotence via `client_order_id`, modes paper→demo→live. 17 tests (RBAC, audit, MT5).

---

## P1 — Risque institutionnel

- [ ] DSR + nTrials dans **Usine** (`StrategyFactory.jsx` + worker)
- [ ] Anti-Library store + filtre Usine/FAO
- [ ] Stress scenarios portefeuille
- [ ] TCA module (slippage observé vs modèle)
- [ ] PDF tearsheet par dossier
- [ ] **Statistical Edge Module 1** (grille 10 métriques + CSV)

---

## P2 — Microstructure & polish

- [ ] Binance L2 WS
- [ ] Dukascopy batch historique
- [ ] Export MQL5 EA templates
- [ ] UI Labs + fusion navigation
- [ ] Migration **Next.js + TS strict** (si SSR/WS justifié)
- [ ] Scrapers sentiment (Module 6) — légal + rate limits

---

## Mapping spec → pages actuelles (référence rapide)

| Module spec | Entrées sidebar actuelles |
|-------------|---------------------------|
| 1 Statistical Edge | `analyseQuant`, `featureMining`, `quantToolbox` → **à fusionner** |
| 2 Alpha Forge | `factory`, `coreMode`, `strategyImporter`, `fao`, `validator` → **à regrouper UX** |
| 3 Algorithmic Desk | `cockpit`, `signalEngine`, `forwardTest`, collector |
| 4 Backtest KPIs | `backtest`, `recoFinale`, `vpin` |
| 5 GEX | `optionsGamma`, `vpFootprint` |
| 6 Sentiment | *(à créer section ou Macro)* |
| 7 Macro HMM | `hmmRegime`, `yieldCurve`, `usdLiquidity`, `cot`, … |

---

## Prompt système Cursor / Claude (extrait opérationnel)

Pour chaque tâche :

1. Lire `docs/AUDIT_INSTITUTIONNEL.md` + ce fichier.
2. Code production complet — pas de TODO placeholder.
3. Tests pour toute modification `src/engine/*`.
4. Préserver parité `collector/index.js` ↔ dashboard.
5. Typage : JSDoc strict maintenant ; `.ts` quand fichier touché en refactor P1+.

---

*Maintenu avec l’audit du 2026-07-24.*
