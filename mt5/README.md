# Pont MT5 — QuantEXProBridge

Expert Advisor MetaTrader 5 qui connecte le VPS MT5 au backend QuantEXPro (P0-E / P3-MT5-VPS).

## Fonctionnement (pull + ACK, zéro flux entrant vers le VPS)

```
Backend  POST /v1/mt5/signals   (PM/Risque)  → ordre 'pending'
   EA    GET  /v1/mt5/signals/pending?mode=…  → récupère les ordres
   EA    exécute via OrderSend (buy/sell/close)
   EA    POST /v1/mt5/executions              → ACK (filled+ticket / rejected+raison)
```

Chaque étape est journalisée dans le **journal d'audit immuable** (`/v1/audit`).
Idempotence garantie par `client_order_id`. Modes : `paper` → `demo` → `live`.

## Fichiers

| Fichier | Rôle |
|---------|------|
| `QuantEXProBridge.mq5` | EA à compiler dans MetaEditor |
| `VPS_DEPLOY.md` | Checklist VPS Windows paper→demo |
| `smoke.mjs` | Smoke API (dry-run ou cycle réel) |

## Smoke rapide

```bash
node mt5/smoke.mjs --dry-run

export QX_API_BASE_URL=https://TON-API
export QX_API_KEY_PM=…   # rôle pm
export QX_API_KEY_EA=…   # rôle ea
node mt5/smoke.mjs
```

## Installation EA (résumé)

1. Copier `QuantEXProBridge.mq5` dans `MQL5/Experts/`, compiler (F7).
2. MetaTrader 5 → **Outils > Options > Expert Advisors** :
   - cocher « Autoriser WebRequest pour les URL suivantes »
   - ajouter l'URL de l'API (ex. `https://quantexpro.onrender.com`).
3. Attacher l'EA à un graphique :
   - `ApiBaseUrl` : base de l'API (sans `/` final)
   - `ApiKey` : clé **rôle `ea`** uniquement
   - `TradeMode` : `paper` → `demo` → `live`
   - `MagicNumber` : 770001

Détail VPS : **[VPS_DEPLOY.md](./VPS_DEPLOY.md)**.

## Sécurité / gouvernance

- Le rôle `ea` ne peut que **lire les signaux en attente** et **acquitter**.
- Commencer en `paper`, valider les ACK via `smoke.mjs`, puis `demo`, puis `live`.
