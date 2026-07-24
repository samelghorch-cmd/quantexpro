# Audit institutionnel — Terminal Quant QuantEXPro

**Date :** 2026-07-24  
**Rôle :** Lead Software Engineer & Quant Architect  
**Sources :** codebase `web/dashboard` (v5.0.0), campagne de tests P0 (`docs/TESTING.md`), recherche externe (audit PROTOS, spec « Hedge-Fund Readiness »), travaux interrompus (~2026-07-22, coupure tokens Claude).

---

## 1. Synthèse exécutive

QuantEXPro est aujourd’hui une **plateforme quant monolithique navigateur** (React 18 + Vite, moteur JS pur, ~69 modules) avec un **collecteur Node 24/7** sur Railway et une **parité moteur dashboard/collector** verrouillée par tests. Le niveau actuel est **« desk de recherche avancé + paper-trading »**, pas encore **« terminal institutionnel multi-utilisateur »**.

| Dimension | État actuel | Cible spec institutionnelle |
|-----------|-------------|----------------------------|
| Frontend | React 18 + Vite, JS (pas TS), SVG/Canvas | React 18 + **Next.js**, **TypeScript strict**, Canvas/WebGL |
| Moteur quant | `src/engine/*` (JS, ~700 stratégies, pipeline FAO→Reco) | Même logique + **Python** (HMM, GEX, Statistical Edge lourd) |
| Persistance | **IndexedDB** + localStorage + `collector-data.json` | **TimescaleDB** + bus ZDL (Redis Streams / NATS / WS ACK) |
| Exécution | Forward Test démo, collector paper Binance | **VPS MT5 + EA** avec acquittement ordre |
| LLM stratégies | Rule Builder + JSON (Core Mode / Importer) | **Qwen2.5-Coder-7B local** (Prompt Mode zero-token) |
| Tests | **109 tests**, CI/Husky prêts, goldens métriques | Étendre invariants + dossiers + moteurs P0.6 |
| Charte UI | Orange `#FF6B00`, fond `#0D0F12` | Fond `#0d0f12`, cartes `#161920`, long `#00e676`, short `#ff1744` |

**Verdict :** la **recherche quant et le pipeline de validation** sont déjà denses et testables ; le gap principal est **l’infra ZDL + backend séries temporelles + exécution MT5 + modules « institutionnels »** (Statistical Edge complet, Alpha Forge, scrapers, GEX réel).

---

## 2. Architecture technique — AS-IS vs TO-BE

### 2.1 AS-IS (déployé / en repo)

```
[Binance / Yahoo proxies] → marketData.js → IndexedDB (dataStore)
                                    ↓
              PipelineContext.jsx ←→ src/engine/* (backtest, FAO, VPIN, …)
                                    ↓
              Dossiers stratégie (dossierStore, writeChain ZDL *locale*)
                                    ↓
              collector/index.js (Railway) — import direct ../src/engine/*
```

- **ZDL partiel :** chaîne d’écriture sérialisée sur dossiers IndexedDB ; pas de bus distribué ni replay idempotent cross-services.
- **Single-user :** pas de rôles PM / Analyste / Risque ni audit log immuable serveur.
- **Données tick/L2 :** VPIN crypto via WS Binance ; carnet L2 réel `@depth`+`@bookTicker` (P2-L2) sur crypto, mock sinon.

### 2.2 TO-BE (spec utilisateur)

```
[Databento / LSE / LMAX / CME / Binance depth] → Python ingest (Railway)
        → TimescaleDB (ticks, bars, L2)
        → Redis Streams / NATS (ACK, retry, backpressure)
        → Quant Engines (HMM, GEX, Statistical Edge)
        → Qwen2.5-Coder-7B (local, strat JSON)
        ↔ Next.js Terminal (WS sécurisés)
        → VPS MT5 EA (exécution + ACK)
```

**Principe de migration :** ne pas réécrire le moteur JS tant que les **goldens et la parité collector** restent la référence ; introduire le backend Python comme **source de vérité des séries** puis **port progressif** des calculs lourds (HMM/GEX/Stat Edge).

---

## 3. Cartographie des 7 modules fonctionnels

Légende : ✅ opérationnel (niveau actuel) · 🟡 partiel / heuristique / mock · 🔴 absent ou externe non branché · 🎯 cible spec.

