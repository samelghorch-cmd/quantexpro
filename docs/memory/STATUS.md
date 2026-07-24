# STATUS — QuantEXPro

> Fichier **vivant**. Chaque session agent doit le mettre à jour en fin de travail.  
> Dernière maj : **2026-07-24**

---

## Snapshot

| Champ | Valeur |
|-------|--------|
| Branche git | `main` |
| Dépôt distant | ✅ `github.com/samelghorch-cmd/quantexpro` |
| Tests | JS **138** · backend **51** |
| Commit HEAD | `3b0ad7b` — P1-DSR Usine |
| CI GitHub | push `3b0ad7b` — à confirmer Actions |
| P0 | ✅ A–E clôturés |
| P1 | 🔄 **P1-DSR** livré · reste Anti-Library, stress, TCA, tearsheet, Statistical Edge |
| Prochaine action | **P1-ANT** — Anti-Library store + filtre Usine/FAO |

---

## Sprint 0 / P0 (terminé)

| ID | Tâche | État |
|----|-------|------|
| S0.1–S0.5 | tests, commit WIP, VPIN causal, dossiers IndexedDB | ✅ |
| P0-A | Moteur & qualité (VPIN, dossiers, CI) | ✅ |
| P0-B | Backend TimescaleDB + API idempotente | ✅ |
| P0-C | Bus ZDL Redis Streams + WS `/stream/bars` | ✅ |
| P0-D | LLM local + UI Prompt Mode | ✅ |
| P0-E | Pont MT5 (EA) + RBAC + audit append-only | ✅ |

---

## Décisions figées (ne pas rediscuter sans raison)

- Stack **actuelle** = Vite + JS jusqu’à P0 tests stables.  
- Migration Next.js / TS = **P1+**, pas Sprint 0.  
- Orange `#FF6B00` = marque ; verts/rouges sémantiques long/short à ajouter.  
- Heuristiques ML (XGBoost/HMM JS) = badge « approximation », pas hedge-fund.  
- Hébergement gratuit « pour l’instant » = Render + Neon (pas Railway).  

---

## Journal court

| Date | Événement |
|------|-----------|
| 2026-07-24 | P0-A → P0-D livrés + CI verte (voir historique git) |
| 2026-07-24 | **P0-E** : MT5 pull/ACK + RBAC + audit immuable + EA `QuantEXProBridge.mq5` |
| 2026-07-24 | **UI Prompt Mode** : Strategy Engine → `/v1/strategy/from-prompt` |
| 2026-07-24 | **P0 clôturé** — re-vérification zéro-erreur (JS 132, backend 51, ruff, mypy) |
| 2026-07-24 | **P1-DSR** : DSR + nTrials dans Usine (filtre &lt;50 % avant leaderboard, colonne UI, 6 tests) → JS **138** |

---

## Notes session

- 2026-07-24 : Mémoire organisée — `MEMORY.md`, `STATUS.md`, `AGENTS.md`, agents Cursor.
