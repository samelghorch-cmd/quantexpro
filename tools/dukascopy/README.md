# Ingestion Dukascopy — historique profond 15-20 ans (P2-DUKA)

Outil **local** (Node) qui télécharge **Dukascopy** (gratuit, ~2003→aujourd'hui), agrège en OHLCV,
valide le schéma, et produit un JSON importable dans QuantEXPro (Data Manager).

> Les ticks bruts (~500 Go) ne tiennent pas dans IndexedDB. On n'importe que l'OHLCV agrégé
> (20 ans × 1h ≈ quelques Mo).

## Installation

```bash
cd tools/dukascopy
npm install
```

## Batch production (recommandé)

```bash
# Univers multi-actifs, 2008→aujourd'hui, h1/h4/d1, reprise si interruption
npm run fetch:deep
```

Options :
| Flag | Défaut | Rôle |
|------|--------|------|
| `--symbols` | EURUSD,GBPUSD,GOLD | Clés app (voir mapping) |
| `--tf` | h1,h4,d1 | m5, m15, h1, h4, d1 |
| `--from` / `--to` | 2008-01-01 / aujourd'hui | Plage |
| `--resume` | off | Skip les fichiers `out/` déjà valides |

**Retry** : 3 tentatives avec backoff par année.  
**Failover** : si Dukascopy échoue et `TWELVE_DATA_API_KEY` est défini → Twelve Data.

```bash
export TWELVE_DATA_API_KEY=...   # optionnel
npm run fetch:deep
npm run validate                 # contrôle schéma avant import
```

## Sortie `./out/`

- `<SYMBOL>_<tf>.json` — une série
- `import-all.json` — toutes les séries (à importer d'un coup)
- `manifest.json` — inventaire (n barres, années, erreurs)

## Import dans l'app

1. `npm run dev` (racine dashboard)
2. **Outils → Data Manager → 📥 Importer JSON** → `out/import-all.json`
3. Les séries Dukascopy remplacent Yahoo/Binance en cache pour ces symboles (Usine / backtests)

> « Tout rafraîchir » dans le Data Manager **écrase** l'import. Ré-importe après si besoin.

## Symboles mappés

EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, GOLD, SILVER, SPX, NDX, DJI, DAX, WTI, BRENT, BTC, ETH.
