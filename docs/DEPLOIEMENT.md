# Déploiement — QuantEXPro

Ce document couvre deux sujets :
1. **Dépôt GitHub + CI** (activer les GitHub Actions).
2. **Hébergement gratuit du backend** (alternative à Railway, « pour l'instant »).

---

## 1. Dépôt GitHub & CI

> ⚠️ **Action requise côté toi** : l'environnement de l'agent n'a **aucun identifiant
> GitHub** (`gh` absent, pas de token, pas de clé SSH). La création du dépôt distant et
> le premier `push` doivent donc être lancés par toi. Tout le reste est prêt (workflow CI
> committé dans `.github/workflows/ci.yml`, historique de commits propre).

### Option A — via l'interface web GitHub (le plus simple)
1. Crée un dépôt **vide** sur https://github.com/new (ex. `quantexpro`), **sans** README
   ni `.gitignore` (le repo local en a déjà).
2. Dans le dossier `web/dashboard/`, relie et pousse :
   ```bash
   git remote add origin https://github.com/<TON_USER>/quantexpro.git
   git branch -M main
   git push -u origin main
   ```
3. La CI (`ci.yml`) se déclenche automatiquement au premier push (tests bloquants).

### Option B — via GitHub CLI (`gh`)
```bash
# Installer gh puis s'authentifier une fois
gh auth login
# Créer le dépôt privé depuis le dossier courant et pousser
gh repo create quantexpro --private --source=. --remote=origin --push
```

### Vérifier la CI
- Onglet **Actions** du dépôt → le workflow « CI » doit être vert.
- Deux jobs par push / PR : **frontend/moteur** (`npm` — 132 tests + build) et
  **backend** (Python — 13 tests schémas + idempotence SQL).

---

## 2. Hébergement gratuit du backend (alternative à Railway)

Le backend (`backend/`) est **portable** : la migration Alembic active TimescaleDB
seulement si l'extension est disponible, sinon elle crée des **tables Postgres standard**
(l'API fonctionne à l'identique, sans partitionnement). On peut donc l'héberger sur
n'importe quel Postgres gratuit.

### 🎯 Stack recommandée « gratuite, pour l'instant » : **Render + Neon**

| Composant | Fournisseur gratuit | Notes |
|-----------|---------------------|-------|
| API (Docker) | **Render** (plan `free`) | Blueprint fourni : `render.yaml`. Se met en veille après ~15 min d'inactivité (réveil au 1ᵉʳ appel). |
| Base Postgres | **Neon** (free tier) | Serverless, **non expirant**, ~0,5 Go. Postgres pur → hypertables ignorées proprement. |

**Étapes :**
1. **Base — Neon** : créer un projet sur https://neon.tech → récupérer la connection string.
   La convertir au format asyncpg :
   ```
   postgresql+asyncpg://USER:PASSWORD@HOST/DB?ssl=require
   ```
2. **API — Render** : « New + » → **Blueprint** → sélectionner le dépôt GitHub. Render lit
   `render.yaml` automatiquement. Renseigner `QX_DATABASE_URL` (l'URL Neon ci-dessus).
   `QX_API_KEYS` est généré par Render (à reporter côté dashboard/collector).
3. Le conteneur exécute `alembic upgrade head` (crée les tables) puis démarre Uvicorn.
   Vérifier `https://<app>.onrender.com/health` puis `/health/ready`.

### 🔁 Alternative « on garde TimescaleDB » : **Fly.io**
Fly.io permet d'héberger l'API Docker **et** un conteneur TimescaleDB avec un volume
persistant (allocation gratuite « hobby »). On conserve alors les vraies hypertables.
```bash
fly launch --dockerfile backend/Dockerfile   # API
fly volumes create tsdata --size 1            # volume pour la DB
# + une app tuant l'image timescale/timescaledb:latest-pg16 avec le volume monté
```
Puis pointer `QX_DATABASE_URL` de l'API vers l'app TimescaleDB interne (`.internal`).

### Autres options viables (Postgres gratuit)
- **Supabase** (Postgres 0,5 Go) — pur Postgres, hypertables ignorées.
- **Koyeb** / **Railway trial** — pour l'API si Render ne convient pas.
- **Timescale Cloud** — essai gratuit 30 j si on veut TimescaleDB managé temporairement.

### Quand repasser à Railway / TimescaleDB managé
Dès que le volume de ticks/L2 dépasse le free tier (partitionnement et compression
deviennent utiles), migrer `QX_DATABASE_URL` vers une instance TimescaleDB : **aucun
changement de code** (la migration détecte l'extension et crée les hypertables).

---

## 3. Historique profond Dukascopy (P2-DUKA)

Batch **local** (pas déployé sur Render) pour 15–20 ans d'OHLCV :

```bash
cd tools/dukascopy && npm install
npm run fetch:deep          # 2008→aujourd'hui, multi-actifs, --resume
npm run validate            # schéma avant import
```

Puis dans l'app : **Outils → Data Manager → 📥 Importer JSON** → `out/import-all.json`.  
Détail : `tools/dukascopy/README.md`. Failover optionnel : `TWELVE_DATA_API_KEY`.

---

## 4. Pont MT5 VPS (P3-MT5-VPS)

Checklist + smoke : `mt5/VPS_DEPLOY.md` · `node mt5/smoke.mjs --dry-run`.  
EA : `mt5/QuantEXProBridge.mq5` (pull/ACK, rôle `ea` uniquement).

**Go-live unifié (migrations 0004/0005 + preflight + paper→demo) :** `docs/OPS_GO_LIVE.md` (P5-OPS).

```bash
cd backend && ./scripts/ops_migrate.sh --check   # QX_DATABASE_URL requis
node scripts/ops_preflight.mjs --dry-run
```

---

## 5. Variables d'environnement (rappel)

Voir `backend/.env.example`. En **production**, si `QX_API_KEYS` est vide, l'API se
verrouille (503) — c'est volontaire (fail-safe). Configurer aussi `QX_SSO_SECRET` en prod.
