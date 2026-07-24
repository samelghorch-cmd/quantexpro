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

- [x] **P1-DSR** DSR + nTrials dans **Usine** (`factoryDsr.ts` + `factory.worker.js` + UI) ✅
- [x] **P1-ANT** Anti-Library store + filtre Usine/FAO (`antiLibrary.js` + UI) ✅
- [x] **P1-PORT** Stress scenarios portefeuille (`portfolioStress.js` — 2008/2010/2020) ✅
- [x] **P1-TCA** TCA module (slippage observé vs `costModel.ts`) ✅
- [x] **P1-PDF** Tearsheet PDF par dossier (`tearsheet.js` + `pdfLite.js`) ✅
- [x] **P1-EDGE** Statistical Edge Module 1 (grille 10 métriques + CSV) ✅

---

## P2 — Microstructure & polish

- [x] **P2-L2** Binance L2 WS (`@depth` + `@bookTicker`) ✅
- [x] **P2-DUKA** Dukascopy batch historique (15–20 ans, validate + Data Manager) ✅
- [x] **P2-MQL5** Export EA familles simples (maCross, rsiRev, macd, donchian, bbBounce) ✅
- [x] **P2-UI** Labs + fusion nav (Ship Tracker, Live TV · Toolbox/Performance) ✅
- [x] **P2-TS** TypeScript incremental (`annualize` · `contracts` · `binanceOrderBook` + `tsc`) ✅ — **Next.js reporté** (Vite OK, audit §6)
- [x] **P2-SCRAPE** Sentiment RSS légal (Fed/SEC/IMF · rate limit · Jaccard) ✅ — **pas** de scraping social ToS
- [ ] Migration Next.js (reporté)

---

## P3 — ZDL wire-up (post-P2)

- [x] **P3-ZDL-SYNC** Dashboard ↔ TimescaleDB (`barsSync.ts` · TF 15m/1h/4h/1d · Data Manager Push/Pull) ✅
- [x] **P3-COLLECTOR-INGEST** Collector → `/v1/bars` (opt-in `QX_BARS_INGEST=1`) ✅
- [x] **P3-MT5-VPS** Pack déploiement VPS + smoke API (`mt5/VPS_DEPLOY.md`, `smoke.mjs`) ✅

---

## P4 — Alpha Forge & desk (post-P3)

- [x] **P4-AF** Registre Validated Edges (`validatedEdges.ts` + page Alpha Forge + promote Dossiers) ✅
- [x] **P4-AUDIT-UI** Journal serveur `/v1/audit` dans Risque → Audit (`auditLog.ts` + vérif hash) ✅
- [x] **P4-DESK** Desk PM unifié (equity flotte + réserve risque % capital) ✅
- [x] **P4-SIGNAL-WS** Console Signal Engine (local + WS `/stream/bars`) ✅
- [x] **P4-AF-SYNC** Validated Edges → Timescale (`/v1/edges` + Push/Pull Alpha Forge) ✅
- [x] **P4-GEX** Options Gamma réel (GEX / Max Pain / PCR · Deribit + JSON) (`gex.ts`) ✅
- [x] **P4-ANT-SYNC** Anti-Library → Timescale (`/v1/anti-library` + Push/Pull) ✅
- [x] **P4-FEEDS** Statut multi-feeds TickerBar (`feedStatus.ts` · probes réels · Databento/CBOE `scoped_out`) ✅
- [x] **P4-VP** pPOC / pVAL + confluence OI (`microstructure.ts` · VP Footprint · Deribit) ✅
- [x] **P4-SSO** Session JWT + OIDC PKCE (`/v1/auth/*` · Bearer · `ssoAuth.ts`) ✅
- [x] **P4-REV** Reverse engineering signaux historiques (`signalReverse.ts` · Signal Reverse) ✅
- [x] **P4-HMM** Régimes Trend/Range/Vol/Choppy (`hmmRegimes` · HMM Regime / Regime Clock) ✅
- [x] **P4-OSC** Oscillateurs Z-Score / Hurst / régimes (`oscillators.ts` · Statistical Edge) ✅
- [x] **P4-CORE** Catalogue Core Mode KAMA / LinReg / Ichimoku (`ruleBuilder` + overlays) ✅
- [x] **P4-PAT** Patterns Library TF M1–MN + familles scalp/intra/swing (`patternsLibrary.ts`) ✅
- [x] **P4-RESEARCH** RSS recherche légaux (arXiv q-fin · NBER · BIS) ✅