### MODULE 1 — Statistical Edge (indicateurs)

| Spec | Implémentation actuelle | Gap |
|------|-------------------------|-----|
| Bandeau feeds Databento/LSE/LMAX/CME | ✅ `feedStatus.ts` + chips TickerBar (probes Binance/YF/TS/Collector/Deribit · Databento/CBOE `scoped_out`) | 🟢 statut ; 🟡 Databento L2 payant hors scope |
| Grille 10 métriques (Noise, Persist., IC, Hit, Edge Net, Lag, …) | ✅ `statisticalEdge.js` + page Outils | CSV métriques/séries ✅ |
| Oscillateurs multi-courbes Z-Score / Hurst / régimes | ✅ `oscillators.ts` + panneau Statistical Edge | 🟢 |

**Modules registry proches :** `outils/analyseQuant`, `macro/featureMining`, `trading/hmmRegime`, `optimisation/quantToolbox`.

---

### MODULE 2 — Strategy Builder & Alpha Forge

| Spec | Implémentation actuelle | Gap |
|------|-------------------------|-----|
| Core Mode Developer (no-code) | ✅ `CoreModeDeveloper.jsx` + `ruleBuilder.js` (KAMA, LinReg, Ichimoku) | 🟢 |
| Patterns Library 616 | ✅ `patternsLibrary.ts` · TF M1–MN · familles scalp/intra/swing | 🟢 |
| Prompt Mode Qwen local | ✅ `PromptMode.jsx` + `POST /v1/strategy/from-prompt` | Ollama / Qwen local opt-in |
| Reverse Engineering signaux | ✅ `signalReverse.js` + Strategy Engine → Signal Reverse | CSV/JSON · alignement causal · lift → Rule Builder |
| Alpha Forge + Valid Edges | ✅ `validatedEdges.ts` + `/v1/edges` ZDL | Promote GO A–C · Push/Pull Timescale |
| Anti-Library (Z-Score MR, BB MR, TRIX, …) | ✅ `antiLibrary.ts` + `/v1/anti-library` ZDL | UI + filtre Usine/FAO · Push/Pull Timescale |
| Scraper Reddit/X/QC/SSRN | ✅ RSS research allowlisté (arXiv · NBER · BIS) · X/Reddit/QC ⛔ ToS | 🟢 légal ; SSRN via arXiv/NBER |
| Pass Rate Prop Firm + DSR | ✅ `propfirmConvex.js`, DSR dans Reco + Usine (`factoryDsr.js`, filtre &lt;50 %) | ✅ |

