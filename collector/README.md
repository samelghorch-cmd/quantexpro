# Collecteur 24/7 — paper-trading continu sur données réelles

Service Node **sans dépendance npm** qui réutilise le moteur JS du dashboard (mêmes stratégies
qu'au backtest). Il poll Binance à intervalle, fait tourner chaque stratégie « job » en démo,
accumule la data au fil du temps, et l'expose via une petite API HTTP (CORS ouvert).

## Lancer en local (test)

```bash
cd web/dashboard
node collector/index.js          # écoute sur http://localhost:8787
# variables : PORT, POLL_MS (défaut 300000 = 5 min), DATA_DIR (où écrire collector-data.json)
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

## Déployer gratuitement (Railway — recommandé)

1. Pousse ce dépôt (`web/dashboard`) sur GitHub.
2. Sur [railway.app](https://railway.app) : **New Project → Deploy from GitHub repo** → choisis le dépôt.
3. Railway lit `railway.json` (build via `collector/Dockerfile`). Rien d'autre à configurer.
4. **Variables** (onglet Variables) : `POLL_MS=300000` (5 min). Optionnel : ajoute un **Volume** monté sur `/data` (variable `DATA_DIR=/data` déjà par défaut dans le Dockerfile) pour que les jobs survivent aux redéploiements.
5. **Settings → Networking → Generate Domain** → tu obtiens une URL publique `https://…up.railway.app`.
6. Colle cette URL dans le dashboard : module **📁 Dossiers → 24/7 Cloud → « URL du collecteur »**.

> Fly.io / Render : même `collector/Dockerfile`. Sur Render : *New → Web Service → Docker*, Dockerfile path `collector/Dockerfile`. Sur Fly : `fly launch --dockerfile collector/Dockerfile`.

## Limites & sécurité

- **Persistance** : sans volume, `collector-data.json` est réinitialisé à chaque redéploiement (les jobs restent en mémoire tant que le service tourne). Un volume sur `/data` rend les jobs durables.
- **Aucun ordre réel, aucune clé** : klines publiques Binance uniquement, 100 % paper-trading. Aucun identifiant broker.
- L'API est ouverte (CORS `*`, pas d'auth) — adapté à un usage perso. Pour la protéger, ajoute un token (à demander).
