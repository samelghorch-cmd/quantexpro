# Déploiement VPS MT5 — QuantEXProBridge (P3-MT5-VPS)

Checklist opérationnelle pour faire tourner l'EA sur un **VPS Windows** (ou machine locale)
contre le backend QuantEXPro. Le code pont (API + EA) est déjà livré ; ce document couvre
le **go-live paper → demo**.

> Runbook unifié migrations + preflight : **`docs/OPS_GO_LIVE.md`** (P5-OPS).

## Prérequis

| Composant | État |
|-----------|------|
| Backend API (`/v1/mt5/*`) | ✅ déployé (Render/Railway/…) |
| Clés RBAC `pm`/`risk` + `ea` | à configurer |
| Terminal MT5 (build broker démo) | sur le VPS |
| EA `QuantEXProBridge.mq5` | ce dossier |

## 1. Backend — clés

Dans l'environnement API :

```bash
QX_API_KEYS=pm-secret-xxx,ea-secret-yyy
QX_API_KEY_ROLES=pm-secret-xxx:pm,ea-secret-yyy:ea
QX_MT5_DEFAULT_MODE=paper
```

- **pm** (ou **risk**) : crée les signaux `POST /v1/mt5/signals`
- **ea** : pull `GET /v1/mt5/signals/pending` + ACK `POST /v1/mt5/executions`

## 2. Smoke API (sans MT5)

Depuis la racine dashboard :

```bash
# Validation payloads uniquement
node mt5/smoke.mjs --dry-run

# Cycle réel paper (API joignable + DB)
export QX_API_BASE_URL=https://TON-API
export QX_API_KEY_PM=pm-secret-xxx
export QX_API_KEY_EA=ea-secret-yyy
node mt5/smoke.mjs
```

DoD smoke : create → pending contient l'ordre → ACK `filled` → HTTP 200.

## 3. VPS Windows + MetaTrader 5

1. Installer MT5 **compte démo** du broker partenaire.
2. Copier `QuantEXProBridge.mq5` → `MQL5/Experts/`, compiler (F7).
3. **Outils → Options → Expert Advisors** :
   - Autoriser le trading algo
   - Autoriser WebRequest pour l'URL exacte de l'API (ex. `https://quantexpro.onrender.com`)
4. Attacher l'EA à un graphique (symbole du broker pour les tests, ex. EURUSD) :
   - `ApiBaseUrl` = même base que le smoke
   - `ApiKey` = **clé rôle ea**
   - `TradeMode` = `paper` d'abord (puis `demo`)
   - `MagicNumber` = `770001`
   - `PollSeconds` = `5`
5. Vérifier l'onglet **Experts** : logs `initialisé`, puis polls sans erreur WebRequest.

## 4. Premier ordre paper de bout en bout

```bash
# Créer un signal (clé PM)
curl -sS -X POST "$QX_API_BASE_URL/v1/mt5/signals" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $QX_API_KEY_PM" \
  -d '{"client_order_id":"vps-demo-1","symbol":"EURUSD","side":"buy","volume":0.01,"order_type":"market","mode":"paper","comment":"vps"}'
```

Dans les ~5 s, l'EA doit :
1. le voir dans pending,
2. tenter l'exécution (en `paper` le backend accepte l'ACK même si le broker n'est pas live),
3. poster `/v1/mt5/executions`.

> En mode `paper`, valide surtout le **chemin réseau + RBAC + idempotence**.  
> Passe à `demo` seulement quand les ACK `filled` sont stables, puis `live` avec volume minimal.

## 5. Sécurité VPS

- Pas de reverse tunnel vers le VPS : **seul l'EA sort** en HTTPS.
- Ne pas coller la clé `pm` dans l'EA — uniquement la clé `ea`.
- Firewall Windows : MT5 sortant 443 OK ; aucun port entrant requis pour le pont.
- Rotation : régénérer `QX_API_KEYS` si fuite.

## 6. Dépannage

| Symptoôme | Cause probable |
|-----------|----------------|
| WebRequest -1 | URL absente de la whitelist EA |
| HTTP 401/403 pending | Mauvaise clé ou rôle ≠ `ea` |
| Signal jamais vu | `TradeMode` ≠ `mode` du signal / `QX_MT5_DEFAULT_MODE` |
| HTTP 409 sur ACK | Double ACK (idempotence) — normal au retry |

## Hors scope de ce pack

- Provisioning automatique du VPS cloud (ForexVPS, Contabo…) — action manuelle.
- Compte broker live et compliance — à ta charge.
