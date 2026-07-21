# Ingestion Dukascopy — historique profond 15-20 ans

Outil **local** (Node) qui télécharge les données **Dukascopy** (gratuites, tick bid/ask,
~2003→aujourd'hui) et les agrège en barres OHLCV **légères** importables dans QuantExPro.

> Pourquoi un outil séparé ? Le dump de **ticks** complet Dukascopy pèse ~500 Go et **ne peut pas
> tenir dans le navigateur** (quota IndexedDB de quelques Go). On agrège donc les ticks en OHLCV
> côté machine (20 ans de 1h ≈ quelques Mo), et on n'importe que ça dans l'app. L'app reste
> zéro-dépendance ; ce dossier a ses propres `node_modules`.

## Installation

```bash
cd web/dashboard/tools/dukascopy
npm install
```

## Utilisation

```bash
# Forex + Or, 3 timeframes, 20 ans
node fetch.mjs --symbols EURUSD,GBPUSD,USDJPY,GOLD --tf h1,h4,d1 --from 2005-01-01 --to 2025-01-01
```

Options : `--symbols` (clés de l'app), `--tf` (m5,m15,h1,h4,d1), `--from`, `--to`.
Symboles mappés : EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, GOLD, SILVER, SPX, NDX, DJI, DAX, WTI, BRENT, BTC, ETH.

Sortie dans `./out/` :
- `<SYMBOL>_<tf>.json` — une série par fichier
- `import-all.json` — **toutes les séries en un seul fichier** (le plus pratique)

## Import dans l'app

1. Lance l'app (`npm run dev` à la racine du dashboard).
2. **Outils → Data Manager → « 📥 Importer JSON »** → sélectionne `out/import-all.json`.
3. Les séries apparaissent dans le tableau avec leur profondeur (15-20 ans) et remplacent les
   séries Yahoo (plafonnées à ~10 ans) pour ces symboles dans les backtests et l'Usine à Stratégies.

> ⚠️ « Tout rafraîchir » dans le Data Manager écrase l'import par la source par défaut (Yahoo/Binance).
> Ré-importe après un rafraîchissement si besoin.
