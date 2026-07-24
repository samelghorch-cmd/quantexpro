# Audit institutionnel — QuantEXPro (Terminal Quant)

**Date :** 2026-07-25  
**Commit :** `65ec3c6` (P10-TS-ENGINE)  
**Rôle :** Lead Software Engineer & Quant Architect  
**Sources :** codebase `web/dashboard` v5.0.0 · `npm test` / `npm run typecheck` / pytest backend · `docs/ROADMAP_INGENIERIE.md` · campagne P0–P10

---

## 1. Synthèse exécutive

QuantEXPro est une **plateforme quant de recherche + paper-trading** : React 18 / Vite (UI), moteur unique `src/engine` (TypeScript), collector Node 24/7, API FastAPI + TimescaleDB (ZDL partiel), pont MT5 packagé.

| Dimension | État au 2026-07-25 | Cible « hedge-fund soft » |
|-----------|--------------------|---------------------------|
| Frontend | React 18 + Vite · ~83 entrées sidebar · thème dark + tokens long/short | Next.js optionnel (non bloquant 6 mois) |
| Moteur | **65** `.ts` · **1** worker JS · ~701 stratégies · **11.1k** LOC engine | Typage **strict** sur les 40 fichiers `@ts-nocheck` |
| Persistance | IndexedDB + Timescale (`/v1/bars`, edges, anti-library) | Bus ZDL multi-services mature |
| Exécution | Forward démo · collector Binance · pack MT5 VPS | Go-live paper→demo **ops humaine** |
| Gouvernance | RBAC · audit SHA-256 · SSO JWT/OIDC | ✅ niveau desk |
| Qualité | Vitest **347** · backend **78** · typecheck ✅ · CI/Husky | Retirer `@ts-nocheck` + couverture P0.6 |

**Verdict :** **desk de recherche avancé + paper-trading prêt** (scorecard **28/35**).  
Ce qui reste n’est **pas** une feature manquante majeure du backlog P0–P10, mais :

1. **Ops prod** (secrets, alembic head, smoke MT5) — humain  
2. **Dette TS** — 40 modules bulk encore `@ts-nocheck` (comportement OK, typage à durcir)  
3. **Données payantes** (Databento / CBOE) — scoped_out volontaire  
4. **Exécution live réelle** — pack prêt, activation ops  

---

## 2. Métriques codebase (mesurées)

| Zone | Fichiers | Lignes (approx.) |
|------|----------|------------------|
| `src/engine` | 65 `.ts` + 1 `.js` worker | **11 132** |
| `src/` (UI+engine+hooks) | 135 | **20 934** |
| `src/pages` | 42 JSX | **7 171** |
| `tests/` | 40 | **4 175** |
| `backend/app` | 37 py | **3 934** |
| `collector/` | 2 JS | **294** |

| Qualité | Valeur |
|---------|--------|
| Vitest | **347** passed (39 files) |
| Pytest backend | **78** passed |
| `tsc --noEmit` | **0** erreur |
| Engine typé strict | **25** / 65 |
| Engine `@ts-nocheck` | **40** / 65 |
| Alembic | **0001 → 0005** |
| Registry sidebar | **~83** entrées |

### Modules typés stricts (P2–P9 + random)

`annualize` · `antiLibrary` · `antiLibrarySync` · `apiClient` · `auditLog` · `barsSync` · `binanceOrderBook` · `contracts` · `costModel` · `edgesSync` · `factoryDsr` · `feedStatus` · `gex` · `microstructure` · `oscillators` · `patternsLibrary` · `portfolioDesk` · `random` · `ruleBuilder` · `sentimentFeed` · `signalConsole` · `signalReverse` · `ssoAuth` · `tca` · `validatedEdges`

### Bulk `@ts-nocheck` (priorité de reprise)

**Critique moteur :** `indicators` · `context` · `strategyLibrary` · `backtest` · `backtestExtended` · `backtestMetrics` · `vpin`  
**Usine / optim :** `strategyFactory` · `fao` · `geneticOptimizer` · `quantOptimizer` · `statisticalEdge`  
**Stores / IO :** `dataStore` · `dossierStore` · `marketData` · `mql5Export` · …

---

## 3. Architecture AS-IS

```
[Binance / Yahoo / Deribit / FRED / RSS]
        ↓
  marketData.ts / feeds → IndexedDB (dataStore) + optionnel Timescale (/v1/bars)
        ↓
  PipelineContext ←→ src/engine/* (backtest, FAO, VPIN, GEX, Desk, …)
        ↓
  Dossiers / Validated Edges / Anti-Library  ↔  API FastAPI (RBAC, audit, SSO)
        ↓
  collector/index.js (Node 22 + strip-types) — MÊME moteur ../src/engine/*
        ↓
  (opt) MT5 EA via pack VPS_DEPLOY
```

**Parité :** test d’intégration impose les imports collector → `strategyLibrary.ts` / `context.ts` / `backtestExtended.ts`.  
**Principe :** un seul moteur — jamais de second moteur Python/JS divergents sans goldens de parité.

