# QuantEXPro — Plateforme Quant

Réplique fidèle de la plateforme quant "PROTOS" : 8 sections de sidebar, 69 modules réellement fonctionnels, pipeline scientifique complet. React 18 + Vite, aucune dépendance de chart ou ML externe (tout en SVG/Canvas custom).

**Mémoire & agents (lire en premier) :** [`AGENTS.md`](AGENTS.md) · [`docs/memory/STATUS.md`](docs/memory/STATUS.md) · [`docs/memory/MEMORY.md`](docs/memory/MEMORY.md)  
**Institutionnel :** [`docs/AUDIT_INSTITUTIONNEL.md`](docs/AUDIT_INSTITUTIONNEL.md) · [`docs/ROADMAP_INGENIERIE.md`](docs/ROADMAP_INGENIERIE.md) · tests P0 [`docs/TESTING.md`](docs/TESTING.md).

## Lancer

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # build de production
```

## Architecture

- `src/engine/` — moteur pur JS (aucun React) :
  - **Extrait de la v4** : `indicators` (35 indicateurs), `strategyLibrary` (700 stratégies), `backtest`, `montecarlo`, `walkforward`, `context`, `analytics`, `microstructure`, `syntheticData`, `contracts`.
  - **Nouveau v5** : `backtestExtended` (SL/TP/BE), `backtestMetrics` (MinTRL Bailey·LdP, Beta, Quality LZ, Kyle's λ, Adverse Sel), `fao`, `postFaoSynth`, `quantOptimizer`, `syntheticValidator`, `recoFinale`, `propfirmConvex`, `analyticsAdvanced` (CPCV, Feature Mining, Symbolic GP, Pairs, Sensitivity, Pareto, Cross-TF/Symbol), `quantToolbox/` (GARCH, HMM, VaR/CVaR, XGBoost heuristique, Autoencoder PCA, Drawdown Dist, Trade Clustering), `ruleBuilder`, `patternsLibrary` (616), `multiAssetSynthetic`, `dataSynth`.
- `src/components/` — `charts/` (SVG/Canvas), `shared/` (thème, UI kit, EmptyStateExternalData, StrategyPicker, PipelineStepper), `layout/` (Sidebar, TickerBar, GlobalControls).
- `src/state/PipelineContext.jsx` — marché synthétique partagé + résultats du pipeline circulant entre modules.
- `src/pages/<section>/` — un composant par module.
- `src/registry.ts` — source de vérité de la navigation (8 sections / 69 modules).

## ⚡ Usine à Stratégies (découverte automatique)

Module phare (`Optimisation → ⚡ Usine à Stratégies`). **Un seul bouton** qui, sur données réelles :
1. **Screening** — teste les 700 stratégies × actifs sélectionnés × timeframes, coûts par trade réels déduits (spread + commission par classe d'actif, `costModel.js`).
2. **Refine** — sweep SL/TP/BE/direction (54 combos) sur les meilleures de chaque paire.
3. **Portefeuille corrélé** — sélection gloutonne d'un panier **décorrélé** (corrélation moyenne minimisée = « corrélation de corrélation »), équité combinée + Sharpe/DD du portefeuille.

Tourne dans un **pool de Web Workers** (tous les cœurs CPU, `factory.worker.js`) → l'UI reste fluide. La meilleure variante est poussée automatiquement vers **Backtest** et **Propfirm Convex**. Espace couvert affiché en millions de configurations ; l'entonnoir n'en évalue qu'une fraction intelligemment.

> ⚠️ Les scores de l'Usine sont *in-sample* (screening). Passer le top résultat par **Validator**, **CPCV Explorer** et **Propfirm Convex** avant toute décision — le chaînage est déjà câblé.

## Pipeline scientifique

`Backtest → Full Auto Optim (FAO) → Post-FAO Synth → Quant Optimizer → Validator → Reco Finale`

Chaque étape lit les résultats de la précédente via `PipelineContext`. Reco Finale agrège Composite Post-FAO + Score Quant + Robustesse Validator + MinTRL + Quality LZ → verdict GO / REWORK / NO-GO.

## Données

Bascule **Synthétique / Réel** dans la barre de contrôle globale (en haut à droite).

### Mode Réel — data live + historique multi-années (gratuit, sans clé)
- **Crypto** (Binance API, direct) : BTC, ETH, SOL, BNB, XRP — jusqu'à ~16 ans en journalier via pagination.
- **Indices, Forex, Actions, Métaux, Énergie** (Yahoo Finance via proxy) : S&P 500, Nasdaq, Dow, Russell, DAX · EUR/USD, GBP/USD, USD/JPY… · Apple, Microsoft, Nvidia… · Or, Argent, Cuivre, Platine · WTI, Brent, Gaz. Historique jusqu'à **10 ans** en journalier.
- Timeframes : 5m / 15m / 1h / 4h / 1j. Cache localStorage (10 min intraday, 12 h journalier) pour rester dans les quotas gratuits.
- Le proxy contourne le CORS de Yahoo : **`vite.config.js`** en dev, **`functions/api/yf/[[path]].js`** (Cloudflare Pages Function) en prod. Aucune clé requise.

### Qualité, profondeur & stockage
- **Nettoyage** (`dataQuality.js`) : tri, déduplication, suppression des OHLC corrompus, détection de gaps (tolérante week-end), score de santé, ajustement splits/dividendes (actions/indices).
- **Historique profond** : pagination Binance (BTC 1d depuis 2017, 4h ~3-4 ans) + ranges Yahoo max (daily ~10 ans).
- **Stockage IndexedDB** (`dataStore.js`) : quota ~Go vs 5 Mo du localStorage. Le module **Data Manager** (`Outils`) pré-télécharge un univers d'actifs → l'Usine et les backtests tournent ensuite instantanément et hors-ligne, avec table de santé (bougies, période, santé %, gaps, taille).

### Mode Synthétique
- Générateur OHLCV interne, seed reproductible. Badge « SIMULÉ ». Utile pour tester le pipeline sans dépendre du réseau, et sert de fallback pendant le chargement des données réelles.

### Modules macro RÉELS (sans clé API)
- **FRED** (Réserve Fédérale, `macroData.js` + proxy `/api/fred`) : **Yield Curve** (courbe des taux + inversion 10A-2A), **Inflation** (CPI glissement annuel, point mort, taux Fed), **USD Liquidity** (bilan Fed, reverse repo, TGA, liquidité nette, VIX, spread high yield).
- **CFTC COT** (`cotData.js`, fetch direct CORS ouvert) : positionnement net gros spéculateurs vs hedgers, % long, historique, par marché (Or, Argent, WTI, S&P, Nasdaq, Euro, 10Y).
- Tout est mis en cache IndexedDB.

### Modules à données externes spécialisées
- Macro Calendar, COT, Options Gamma, Yield Curve, USD Liquidity, Crypto Whales, Ship Tracker, Inflation, Surprise Index, Risk On/Off, Events, Live TV, Onchain : **aucune donnée inventée**. État « connecte ta source » (clé API en localStorage) — ces flux (calendrier, on-chain, options, CFTC…) n'ont pas d'équivalent gratuit fiable et attendent un connecteur dédié.
- Les modules ML/stat (GARCH, HMM, XGBoost, Autoencoder) sont explicitement étiquetés **approximation / heuristique JS**.

## Déploiement (≈ €0)

Hébergement statique gratuit avec le proxy Yahoo intégré :

```bash
npm run build          # génère dist/
# Cloudflare Pages : build command `npm run build`, output `dist`, le dossier functions/ est détecté automatiquement (proxy Yahoo)
```

Alternatives : Netlify / Vercel (le proxy `functions/api/yf` est spécifique à Cloudflare Pages ; pour Netlify/Vercel, adapter en Netlify Function / Vercel Edge Function — même logique 10 lignes).
