# STATUS — QuantEXPro

> Fichier **vivant**. Chaque session agent doit le mettre à jour en fin de travail.  
> Dernière maj : **2026-07-24** (P5-HMM-PY)

---

## Snapshot

| Champ | Valeur |
|-------|--------|
| Branche git | `main` |
| Dépôt distant | ✅ `github.com/samelghorch-cmd/quantexpro` |
| Tests | JS **337** · backend **73** |
| Commit HEAD | P5-HMM-PY |
| P0–P4 | ✅ clôturés |
| P5 | TS-FEEDS ✅ · TS-MORE ✅ · TS-EDGES ✅ · **HMM-PY** ✅ · OPS |
| Prochaine action | Dire « go » |

---

## P5-HMM-PY — livré

- `backend/app/quant/hmm.py` — parité soft-clustering EM ↔ `hmmRegimes` JS  
- `POST /v1/quant/hmm` · fixture golden `hmm_parity_seed9.json`  
- Badge heuristique UI conservé (`engine: python`)

---

## Notes session

- Prod : `QX_SSO_SECRET` · `alembic upgrade head` (0004/0005).  
- Dire **« go »** pour P5-OPS.
