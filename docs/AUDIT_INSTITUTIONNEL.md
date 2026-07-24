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
| Bandeau feeds Databento/LSE/LMAX/CME | `TickerBar.jsx` — actifs Yahoo/Binance, pas de statut multi-feed institutionnel | 🔴 feeds + statuts |
| Grille 10 métriques (Noise, Persist., IC, Hit, Edge Net, Lag, …) | ✅ `statisticalEdge.js` + page Outils | CSV métriques/séries ✅ |
| Oscillateurs multi-courbes Z-Score / Hurst / régimes | LineChart + ctx ; HMM dans Quant Toolbox / pages trading | 🟡 |

**Modules registry proches :** `outils/analyseQuant`, `macro/featureMining`, `trading/hmmRegime`, `optimisation/quantToolbox`.

---

### MODULE 2 — Strategy Builder & Alpha Forge

| Spec | Implémentation actuelle | Gap |
|------|-------------------------|-----|
| Core Mode Developer (no-code) | ✅ `CoreModeDeveloper.jsx` + `ruleBuilder.js` (AST, pas d’eval) | Renforcer catalogue indicateurs spec (KAMA, LinReg, Ichimoku drag-drop) |
| Patterns Library 616 | ✅ `patternsLibrary.js` | Filtres TF M1–MN à aligner UI |
| Prompt Mode Qwen local | 🔴 | P0 backend LLM |
| Reverse Engineering signaux | 🟡 Strategy Importer JSON | Mode « historique signaux externes » 🔴 |
| Alpha Forge + Valid Edges | ✅ `validatedEdges.js` + page Optimisation `alphaForge` | Promote GO A–C depuis dossiers ; CSV |
| Anti-Library (Z-Score MR, BB MR, TRIX, …) | ✅ `antiLibrary.js` + UI + filtre Usine/FAO | Persist Timescale plus tard |
| Scraper Reddit/X/QC/SSRN | 🔴 | P2 — avec garde-fous légaux + rate limit |
| Pass Rate Prop Firm + DSR | ✅ `propfirmConvex.js`, DSR dans Reco + Usine (`factoryDsr.js`, filtre &lt;50 %) | ✅ |

**Travaux en cours (non commités) :** `customStrategies.js` — fusion règles custom (#9001+) dans toute la librairie ; validation stricte Importer/Core Mode ; fix collision id stratégie 117 (VPIN vs EMA).

---

### MODULE 3 — Algorithmic Desk & Portfolio Risk

| Spec | Implémentation actuelle | Gap |
|------|-------------------------|-----|
| Equity / PnL flotte multi-actifs | 🟡 Performance, Cockpits, Forward Test | Pas de desk PM unifié type « 486k€ / réserve risque 1.4% » |
| Signal Engine WS localhost:5050 | 🟡 `Signal Engine`, collector `:8787` HTTP | WS streaming + console unifiée 🔴 |
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
| GEX multi-tenor 0DTE→365D | 🟡 `optionsGamma` — empty state / connecteur | 🔴 données options réelles |
| pPOC, pVAL, confluence OI | 🟡 VP Footprint, volume profile | 🔴 |
| PCR, Max Pain, Implied Move | 🔴 | P1–P2 |

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
| HMM régimes (Trend/Range/Vol/Choppy) | 🟡 `quantToolbox/hmm`, pages régime | États spec à aligner ; Python HMM cible |
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
| P4-AF | Alpha Forge Validated Edges | ✅ | `validatedEdges.js` · page Optimisation · promote Dossiers |

---

## 5. Travaux en cours (WIP — non commités, normal)

Interruption Claude ~2026-07-22 ; les changements locaux sont **cohérents** avec la direction Alpha Forge / robustesse :

| Zone | Fichiers | Intention |
|------|----------|-----------|
| Stratégies custom | `customStrategies.js`, `strategyLibrary.js`, Core Mode, Importer, `PipelineContext` | ZDL création → librairie #9001+, validation stricte |
| Moteur | `backtest.js`, `backtestExtended.js`, `contracts.js` | Alignement coûts / contrats / parité collector |
| Collector | `collector/index.js` | Support règles custom dans jobs 24/7 |
| UI | `TickerBar`, `ui.jsx`, `Dossiers`, `Backtest` | Finitions UX |
| Qualité | `tests/*`, `vitest.config.js`, `.github/workflows/ci.yml`, `.husky`, `docs/TESTING.md` | P0 test engine |
| Tests actuels | `npm test` | **109 passed** |

**Prochaine action recommandée :** commit unique « P0 custom strategies + test engine » puis enchaîner **P0-T4 VPIN**.

---

## 6. Écarts stack & décisions d’architecture

1. **Vite vs Next.js :** rester sur Vite jusqu’à P0-T stable ; migrer Next.js en **P1** si SSR/API routes requis pour WS terminal — sinon Vite + API Python suffit pour 6 mois.
2. **TypeScript :** spec exige TS strict ; migration **incremental** : `src/engine` en `.ts` en priorité (contrats Pydantic ↔ Zod partagés).
3. **Charte couleurs :** conserver orange TradoBot en **accent marque** ; ajouter tokens `#00e676` / `#ff1744` pour sémantique long/short dans `theme.js` (non-breaking).
4. **Zero pseudo-code :** les modules « heuristique JS » (XGBoost, Autoencoder, HMM réduit) restent **étiquetés** jusqu’au port Python ; interdiction de les présenter comme production hedge fund sans badge.
5. **Parité moteur :** toute duplication Python doit passer par **tests de parité** reprenant les goldens Vitest (export JSON fixtures).

---

## 7. Checklist « Hedge-Fund Readiness » (scorecard)

| Critère | Score /5 | Note |
|---------|----------|------|
| Backtest causal & métriques | 5 | VPIN calibration corrigée (P0-T4) |
| Pipeline validation (FAO→Reco) | 4 | DSR hors Usine |
| Persistance & ZDL | 4 | Backend TimescaleDB + bus Redis Streams (ACK/DLQ) ; reste : brancher dashboard |
| Exécution live | 3 | Paper Binance + pont MT5 (EA pull/ACK) prêt, à déployer VPS |
| Données institutionnelles | 1 | Pas Databento/L2 options |
| Gouvernance (RBAC, audit) | 3 | RBAC rôles + audit append-only (hash) ; reste UI/SSO |
| Test automation | 4 | CI pas encore poussée GitHub |
| **Total approximatif** | **18/35** | Cible 28+ pour « desk institutionnel soft » |

---

## 8. Documents liés

- `docs/TESTING.md` — campagne P0 tests (invariants, VPIN sentinelle, parité collector)
- `docs/ROADMAP_INGENIERIE.md` — backlog ordonné Cursor + Claude Code
- `README.md` — guide opérationnel v5 actuel

---

*Dernière mise à jour : 2026-07-24 — Cursor (Composer) + spec utilisateur Terminal Quant institutionnel.*