---

## P5 — Qualité & ports (post-P4)

- [x] **P5-TS-FEEDS** `feedStatus.js` → `feedStatus.ts` (types stricts + probes) ✅
- [x] **P5-TS-MORE** `oscillators.js` → `oscillators.ts` (Z-Score / Hurst / régimes) ✅
- [x] **P5-TS-EDGES** `validatedEdges` + `edgesSync` → TypeScript ✅
- [x] **P5-HMM-PY** Port HMM Python paritaire (`/v1/quant/hmm` · golden seed9) ✅
- [x] **P5-OPS** Go-live ops (`OPS_GO_LIVE.md` · migrate 0005 · preflight · MT5 paper→demo) ✅

---

## P6 — Polish produit (post-P5)

- [x] **P6-THEME** Tokens long/short `#00e676` / `#ff1744` + `T.card` (`theme.js`) ✅
- [x] **P6-TS-MORE** `antiLibrary` + `antiLibrarySync` → TypeScript ✅
- [x] **P6-HMM-BW** Baum-Welch Gaussian 1D (`hmm_bw.py` · `engine=baum_welch`) ✅

---

## P7 — Suite TS & produit (post-P6)

- [x] **P7-TS-PAT** `patternsLibrary.js` → `patternsLibrary.ts` ✅
- [x] **P7-TS-GEX** `gex.js` → `gex.ts` ✅
- [x] **P7-TS-MORE** `auditLog.ts` + `ssoAuth.ts` ✅

---

## P8 — Suite TS (post-P7)

- [x] **P8-TS-MICRO** `microstructure.js` → `microstructure.ts` (VP / pPOC / confluence) ✅
- [x] **P8-TS-REV** `signalReverse.js` → `signalReverse.ts` ✅
- [x] **P8-TS-DESK** `portfolioDesk.js` → `portfolioDesk.ts` ✅

---

## P9 — Suite TS (post-P8)

- [x] **P9-TS-SIGNAL** `signalConsole.js` → `signalConsole.ts` (slots · consensus · WS bars) ✅
- [x] **P9-TS-TCA** `tca.js` → `tca.ts` (slippage observé vs costModel) ✅
- [x] **P9-TS-RULE** `ruleBuilder.js` → `ruleBuilder.ts` (+ collector strip-types) ✅
- [x] **P9-TS-COST** `costModel.js` → `costModel.ts` (classes · factory backtest) ✅
- [x] **P9-TS-DSR** `factoryDsr.js` → `factoryDsr.ts` (filtre DSR Usine) ✅
- [x] **P9-TS-API** `apiClient.js` → `apiClient.ts` (Bearer / X-API-Key) ✅

---

## P10 — Engine 100 % TypeScript (bulk)

- [x] **P10-TS-ENGINE** tous les modules `src/engine/*.js` → `.ts` (sauf `factory.worker.js`) ✅
  - `allowImportingTsExtensions` · imports `.ts` (Node strip-types + Vite)
  - Collector + test parité causality
  - Garde-fous : typecheck + **347** tests
  - Suivi : retirer `@ts-nocheck` progressivement sur ~40 fichiers bulk

---

## Mapping spec → pages actuelles (référence rapide)

| Module spec | Entrées sidebar actuelles |
|-------------|---------------------------|
| 1 Statistical Edge | ✅ `statisticalEdge` (+ `analyseQuant`, `featureMining`) |
| 2 Alpha Forge | `alphaForge`, `factory`, `coreMode`, `strategyImporter`, `fao`, `validator` |
| 3 Algorithmic Desk | `pmDesk`, `cockpit`, `signalEngine`, `forwardTest`, collector |
| 4 Backtest KPIs | `backtest`, `recoFinale`, `vpin` |
| 5 GEX | ✅ `optionsGamma` — Deribit + JSON import |
| 6 Sentiment | ✅ `sentiment` (Labs) — RSS allowlisté |
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
