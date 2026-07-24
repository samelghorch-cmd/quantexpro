# AGENTS.md — QuantEXPro

Instructions pour **tous** les agents AI (Cursor, Claude Code) travaillant sur ce repo.

## Avant de coder

1. Lire `docs/memory/STATUS.md` (état du jour).  
2. Lire `docs/memory/MEMORY.md` (carte + règles).  
3. Pour une feature institutionnelle : `docs/ROADMAP_INGENIERIE.md` + section concernée de `docs/AUDIT_INSTITUTIONNEL.md`.  
4. Toute modif `src/engine/*` → `npm test` obligatoire.

## Rôles (délégation)

Utiliser les agents dans `.cursor/agents/` :

| Quand | Agent |
|-------|--------|
| Métriques, backtest, VPIN, stratégies, look-ahead | **engine-quant** |
| Pages React, sidebar, PipelineContext, thème | **frontend-terminal** |
| Collector, Railway, API, TimescaleDB, bus ZDL | **infra-zdl** |
| Après un lot de changements / avant commit | **reviewer-qa** |

L’agent principal (**Orchestrateur**) découpe la tâche, lance 1–2 spécialistes, puis appelle **reviewer-qa**.

## DoD (Definition of Done)

- [ ] Code complet (pas de TODO placeholder)  
- [ ] `npm test` vert si moteur / collector touché  
- [ ] Parité collector ↔ dashboard préservée  
- [ ] `docs/memory/STATUS.md` mis à jour  
- [ ] Pas de secrets / clés API en clair  

## Hors scope

- Ne pas refactorer TradoBot Shopify/MQL5 dans ce repo sauf demande explicite.  
- Ne pas migrer vers Next.js/TimescaleDB sans ticket P0-B/C validé dans la roadmap.
