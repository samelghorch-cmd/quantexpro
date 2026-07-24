# STATUS — QuantEXPro

> Fichier **vivant**. Chaque session agent doit le mettre à jour en fin de travail.  
> Dernière maj : **2026-07-24** (P3-COLLECTOR-INGEST)

---

## Snapshot

| Champ | Valeur |
|-------|--------|
| Branche git | `main` |
| Dépôt distant | ✅ `github.com/samelghorch-cmd/quantexpro` |
| Tests | JS **238** · backend **53** · `typecheck` OK |
| Commit HEAD | P3-COLLECTOR-INGEST |
| P0–P2 | ✅ clôturés |
| P3 | ✅ ZDL-SYNC · ✅ COLLECTOR-INGEST |
| Prochaine action | MT5 VPS / autre — dire « go » |

---

## P3-COLLECTOR-INGEST — livré

- `collector/barsIngest.js` — ticker→symbol, delta ingest, POST chunked  
- Opt-in : `QX_BARS_INGEST=1` + `QX_API_BASE_URL` + `QX_API_KEY`  
- Poll + création job → `/v1/bars/{interval}`  
- `/health` expose `barsIngest`  

---

## Notes session

- Après moteur / collector → `npm test`.  
- Backend : `cd backend && pytest`.
