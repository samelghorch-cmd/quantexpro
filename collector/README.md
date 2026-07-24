# Collecteur 24/7 — paper-trading continu sur données réelles

Service Node **sans dépendance npm** qui réutilise le moteur JS du dashboard (mêmes stratégies
qu'au backtest). Il poll Binance à intervalle, fait tourner chaque stratégie « job » en démo,
accumule la data au fil du temps, et l'expose via une petite API HTTP (CORS ouvert).

## Lancer en local (test)

```bash
cd web/dashboard
node --experimental-strip-types collector/index.js   # écoute sur http://localhost:8787
# variables : PORT, POLL_MS (défaut 300000 = 5 min), DATA_DIR (où écrire collector-data.json)
# Node ≥ 22 requis (strip-types pour imports `src/engine/*.ts`)
```

## API

| Méthode | Route | Rôle |
|---|---|---|
| GET  | `/health` | état du service |
| GET  | `/jobs` | liste des jobs + métriques résumées |
| POST | `/jobs` | démarre un job — body : `{ name, strategyId, ticker, interval, params }` |
| GET  | `/jobs/:id` | job COMPLET (série + résultat : équity + trades) |
| DELETE | `/jobs/:id` | arrête et supprime un job |

`interval` ∈ `5m,15m,1h,4h,1d`. `ticker` = paire Binance (ex. `BTCUSDT`). `params` = `{ slAtr, tpAtr, beAtr, direction, capital, contracts }`.

## Variables

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `8787` | HTTP collector |
| `POLL_MS` | `60000` | Intervalle de poll Binance |
| `DATA_DIR` | `.` | Persistance `collector-data.json` |
| `QX_BARS_INGEST` | *(off)* | Mettre `1` pour pousser les barres vers TimescaleDB |
| `QX_API_BASE_URL` | — | Base API backend (ex. `https://…onrender.com`) |
| `QX_API_KEY` | — | Clé `X-API-Key` (rôle ingest) |
| `QX_BARS_BACKFILL` | `500` | Barres max au 1ᵉʳ ingest d'un job |
| `QX_BARS_CHUNK` | `5000` | Taille de lot POST `/v1/bars/{tf}` |

Quand l'ingest est actif, chaque poll (et la création de job) envoie les barres nouvelles
vers `POST /v1/bars/{interval}` (symboles type `BTC` dérivés de `BTCUSDT`). Idempotent côté API.

## Déployer gratuitement (Railway — recommandé)

1. Pousse ce dépôt (`web/dashboard`) sur GitHub.
2. Sur [railway.app](https://railway.app) : **New Project → Deploy from GitHub repo** → choisis le dépôt.
3. Railway lit `railway.json` (build via `collector/Dockerfile`). Rien d'autre à configurer.
4. **Variables** (onglet Variables) : `POLL_MS=300000` (5 min). Optionnel ZDL :
   `QX_BARS_INGEST=1`, `QX_API_BASE_URL=…`, `QX_API_KEY=…`. Optionnel : ajoute un **Volume** monté sur `/data` (variable `DATA_DIR=/data` déjà par défaut dans le Dockerfile) pour que les jobs survivent aux redéploiements.
5. **Settings → Networking → Generate Domain** → tu obtiens une URL publique `https://…up.railway.app`.
6. Colle cette URL dans le dashboard : module **📁 Dossiers → 24/7 Cloud → « URL du collecteur »**.

> Fly.io / Render : même `collector/Dockerfile`. Sur Render : *New → Web Service → Docker*, Dockerfile path `collector/Dockerfile`. Sur Fly : `fly launch --dockerfile collector/Dockerfile`.

## Limites & sécurité

- **Persistance** : sans volume, `collector-data.json` est réinitialisé à chaque redéploiement (les jobs restent en mémoire tant que le service tourne). Un volume sur `/data` rend les jobs durables.
- **Aucun ordre réel, aucune clé** : klines publiques Binance uniquement, 100 % paper-trading. Aucun identifiant broker.
- L'API est ouverte (CORS `*`, pas d'auth) — adapté à un usage perso. Pour la protéger, ajoute un token (à demander).
