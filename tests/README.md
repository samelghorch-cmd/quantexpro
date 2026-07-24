# Suite de tests moteur — QuantEXPro

Objectif : rendre le moteur de backtest/métriques **auditable en due diligence**.
Chaque test répond à une question qu'un allocataire institutionnel posera :
« comment savez-vous que vos chiffres sont vrais ? »

## Lancer

```bash
npm run test:unit          # invariants + goldens (< 5 s) — aussi exécuté en pre-commit
npm run test:integration   # causalité du moteur complet + librairie 121+ stratégies (< 30 s)
npm run coverage           # seuils bloquants (100 % lignes sur le cœur moteur)
```

## Structure

| Fichier | Rôle |
|---|---|
| `unit/backtest.invariants.test.js` | Invariants I1–I6 du backtester (voir ci-dessous) |
| `unit/metrics.golden.test.js` | Valeurs de référence calculées à la main pour chaque métrique |
| `unit/regimes.golden.test.js` | Métriques verrouillées du moteur complet sur 5 régimes de marché |
| `integration/engine.causality.test.js` | Troncature de `buildContext`, barrière temporelle sur la librairie réelle, parité collector |
| `helpers/fixtures.js` | Générateurs seedés (aucune transcendante → bit-à-bit reproductible), stratégies de test, garde-fou de causalité |

## Les invariants (I1–I6)

- **I1 Conservation du capital** — `finalEquity = capital + Σ pnl(trades)` sur tous
  régimes × stratégies. Un moteur qui crée ou perd de l'argent hors trades est disqualifiant.
- **I2 Coûts toujours déduits** — un aller-retour à prix strictement constant perd
  *exactement* `2×(commission + slippage×tick×pv)×contrats`, pour chacun des 8 contrats.
- **I3 Pas de look-ahead** — un Proxy enregistre tout accès à un indice `> i` pendant
  l'évaluation d'un signal ; + invariance par troncature (retirer le futur ne change pas
  les trades passés). Sémantique documentée du moteur : *trade on close* (le signal de la
  barre i est exécuté au close de i ; jamais de donnée > i).
- **I4 Séquentialité** — entryTime ≤ exitTime, sorties non décroissantes, mono-position,
  taille de courbe d'équité exacte (`n − warmup + 1`).
- **I5 Edge cases** — zéro trade, trade unique, position jamais fermée, capital nul,
  drawdown 100 %, série plus courte que le warm-up (50 barres).
- **I6 Sorties exactes** — SL, TP et Break-Even sortent au niveau exact avec la bonne
  raison, sur des barres construites à la main.

Chaque famille contient un test **« DÉMONSTRATION DE FAUTE »** : on injecte une version
cassée (stratégie qui lit i+1, pnl falsifié, barres réordonnées, annualisation √(252×78))
et on prouve que le garde-fou la détecte. C'est la réponse à « votre test peut-il échouer ? ».

## Tolérances numériques (contrat)

| Type de valeur | Assertion | Tolérance |
|---|---|---|
| Arithmétique pure (P&L, comptages, PF, expectancy, Kelly) | `toBe` / `toBeCloseTo(x, 9)` | exact / ±5e-10 |
| Transcendantes (Sharpe, Sortino — √ en jeu) | `toBeCloseTo(x, 3)` | ±5e-4 |
| CAGR/Calmar (pow/log) | `toBeCloseTo(x, 2)` | ±5e-3 |
| Goldens de régime (moteur complet) | ratios ±5e-5, P&L $ ±5e-4 | voir fichier |

Les générateurs de données n'utilisent **aucune fonction transcendante** (uniquement
`+ × ÷ abs min max` sur un LCG seedé) : les datasets sont identiques bit à bit sur toute
machine IEEE-754, donc les goldens sont stables entre macOS local et Linux CI.

## Régénérer les goldens de régime

Uniquement après un changement **intentionnel et justifié** du moteur :

1. Modifier le moteur, faire passer les invariants (`npm run test:unit` — les goldens échoueront).
2. Exécuter le générateur documenté dans `unit/regimes.golden.test.js` (mêmes params/stratégies),
   coller les nouvelles valeurs.
3. Justifier le delta chiffre par chiffre dans le message de commit.

## Look-ahead VPIN — corrigé (P0-T4)

`ctx.vpinBvc` / `ctx.vpinCdf` : `computeVPIN` calibre désormais la taille de bucket sur une
**fenêtre d'amorce fixe** (`bucketVolume = volume(calibBars premières barres) / nBucketsTarget`,
`vpin.js`), plus jamais sur le volume total de la série. Le volume futur ne déplace donc plus
les frontières de buckets passées, et en live l'historique VPIN ne se réécrit plus une fois
l'amorce passée. Le test **sentinelle** a été remplacé par un test d'**invariance stricte** sur
`vpinBvc`/`vpinCdf` dans `integration/engine.causality.test.js`. Plus aucune exception tolérée.