---

## 4. Cartographie fonctionnelle (7 modules)

Légende : ✅ OK · 🟡 partiel · ⛔ hors scope / ops

| Module | État | Preuve |
|--------|------|--------|
| 1 Statistical Edge | ✅ | `statisticalEdge.ts` · `oscillators.ts` · `feedStatus.ts` |
| 2 Alpha Forge / Builder | ✅ | Core Mode · Patterns · Prompt LLM · Reverse · Edges · Anti-Lib · DSR Usine |
| 3 Algorithmic Desk | ✅ | Desk PM · Signal Engine WS · Forward Test · collector |
| 4 Backtest KPIs | ✅ | metrics · Reco · VPIN (causal P0-T4) · tearsheet PDF |
| 5 GEX / microstructure | ✅ | `gex.ts` Deribit · VP / pPOC / confluence |
| 6 Sentiment | ✅ | RSS allowlisté · pas X/Reddit (ToS) |
| 7 Macro / HMM | ✅ | FRED · COT · HMM JS + Python parity + Baum-Welch |

---

## 5. Backlog P0–P10 — clôture

**P0–P9 :** livrés (voir tableau historique §4 précédent / ROADMAP).  
**P10-TS-ENGINE :** livré — engine en `.ts`, imports `.ts`, collector strip-types, typecheck + 347 tests verts.

Il n’y a **plus de ticket P0–P10 ouvert** dans la roadmap d’ingénierie hors :

| Reste | Nature | Owner |
|-------|--------|-------|
| Retirer `@ts-nocheck` (40 fichiers) | Dette qualité | Dev (progressif) |
| `QX_SSO_SECRET` + `alembic upgrade head` | Ops prod | Humain |
| Smoke MT5 paper→demo | Ops | Humain |
| Databento / CBOE L2 options | Budget data | Décision business |
| Next.js / Python moteur lourd | Reporté | Architecture |

---

## 6. Scorecard Hedge-Fund Readiness (2026-07-25)

| Critère | /5 | Note |
|---------|----|------|
| Backtest causal & métriques | 5 | VPIN causal · goldens · invariants |
| Pipeline validation (FAO→Reco) | 4 | DSR Usine + Reco · Usine stress |
| Persistance & ZDL | 4 | Timescale + bars/edges/anti · pas encore bus multi-région |
| Exécution live | 3 | Paper + pack MT5 — go-live ops |
| Données institutionnelles | 2 | Feeds publics OK · Databento/CBOE scoped_out |
| Gouvernance (RBAC, audit, SSO) | 5 | Complet |
| Test automation | 5 | 347 + 78 · CI · husky · typecheck |
| **Total** | **28/35** | Seuil « desk institutionnel soft » atteint |

Delta vs audit précédent (27/35) : **+1** (TS engine + couverture tests 347).

---

## 7. Risques & recommandations

### Risques

| ID | Risque | Sévérité | Mitigation |
|----|--------|----------|------------|
| R1 | `@ts-nocheck` masque des erreurs de typage sur cœur backtest | Moyenne | Reprise prioritaire `indicators` → `context` → `backtest*` → `strategyLibrary` |
| R2 | Go-live MT5 non exécuté | Haute business | Suivre `docs/OPS_GO_LIVE.md` |
| R3 | Secrets SSO absents en prod | Haute | `QX_SSO_SECRET` + rotation clés |
| R4 | Overfit Usine malgré DSR | Moyenne | Respecter filtre 50 % · nTrials · OOS |
| R5 | Node strip-types collector | Faible | Node ≥ 22 documenté Dockerfile |

### Recommandations ordonnées

1. **Ops :** migrate 0005 + SSO + preflight (`scripts/ops_preflight.mjs`)  
2. **TS :** enlever `@ts-nocheck` sur chaîne critique backtest (5–7 fichiers)  
3. **Mesure :** garder CI rouge si typecheck/tests cassent  
4. **Ne pas** migrer Next.js tant que Vite + API Python tiennent la charge  
5. **Ne pas** inventer de feeds payants — empty state / scoped_out

---

## 8. Checklist DoD session audit

- [x] `npm run typecheck` vert  
- [x] `npm test` → 347  
- [x] backend pytest → 78  
- [x] Engine 65 `.ts` / worker seul en JS  
- [x] Collector parité `.ts`  
- [x] Docs STATUS / ROADMAP / cet audit  
- [ ] Ops prod (hors agent)  
- [ ] Typage strict 40 fichiers (chantier suivant)

---

## 9. Documents liés

- `docs/ROADMAP_INGENIERIE.md` — backlog P0–P10  
- `docs/TESTING.md` — invariants / VPIN / parité  
- `docs/OPS_GO_LIVE.md` — migrate + MT5 + SSO  
- `docs/memory/STATUS.md` · `MEMORY.md`  
- Canvas IDE : audit interactif (session)

---

*Audit régénéré 2026-07-25 — Cursor agent · post P10-TS-ENGINE.*
