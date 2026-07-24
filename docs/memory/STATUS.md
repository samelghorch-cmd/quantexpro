# STATUS — QuantEXPro

> Fichier **vivant**. Chaque session agent doit le mettre à jour en fin de travail.  
> Dernière maj : **2026-07-24**

---

## Snapshot

| Champ | Valeur |
|-------|--------|
| Branche git | `main` (+ locale `claude/hopeful-swartz-913305`) |
| Tests | **132 passed** (109 + 23 dossiers) |
| Commit HEAD | `f63a8d7` Renommage QuantEXPro + fix vol annualisée |
| WIP non commité | Oui — custom strategies + suite tests P0 + **VPIN causal (P0-T4)** + **tests dossiers (P0-T5)** + `fake-indexeddb` |
| Bloqueur | Aucun — **prêt à travailler** |
| Prochaine action | Commit lot **P0-A** (custom + tests + VPIN + dossiers) → push CI ; puis Chantier 2 (backend ZDL/TimescaleDB, scaffolding) |

---

## Sprint 0 (en cours)

| ID | Tâche | Owner | État |
|----|-------|-------|------|
| S0.1 | `npm test` + `npm run build` | — | ✅ tests OK (2026-07-24) |
| S0.2 | Commit WIP custom + tests/CI | — | ⬜ |
| S0.3 | Push → activer CI GitHub | — | ⬜ |
| S0.4 | VPIN causal (`vpin.js`) | Engine | ✅ amorce fixe `calibBars` (2026-07-24) |
| S0.5 | Tests dossiers IndexedDB | Engine + Reviewer | ✅ 23 tests (2026-07-24) |

---

## Décisions figées (ne pas rediscuter sans raison)

- Stack **actuelle** = Vite + JS jusqu’à P0 tests stables.  
- Migration Next.js / TS = **P1+**, pas Sprint 0.  
- Orange `#FF6B00` = marque ; verts/rouges sémantiques long/short à ajouter.  
- Heuristiques ML (XGBoost/HMM JS) = badge « approximation », pas hedge-fund.  

---

## Journal court

| Date | Événement |
|------|-----------|
| 2026-07-22 | Coupure tokens Claude — WIP custom strategies + tests laissé local |
| 2026-07-24 | Reprise Cursor : audit institutionnel + roadmap écrits |
| 2026-07-24 | Mémoire multi-agents + Obsidian sync (cette session) |
| 2026-07-24 | **P0-T4 VPIN causal livré** : `bucketVolume` sur amorce fixe ; sentinelle → invariance stricte |
| 2026-07-24 | **P0-T5 tests dossiers livrés** : `dossierStore.test.js` (fake-indexeddb, writeChain, cycle 6 étapes) → **132 tests verts** ; Chantier 1 (P0-A) terminé |

---

## Notes session

- 2026-07-24 : Mémoire organisée — `MEMORY.md`, `STATUS.md`, `AGENTS.md`, `.cursor/rules/*`, 4 agents (engine / frontend / infra / reviewer). Obsidian QuantExPro + Carte PC synchronisés.
