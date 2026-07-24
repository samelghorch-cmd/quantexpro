# STATUS — QuantEXPro

> Fichier **vivant**. Chaque session agent doit le mettre à jour en fin de travail.  
> Dernière maj : **2026-07-24** (P4-HMM)

---

## Snapshot

| Champ | Valeur |
|-------|--------|
| Branche git | `main` |
| Dépôt distant | ✅ `github.com/samelghorch-cmd/quantexpro` |
| Tests | JS **326** · backend **68** |
| Commit HEAD | P4-HMM |
| P0–P3 | ✅ clôturés |
| P4 | … · REV · **HMM** ✅ |
| Prochaine action | Dire « go » (suite / ops) |

---

## P4-HMM — livré

- `hmmRegimes` → 4 états **Trend / Range / Vol / Choppy** (features causales vol × efficacité)  
- UI : HMM Regime, Regime Clock, Quant Toolbox  
- Badge Approximation JS conservé

---

## Notes session

- Prod : `QX_SSO_SECRET` · `alembic upgrade head` (0004/0005).  
- Dire **« go »** pour la suite.