**Travaux en cours (non commités) :** `customStrategies.js` — fusion règles custom (#9001+) dans toute la librairie ; validation stricte Importer/Core Mode ; fix collision id stratégie 117 (VPIN vs EMA).

---

### MODULE 3 — Algorithmic Desk & Portfolio Risk

| Spec | Implémentation actuelle | Gap |
|------|-------------------------|-----|
| Equity / PnL flotte multi-actifs | ✅ `portfolioDesk.js` + Trading → Desk PM | Capital / budget risque / sleeves Alpha Forge + démo + collector |
| Signal Engine WS localhost:5050 | ✅ `signalConsole.js` + hook · Trading → Signal Engine | Local pipeline + WS `/stream/bars/{tf}` (bus ZDL) · journal unifié |
| Stratégies nommées (ORB, Order Block, …) | Librairie ICT/SMC partielle dans 700 strats | Mapping marketing ↔ ids à documenter |

**Modules proches :** `trading/*`, `collector/index.js`, `export/dossiers`.

---

### MODULE 4 — Backtest Dashboard & KPIs institutionnels

| Spec | Implémentation actuelle | Gap |
|------|-------------------------|-----|
| Score global 0–100 | ✅ Backtest + Reco + Validator | ✅ |
| WR, PF, Expectancy, Max DD | ✅ `backtestMetrics.js` | ✅ |
| Quality L2 | ✅ Binance `@depth` + `@bookTicker` (crypto) · mock hors crypto | |
| VPIN BVC + CDF toxicité | ✅ `vpin.js`, pages VPIN + Live | **P0.4 look-ahead calibration buckets** (cf. TESTING.md) |

---

### MODULE 5 — Options, GEX & microstructure

| Spec | Implémentation actuelle | Gap |
|------|-------------------------|-----|
| GEX multi-tenor 0DTE→365D | ✅ `gex.ts` + Macro → Options Gamma | Deribit BTC/ETH public · JSON import · CBOE payant hors scope |
| pPOC, pVAL, confluence OI | ✅ `volumeProfileSessions` + `findConfluence` · VP Footprint + Deribit | 🟢 |
| PCR, Max Pain, Implied Move | ✅ PCR OI · Max Pain · implied move 1σ | Via `gex.js` |

---

### MODULE 6 — Retail Sentiment & Social Scraper

| Spec | Implémentation actuelle | Gap |
|------|-------------------------|-----|
| Scraper X / StockTwits / Telegram / TV Ideas | ⛔ hors scope ToS | RSS institutionnels allowlistés à la place |
| NLP LONG/SHORT/NEUTRAL | ✅ lexique `sentimentFeed.ts` | Pas de LLM — proxy lexical |
| Jaccard co-mouvement | ✅ `meanPairwiseJaccard` | |
| « Envoyer vers Alpha Forge » | ✅ hint `pipeline.sentimentHint` → Usine | |

---

### MODULE 7 — Macro Intelligence & HMM

| Spec | Implémentation actuelle | Gap |
|------|-------------------------|-----|
| HMM régimes (Trend/Range/Vol/Choppy) | ✅ JS + `/v1/quant/hmm` (`parity` \| `baum_welch`) | 🟢 badge JS · BW Python P6 |
| USD Liquidity, Yield, Inflation | ✅ FRED proxy `macroData.js` | ✅ (gratuit) |
| COT | ✅ `cotData.js` | ✅ |
| Crypto Whales, Ship Tracker | Empty state externe | Connecteurs P2 |

---

## 4. Priorités d’ingénierie reconciliées

Les priorités de la spec sont **fusionnées** avec la campagne de tests déjà engagée. Ordre d’exécution **réaliste** (évite un big-bang Next.js + TimescaleDB sans filet).

### 🔴 P0 — Fondations (immédiat)

| ID | Spec utilisateur | État repo | Action |
|----|------------------|-----------|--------|
| P0-T | Golden tests, look-ahead, CI | ✅ 109 tests, Husky, workflow CI | Committer lot tests + custom strategies |
| P0-T4 | VPIN causal | ✅ | Fait : `bucketVolume` calibré sur fenêtre d'amorce fixe (`calibBars`) ; invariance troncature vérifiée ; aucune régénération de golden requise |
| P0-T5 | Cycle vie dossiers IndexedDB | ✅ | Fait : `tests/unit/dossierStore.test.js` (23 tests) — fake-indexeddb, writeChain, gradeLetter, cycle 6 étapes |
| P0-ZDL | Bus ZDL + TimescaleDB | ✅ | **P0a/c ✅** + **P3-ZDL-SYNC ✅** + **P3-COLLECTOR-INGEST ✅** (`QX_BARS_INGEST=1`) ; reste MT5 VPS |
| P0-LLM | Qwen2.5-Coder-7B local | ✅ | Backend `POST /v1/strategy/from-prompt` + UI Prompt Mode (`PromptMode.jsx`) ; schéma miroir `validateRules` |
| P0-MT5 | Pont VPS MT5 | ✅ | Backend + EA ✅ · **P3-MT5-VPS ✅** pack `VPS_DEPLOY.md` + `smoke.mjs` (go-live paper→demo = action ops) |
| P0-RBAC | Rôles + audit log | ✅ | `require_role` (pm/analyst/risk/ea), `audit_events` append-only (trigger + hash SHA-256), `GET /v1/audit` |

### 🟡 P1 — Risque institutionnel

| ID | Action |
|----|--------|
| P1-DSR | DSR dans boucle **Usine à Stratégies** | ✅ | `factoryDsr.js` + worker : nTrials, filtre DSR &lt; 50 %, colonne UI ; 6 tests |
| P1-PORT | Stress 2008 / 2010 / 2020 sur équité portefeuille Usine | ✅ | `portfolioStress.js` + panneau Usine ; limite DD 40 % |
| P1-TCA | Slippage réel vs `costModel.js` | ✅ | `tca.js` + page Trading TCA (backtest next-open / démo / manuel) |
| P1-PDF | Tearsheet PDF par dossier | ✅ | `tearsheet.js` + `pdfLite.js` (zéro dep) · bouton Dossiers |
| P1-ANT | Anti-Library localStorage + filtre Usine/FAO + UI ✅ (TS plus tard) |
| P1-EDGE | Statistical Edge Module 1 (10 métriques + CSV) | ✅ | `statisticalEdge.js` + page Outils |

### 🔵 P2 — Microstructure & UI

| ID | Action |
|----|--------|
| P2-L2 | Binance `@depth` + `bookTicker` | ✅ | `binanceOrderBook.js` + `useBinanceOrderBook` · Microstructure Live / Exec Quality |
| P2-DUKA | `tools/dukascopy` production 15–20 ans | ✅ | `dukascopyImport.js` + `fetch:deep` / `validate` · Data Manager |
| P2-MQL5 | Export EA familles simples | ✅ | `mql5Export.js` · 5 familles · Strategy Builder / Mes Stratégies |
| P2-UI | Labs (Ship Tracker, Live TV), fusion doublons Quant Toolbox / Performance | ✅ | section `labs` + aliases `performanceTool`/`quantToolboxTool` |
| P2-TS | TS incremental engine (pas Next.js) | ✅ | `annualize.ts` · `contracts.ts` · `binanceOrderBook.ts` · `npm run typecheck` |
| P2-SCRAPE | Sentiment Module 6 légal | ✅ | `sentimentFeed.ts` · RSS Fed/SEC/IMF · rate limit · Labs · **pas** X/StockTwits |
| P3-ZDL-SYNC | Dashboard ↔ API bars | ✅ | `barsSync.ts` · migration `0003` TF 15m/1h/4h/1d · Data Manager Push/Pull |
| P3-COLLECTOR-INGEST | Collector → `/v1/bars` | ✅ | `collector/barsIngest.js` · opt-in env · delta + backfill |
| P3-MT5-VPS | Pack go-live VPS | ✅ | `mt5/VPS_DEPLOY.md` · `smoke.mjs` · dry-run tests |
| P4-AF | Alpha Forge Validated Edges | ✅ | `validatedEdges.ts` · page Optimisation · promote Dossiers |
| P4-AUDIT-UI | UI journal audit serveur | ✅ | `auditLog.ts` · Risque → Audit · hash SHA-256 · CSV |
| P4-DESK | Desk PM flotte / réserve risque | ✅ | `portfolioDesk.js` · Trading → Desk PM |
| P4-SIGNAL-WS | Console Signal Engine + WS bars | ✅ | `signalConsole.js` · `/stream/bars` · journal local/WS |
| P4-AF-SYNC | Edges ZDL Timescale | ✅ | `validated_edges` · `/v1/edges` · `edgesSync.ts` · Alembic 0004 |
| P4-GEX | Options Gamma / GEX | ✅ | `gex.ts` · Deribit proxy · Max Pain · PCR · implied move |
| P4-ANT-SYNC | Anti-Library ZDL Timescale | ✅ | `anti_library` · `/v1/anti-library` · `antiLibrarySync.ts` · Alembic 0005 |
| P4-FEEDS | Statut multi-feeds TickerBar | ✅ | `feedStatus.ts` · probes · Databento/CBOE scoped_out |
| P4-VP | pPOC / pVAL / confluence OI | ✅ | `microstructure.js` · sessions UTC · Deribit walls/MaxPain |
| P4-SSO | Session JWT + OIDC PKCE | ✅ | `/v1/auth/session|oidc|me` · Bearer · `ssoAuth.ts` |
| P4-REV | Reverse engineering signaux | ✅ | `signalReverse.js` · page Signal Reverse · rules proposées |
| P4-HMM | Régimes Trend/Range/Vol/Choppy | ✅ | `hmmRegimes` JS + `/v1/quant/hmm` Python |
| P4-OSC | Oscillateurs Z-Score / Hurst / régimes | ✅ | `oscillators.ts` · Statistical Edge multi-courbes + CSV |
| P4-CORE | Core Mode KAMA / LinReg / Ichimoku | ✅ | `IND.kama/linreg` · RULE_SOURCES · overlays Core Mode |
| P4-PAT | Patterns TF M1–MN | ✅ | `patternsLibrary.ts` · filtres famille + UI Core Mode |
| P4-RESEARCH | RSS recherche légaux | ✅ | arXiv q-fin · NBER · BIS · allowlist proxy |
| P5-TS-FEEDS | feedStatus → TypeScript | ✅ | `feedStatus.ts` · types FeedHealth / probes |
| P5-TS-MORE | oscillators → TypeScript | ✅ | `oscillators.ts` · Z-Score / Hurst / régimes |
| P5-TS-EDGES | validatedEdges + edgesSync → TS | ✅ | `ValidatedEdge` · API payload · merge remote |
| P5-HMM-PY | HMM Python paritaire | ✅ | `app/quant/hmm.py` · `/v1/quant/hmm` · golden seed9 |
| P5-OPS | Go-live alembic + MT5 | ✅ | `OPS_GO_LIVE.md` · `ops_migrate.sh` · `ops_preflight.mjs` |
| P6-THEME | Tokens long/short UI | ✅ | `T.long`/`T.short` · `sideColor` · Trades/Live/Sentiment |
| P6-TS-MORE | antiLibrary + sync → TS | ✅ | `AntiEntry` · API payload · merge remote |
| P6-HMM-BW | Baum-Welch Gaussian 1D | ✅ | `hmm_bw.py` · `engine=baum_welch` · heuristic=false |
| P7-TS-PAT | patternsLibrary → TypeScript | ✅ | `Pattern` · TF M1–MN · filtres |
| P7-TS-GEX | gex → TypeScript | ✅ | `OptionRow` · GEX / Max Pain / PCR |
| P7-TS-MORE | auditLog + ssoAuth → TS | ✅ | `AuditEvent` · PKCE / JWT session |

---

## 5. Travaux en cours (WIP — non commités, normal)

> Historique Sprint 0 / P0 (2026-07-22) — **commité**. **P5–P7 clôturés** au 2026-07-24.

**Prochaine action recommandée :** suite produit / TS restants (`microstructure`, `signalReverse`, …).

---

## 6. Écarts stack & décisions d’architecture

1. **Vite vs Next.js :** rester sur Vite jusqu’à P0-T stable ; migrer Next.js en **P1** si SSR/API routes requis pour WS terminal — sinon Vite + API Python suffit pour 6 mois.
2. **TypeScript :** migration **incremental** `src/engine` — P5/P6/P7 (PAT · GEX · audit · SSO) livrés.
3. **Charte couleurs :** orange marque conservé ; tokens long/short `#00e676` / `#ff1744` + `T.card` `#161920` livrés (**P6-THEME**).
4. **Zero pseudo-code :** XGBoost / Autoencoder restent étiquetés. **HMM :** soft-clustering JS (badge) + Python parity + **Baum-Welch** (`engine=baum_welch`).
5. **Parité moteur :** toute duplication Python doit passer par **tests de parité** reprenant les goldens Vitest (export JSON fixtures).
6. **Ops :** migrations head **0005** + preflight documentés (`docs/OPS_GO_LIVE.md`) — exécution prod = action ops humaine.

---

## 7. Checklist « Hedge-Fund Readiness » (scorecard)

| Critère | Score /5 | Note |
|---------|----------|------|
| Backtest causal & métriques | 5 | VPIN calibration corrigée (P0-T4) |
| Pipeline validation (FAO→Reco) | 4 | DSR Usine + Reco |
| Persistance & ZDL | 4 | Timescale + Redis Streams · dashboard Push/Pull bars/edges/anti |
| Exécution live | 3 | Paper Binance + pont MT5 (pack VPS) — go-live ops |
| Données institutionnelles | 1 | Pas Databento/L2 options (scoped_out) |
| Gouvernance (RBAC, audit) | 5 | RBAC + audit UI + SSO JWT / OIDC PKCE |
| Test automation | 5 | Vitest + husky + CI GitHub (`main`) |
| **Total approximatif** | **27/35** | Cible 28+ pour « desk institutionnel soft » |

---

## 8. Documents liés

- `docs/TESTING.md` — campagne P0 tests (invariants, VPIN sentinelle, parité collector)
- `docs/ROADMAP_INGENIERIE.md` — backlog ordonné Cursor + Claude Code
- `README.md` — guide opérationnel v5 actuel

---

*Dernière mise à jour : 2026-07-24 — Cursor (P5-TS-FEEDS) + spec Terminal Quant institutionnel.*
