# STATUS — QuantEXPro

> Fichier **vivant**. Chaque session agent doit le mettre à jour en fin de travail.  
> Dernière maj : **2026-07-24** (P3-ZDL-SYNC)

---

## Snapshot

| Champ | Valeur |
|-------|--------|
| Branche git | `main` |
| Dépôt distant | ✅ `github.com/samelghorch-cmd/quantexpro` |
| Tests | JS **232** · backend **53** · `typecheck` OK |
| Commit HEAD | P3-ZDL-SYNC |
| P0–P2 | ✅ clôturés |
| P3 | 🔄 **ZDL-SYNC** ✅ · suite possible : collector→API |
| Prochaine action | Dire « go » (collector ingest auto / MT5 VPS / autre) |

---

## P3-ZDL-SYNC — livré

- Backend : Timeframe `15m/1h/4h/1d` + tables + Alembic `0003`
- `barsSync.ts` : Push/Pull paginé, mapping TF, chunks 5k
- Data Manager : panneau API + Ping + Push IndexedDB→API + Pull API→IndexedDB
- IndexedDB reste cache local ; Timescale = source de vérité quand syncée

---

## Notes session

- Après `src/engine/*` → `npm test` + `npm run typecheck`.  
- Backend : `cd backend && pytest`.
