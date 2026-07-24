# STATUS — QuantEXPro

> Fichier **vivant**. Chaque session agent doit le mettre à jour en fin de travail.  
> Dernière maj : **2026-07-24** (P3-MT5-VPS)

---

## Snapshot

| Champ | Valeur |
|-------|--------|
| Branche git | `main` |
| Dépôt distant | ✅ `github.com/samelghorch-cmd/quantexpro` |
| Tests | JS **243** · backend **53** · `typecheck` OK |
| Commit HEAD | P3-MT5-VPS |
| P0–P2 | ✅ clôturés |
| P3 | ✅ ZDL-SYNC · COLLECTOR-INGEST · **MT5-VPS pack** |
| Prochaine action | Pause / priorité libre — dire « go » |

---

## P3-MT5-VPS — livré

- `mt5/VPS_DEPLOY.md` — checklist VPS Windows paper→demo→live  
- `mt5/smoke.mjs` — dry-run + cycle API create→pending→ACK  
- Tests : `mt5Smoke.test.js` (5)  
- Go-live physique VPS/broker = action ops (hors repo)

---

## Notes session

- Smoke local : `node mt5/smoke.mjs --dry-run`  
- Après moteur → `npm test`.
