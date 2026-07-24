# STATUS — QuantEXPro

> Fichier **vivant**. Chaque session agent doit le mettre à jour en fin de travail.  
> Dernière maj : **2026-07-24** (P4-SSO)

---

## Snapshot

| Champ | Valeur |
|-------|--------|
| Branche git | `main` |
| Dépôt distant | ✅ `github.com/samelghorch-cmd/quantexpro` |
| Tests | JS **314** · backend **68** |
| Commit HEAD | P4-SSO |
| P0–P3 | ✅ clôturés |
| P4 | … · VP · **SSO** ✅ |
| Prochaine action | Dire « go » (suite P4+ / ops) |

---

## P4-SSO — livré

- JWT session HS256 (`QX_SSO_SECRET`) · Bearer accepté partout (RBAC)  
- OIDC PKCE optionnel (`QX_OIDC_*` · `/v1/auth/oidc/exchange`)  
- UI Risque → Audit : émettre session / Login OIDC / `/me`  
- `apiClient` priorise `Authorization: Bearer`

---

## Notes session

- Prod : définir `QX_SSO_SECRET` (+ OIDC si besoin).  
- `alembic upgrade head` après deploy (migrations 0004/0005).  
- Dire **« go »** pour la suite.
