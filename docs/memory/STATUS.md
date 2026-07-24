# STATUS — QuantEXPro

> Fichier **vivant**. Chaque session agent doit le mettre à jour en fin de travail.  
> Dernière maj : **2026-07-24** (P6-HMM-BW)

---

## Snapshot

| Champ | Valeur |
|-------|--------|
| Branche git | `main` |
| Dépôt distant | ✅ `github.com/samelghorch-cmd/quantexpro` |
| Tests | JS **343** · backend **78** |
| Commit HEAD | P6-HMM-BW |
| P0–P5 | ✅ clôturés |
| P6 | THEME ✅ · TS-MORE ✅ · **HMM-BW** ✅ |
| Prochaine action | Dire « go » |

---

## P6-HMM-BW — livré

- `backend/app/quant/hmm_bw.py` — Baum-Welch Gaussian 1D (stdlib)  
- `POST /v1/quant/hmm` · `engine=baum_welch` (`heuristic: false`)  
- Badge JS soft-clustering conservé (`engine=parity` défaut)

---

## Notes session

- Prod : `QX_SSO_SECRET` + `./scripts/ops_migrate.sh`.  
- Dire **« go »** pour la suite.
