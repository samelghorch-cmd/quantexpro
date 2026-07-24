# STATUS — QuantEXPro

> Fichier **vivant**. Chaque session agent doit le mettre à jour en fin de travail.  
> Dernière maj : **2026-07-24**

---

## Snapshot

| Champ | Valeur |
|-------|--------|
| Branche git | `main` (+ locale `claude/hopeful-swartz-913305`) |
| Tests | **132 passed** (109 + 23 dossiers) |
| Commit HEAD | `b4f9a28` P0-A: custom strategies + test engine + VPIN causal + dossiers ZDL |
| WIP non commité | Non — lot P0-A committé |
| Bloqueur | **Push GitHub** : pas d'identifiant dans l'env agent (gh/token/ssh absents) → création dépôt + `git push` côté user (steps dans `docs/DEPLOIEMENT.md`) |
| Déploiement | Alternative gratuite documentée : **Render (API) + Neon (Postgres)** ; backend rendu portable (hypertables optionnelles). `render.yaml` fourni. |
| Prochaine action | Chantier 3 : **Bus ZDL Redis Streams (P0-C)** dans `backend/app/bus/` (publish bar-close, consumer ACK, retry backoff) |

---

## Sprint 0 (en cours)

| ID | Tâche | Owner | État |
|----|-------|-------|------|
| S0.1 | `npm test` + `npm run build` | — | ✅ tests OK (2026-07-24) |
| S0.2 | Commit WIP custom + tests/CI | — | ✅ `b4f9a28` (2026-07-24) |
| S0.3 | Push → activer CI GitHub | — | ⛔ bloqué : pas de remote (action user) |
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
| 2026-07-24 | **Chantier 1 committé** `b4f9a28` (lot P0-A) |
| 2026-07-24 | **Chantier 2 — Backend P0-B livré** : `backend/` FastAPI async + SQLAlchemy 2.0 + Pydantic v2 + Alembic hypertables ; ingest idempotent + lecture keyset ; 13 tests backend verts |
| 2026-07-24 | **Déploiement gratuit** : migration rendue portable (hypertables optionnelles), `render.yaml` + `docs/DEPLOIEMENT.md` (Render+Neon / Fly.io), job CI backend Python ajouté |
| 2026-07-24 | **Vérif zéro-erreur P0-A/P0-B** : JS 132 tests + couverture seuils + build OK ; backend ruff ✅ + mypy strict 0 ✅ + pytest 13 ✅ + import app ✅. CI backend durcie (ruff+mypy). |

---

## Notes session

- 2026-07-24 : Mémoire organisée — `MEMORY.md`, `STATUS.md`, `AGENTS.md`, `.cursor/rules/*`, 4 agents (engine / frontend / infra / reviewer). Obsidian QuantExPro + Carte PC synchronisés.
