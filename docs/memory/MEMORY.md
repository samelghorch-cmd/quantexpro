# Mémoire QuantEXPro — source de vérité

> **Lire en premier** avant toute session Cursor / Claude Code.  
> Mise à jour : 2026-07-24 · Workspace : `~/Documents/Claude/Projects/tradobot/web/dashboard`

---

## 1. Identité du projet

| | |
|---|---|
| **Nom** | QuantEXPro (Terminal Quant) |
| **Pas** | TradoBot Shopify/MQL5 (ancien business — projet **séparé**) |
| **Stack actuelle** | React 18 + Vite · JS · moteur `src/engine/*` · collector Node Railway |
| **Cible institutionnelle** | Next.js/TS · Python + TimescaleDB · bus ZDL · VPS MT5 · Qwen local |
| **Dev** | `npm run dev` → http://localhost:5173 |
| **Tests** | `npm test` → **263 verts** · backend `pytest` → **53 verts** |

---

## 2. Carte des chemins (PC)

| Rôle | Chemin |
|------|--------|
| **Code (git)** | `~/Documents/Claude/Projects/tradobot/web/dashboard/` |
| **Indicateurs historiques** | `~/Documents/Claude/Projects/tradobot/indicators/` |
| **Business TradoBot (séparé)** | `~/Documents/Claude/Projects/tradobot/` (MQL5, Shopify, marketing) |
| **Rangement / backups** | `~/Documents/🗂️ Mon Rangement/💼 PRO/QuantExPro/` |
| **Vault Obsidian** | `~/Documents/Obsidian Vault/04_MON-PC/💼 PRO - QuantExPro.md` |
| **Audit + roadmap** | `docs/AUDIT_INSTITUTIONNEL.md`, `docs/ROADMAP_INGENIERIE.md` |
| **Tests P0** | `docs/TESTING.md` |
| **État session** | `docs/memory/STATUS.md` (ce dossier) |
| **Agents Cursor** | `.cursor/agents/` |
| **Règles Cursor** | `.cursor/rules/` |

---

## 3. Architecture en une phrase

Monolithe navigateur (69 modules) + **même moteur JS** importé par le collector 24/7 → paper Binance. Persistance dossiers = IndexedDB (ZDL locale). Pas encore de TimescaleDB / MT5 live.

---

## 4. WIP non commité (normal — coupure Claude ~2026-07-22)

- Stratégies custom `#9001+` (`customStrategies.js`) + validation stricte Importer/Core Mode  
- Fix collision id stratégie **117** (VPIN vs EMA)  
- Suite Vitest + Husky + CI GitHub + `docs/TESTING.md`  
- Retouches backtest / collector / UI dossiers  

→ Voir checklist Sprint 0 dans `docs/ROADMAP_INGENIERIE.md`.

---

## 5. Priorités actuelles (ordre strict)

1. **Sprint 0 / P0** — ✅ A–E clôturés  
2. **P1** — ✅ clôturé + re-vérifié (DSR · ANT · PORT · TCA · Tearsheet · Statistical Edge)  
3. **P2** — ✅ clôturé  
4. **P3** — ✅ ZDL-SYNC · COLLECTOR-INGEST · MT5-VPS pack  
5. **P4** — 🔄 Alpha Forge ✅ · Audit UI ✅  

Détail modules 1–7 : `docs/AUDIT_INSTITUTIONNEL.md`.

---

## 6. Règles non négociables

1. **Parité moteur** : `collector/index.js` importe `src/engine/*` — jamais dupliquer un moteur.  
2. **Pas de look-ahead** : toute modif indicateurs/stratégies → tests intégration causalité.  
3. **Pas de données inventées** présentées comme réelles (empty state si source absente).  
4. **Zéro pseudo-code / TODO production** sur les livrables P0.  
5. **Tests verts** avant de considérer une tâche « faite ».  
6. TradoBot (Shopify/robots) ≠ QuantEXPro — ne pas mélanger les dossiers / commits.

---

## 7. Multi-agents — qui fait quoi

| Agent | Fichier | Mission | Vérifie |
|-------|---------|---------|---------|
| **Orchestrateur** | session principale | Découpe, assigne, synthétise | STATUS.md à jour |
| **Engine** | `.cursor/agents/engine-quant.md` | `src/engine/*`, métriques, VPIN | npm test |
| **Frontend** | `.cursor/agents/frontend-terminal.md` | pages, UI, PipelineContext | build + smoke UI |
| **Infra** | `.cursor/agents/infra-zdl.md` | collector, Railway, futur backend | health + parité |
| **Reviewer** | `.cursor/agents/reviewer-qa.md` | review croisée, invariants | checklist DoD |

Workflow : Orchestrateur → 1–2 agents en parallèle → **Reviewer** → mise à jour `STATUS.md`.

---

## 8. Docs liées (ordre de lecture)

1. `docs/memory/STATUS.md` — où on en est **aujourd’hui**  
2. Ce fichier (`MEMORY.md`)  
3. `docs/ROADMAP_INGENIERIE.md`  
4. `docs/AUDIT_INSTITUTIONNEL.md`  
5. `docs/TESTING.md`  
6. `AGENTS.md` (racine dashboard)  
