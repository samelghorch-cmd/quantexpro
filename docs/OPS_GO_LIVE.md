# Ops go-live — QuantEXPro (P5-OPS)

Runbook unique pour **migrations Alembic (head = 0005)** et **MT5 paper → demo**.  
Complète `docs/DEPLOIEMENT.md` (hébergement) et `mt5/VPS_DEPLOY.md` (détail EA).

## Prérequis env (prod)

| Variable | Rôle |
|----------|------|
| `QX_DATABASE_URL` | Postgres/Timescale async (`postgresql+asyncpg://…`) |
| `QX_API_KEYS` | Clés séparées par virgules |
| `QX_API_KEY_ROLES` | ex. `pm-key:pm,ea-key:ea,risk-key:risk` |
| `QX_SSO_SECRET` | Secret JWT session (≥32 chars recommandé) |
| `QX_MT5_DEFAULT_MODE` | `paper` puis `demo` |
| `QX_ENV` | `production` |

Dashboard / collector : URL API + clé **pm** ou **risk** (jamais la clé **ea** dans le navigateur).

---

## 1. Migrations — Alembic → head (0005)

Révisions critiques post-P3 :

| Rev | Contenu |
|-----|---------|
| 0004 | `validated_edges` (Alpha Forge ZDL) |
| 0005 | `anti_library` (Anti-Library ZDL) — **head** |

### Local / SSH shell

```bash
cd backend
export QX_DATABASE_URL='postgresql+asyncpg://USER:PASS@HOST/DB?ssl=require'
./scripts/ops_migrate.sh          # current → upgrade head → current
# ou dry :
./scripts/ops_migrate.sh --check  # affiche current + heads sans écrire
```

### Conteneur (Render / Docker)

Le `Dockerfile` lance déjà `alembic upgrade head` au boot. Après un deploy
qui ajoute 0004/0005, **redéployer** ou exécuter une one-shot :

```bash
alembic upgrade head
alembic current   # doit afficher 0005 (…_anti_library)
```

### DoD migration

- [ ] `alembic current` = **0005**
- [ ] `GET /health` et `/health/ready` OK
- [ ] `GET /v1/edges?limit=1` → 200 (pas 500 table missing)
- [ ] `GET /v1/anti-library?limit=1` → 200

---

## 2. Preflight API (sans MT5)

Depuis la racine dashboard :

```bash
# Hors-ligne : forme des checks + smoke MT5 dry-run
node scripts/ops_preflight.mjs --dry-run

# Contre API déployée
export QX_API_BASE_URL=https://TON-API
export QX_API_KEY_PM=pm-secret-xxx
node scripts/ops_preflight.mjs
```

DoD preflight : health OK · edges OK · anti-library OK · (optionnel) session SSO si `QX_SSO_SECRET` côté serveur.

---

## 3. MT5 — paper → demo

Suivre `mt5/VPS_DEPLOY.md`. Gate minimale avant `demo` :

1. `node mt5/smoke.mjs` vert (create → pending → ACK filled)
2. EA en `TradeMode=paper` : polls WebRequest sans erreur 10+ min
3. Un ordre paper de bout en bout (curl PM + ACK EA)
4. Alors seulement : `QX_MT5_DEFAULT_MODE=demo` + EA `TradeMode=demo` + volume 0.01

**Interdit :** passer `live` sans revue risk + volume min + kill-switch documenté.

---

## 4. SSO prod

```bash
# Générer un secret fort (ne pas committer)
openssl rand -hex 32   # → QX_SSO_SECRET
```

Dashboard : Data Manager / Risque → Audit → login session.  
Vérifier `POST /v1/auth/session` puis `GET /v1/auth/me` avec Bearer.

---

## 5. Rollback rapide

```bash
cd backend
alembic downgrade 0003   # retire edges + anti_library (0004+0005)
# puis corriger et re-upgrade
alembic upgrade head
```

Les données `validated_edges` / `anti_library` sont **perdues** au downgrade — exporter CSV Alpha Forge avant.

---

## Liens

- Déploiement hébergeur : `docs/DEPLOIEMENT.md`
- Pont EA : `mt5/VPS_DEPLOY.md`, `mt5/smoke.mjs`
- HMM Python : `POST /v1/quant/hmm`
