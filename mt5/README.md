# Pont MT5 — QuantEXProBridge

Expert Advisor MetaTrader 5 qui connecte le VPS MT5 au backend QuantEXPro (P0-E).

## Fonctionnement (pull + ACK, zéro flux entrant vers le VPS)

```
Backend  POST /v1/mt5/signals   (PM/Risque)  → ordre 'pending'
   EA    GET  /v1/mt5/signals/pending?mode=…  → récupère les ordres
   EA    exécute via OrderSend (buy/sell/close)
   EA    POST /v1/mt5/executions              → ACK (filled+ticket / rejected+raison)
```

Chaque étape est journalisée dans le **journal d'audit immuable** (`/v1/audit`).
Idempotence garantie par `client_order_id`. Modes : `paper` → `demo` → `live`.

## Installation

1. Copier `QuantEXProBridge.mq5` dans `MQL5/Experts/` du terminal, compiler (F7).
2. MetaTrader 5 → **Outils > Options > Expert Advisors** :
   - cocher « Autoriser WebRequest pour les URL suivantes »
   - ajouter l'URL de l'API (ex. `https://quantexpro.onrender.com`).
3. Attacher l'EA à un graphique, renseigner les entrées :
   - `ApiBaseUrl` : base de l'API (sans `/` final)
   - `ApiKey` : une clé d'API de **rôle `ea`** (`QX_API_KEY_ROLES="…:ea"`)
   - `TradeMode` : `paper` (défaut backend) → passer à `demo` puis `live`
   - `MagicNumber` : 770001 (unique QuantEXPro)

## Sécurité / gouvernance

- Le rôle `ea` ne peut que **lire les signaux en attente** et **acquitter** — il ne peut
  pas créer de signaux (réservé PM/Risque) ni lire l'audit.
- Commencer en `paper`, valider les ACK, puis `demo`, puis `live`.
