# Architecture de test — QuantEXPro P0 « Test Engine »

Synthèse de validation (rôle « Quant Architect ») : couverture des vecteurs de risque,
parité recherche/exécution, stratégie de test du cycle de vie des dossiers, et plan
d'intégration P0. État au 2026-07-24 : **132 tests verts** (suite complète ~6 s, budget CI : 3 min).
Alignement roadmap institutionnelle : voir [`AUDIT_INSTITUTIONNEL.md`](./AUDIT_INSTITUTIONNEL.md) et [`ROADMAP_INGENIERIE.md`](./ROADMAP_INGENIERIE.md).

## 1. Cartographie vecteurs de risque → tests

| Vecteur de risque (due diligence) | Couvert par | Statut |
|---|---|---|
| Création/destruction de capital hors trades | I1 (invariants) | ✅ |
| Coûts omis ou partiels | I2 + I6 (prix exacts) | ✅ |
| Look-ahead au niveau stratégie | I3 Proxy + librairie complète (intégration B) | ✅ |
| Look-ahead au niveau indicateurs | Troncature de `buildContext` (intégration A) | ✅ (VPIN corrigé P0-T4, cf. §4) |
| Réordonnancement / corruption de séquence | I4 | ✅ |
| Métriques fausses (Sharpe, Sortino, DD, PF, expectancy, Kelly, Calmar) | Goldens calculés à la main | ✅ |
| Annualisation incorrecte (bug historique √(252×78)) | Goldens `annualFactor` + garde anti-régression | ✅ |
| Dérive silencieuse du moteur lors d'un refactor | Goldens de régime verrouillés (5 régimes × 2 stratégies) | ✅ |
| Divergence recherche (dashboard) / exécution (collector) | Test de parité C : le collector importe `../src/engine/*` — moteur unique | ✅ |
| Edge cases dégénérés (0 trade, DD 100 %, capital 0…) | I5 | ✅ |

## 2. Parité recherche/exécution

Le Collector Node n'a **pas** de moteur propre : il importe `strategyLibrary.js`,
`context.js` et `backtestExtended.js` depuis `src/engine/`. La divergence
recherche/exécution est donc structurellement impossible tant que cette propriété tient —
et c'est exactement ce que le test C verrouille (il casse si quelqu'un duplique un moteur
dans le collector). Conséquence : **une seule suite de tests couvre les deux environnements**.

## 3. Cycle de vie des dossiers IndexedDB — stratégie (**livré P0-T5** : `tests/unit/dossierStore.test.js`)

Le dossier (`dossierStore.js`) traverse 6 étapes : création → paramètres → résultats
d'outils (`stages`) → note (`grade`) → validation → archivage. Plan de test :

1. **Harnais** : `fake-indexeddb` en devDependency, injecté avant l'import de `dataStore.js`
   (environnement node, pas de navigateur requis).
2. **Invariants du store** :
   - accumulation sans perte : chaque `updateDossier` préserve les `stages` existants ;
   - sérialisation des écritures : N écritures concurrentes (Forward Test + Reco) →
     aucun lost update (la `writeChain` est déjà conçue pour ça — le test le prouve) ;
   - `gradeLetter` : golden table complète (score × verdict → lettre, bornes 85/75/65/50,
     NO-GO → F) ;
   - idempotence de l'archivage et tri par `updatedAt`.
3. **Test de cycle complet** : un dossier traverse les 6 étapes et le JSON final est
   comparé à un snapshot de référence.

## 4. Découverte majeure de la campagne : VPIN non causal — **RÉSOLU (P0-T4)**

Le test de troncature avait détecté un **look-ahead réel** : `computeVPIN` calibrait
`bucketVolume = volumeTotal(série entière)/nBuckets`. Effets d'origine :

- en backtest, le volume futur déplaçait les frontières de buckets du passé →
  `ctx.vpinBvc` / `ctx.vpinCdf` non causaux ;
- en live, la série grandissait à chaque barre → tout l'historique VPIN se réécrivait
  (divergence backtest ≠ live pour toute stratégie lisant ces colonnes).

**Correctif livré :** `bucketVolume` est désormais calibré sur une **fenêtre d'amorce
fixe** — les `calibBars` premières barres (`calibBars = max(buckets, 100)` par défaut),
`bucketVolume = volume(amorce) / nBucketsTarget`. Propriétés garanties :

- **invariance par troncature** : les frontières de buckets sur `[0, N_CUT)` sont
  identiques que l'on voie 450 ou 600 barres (la calibration ne lit que l'amorce,
  bien en deçà de `N_CUT`) → plus de look-ahead ;
- **backtest ≡ live** : une fois l'amorce dépassée, `bucketVolume` est figé, donc
  l'historique VPIN ne se réécrit plus à chaque nouvelle barre.

Le **test sentinelle** (qui exigeait un look-ahead résiduel) est remplacé par un test
d'invariance strict sur `vpinBvc`/`vpinCdf`. Aucune régénération de golden métrique
n'a été nécessaire : les goldens (`minimalCtx`) n'utilisent pas VPIN ; la seule stratégie
concernée (`vpinSpike`) n'est couverte que par la barrière temporelle (test B), qui reste
verte. Changement de sémantique d'indicateur → commit séparé avec justification.

## 5. Plan d'intégration P0 (ordre et dépendances)

| Étape | Contenu | Dépend de | Statut |
|---|---|---|---|
| P0.1 | Invariants I1–I6 + goldens métriques + goldens de régime | — | ✅ livré |
| P0.2 | Tests d'intégration causalité (ctx + librairie) + parité collector | P0.1 (fixtures) | ✅ livré |
| P0.3 | CI bloquante (GitHub Actions) + pre-commit husky + seuils de couverture | P0.1–P0.2 | ✅ livré (workflow actif au premier push vers GitHub) |
| P0.4 | Correction causale de la calibration VPIN + retrait de la sentinelle | P0.2 (le test de troncature valide le fix) | ✅ livré |
| P0.5 | Cycle de vie dossiers IndexedDB (fake-indexeddb, §3) | — (parallélisable) | ✅ livré (23 tests) |
| P0.6 | Étendre la couverture bloquante au reste de `src/engine` (walkforward, montecarlo, fao, costModel) : 80 % lignes global moteur | P0.1 (patterns établis) | ⬜ à faire |

Règles de la CI (bloquantes dès maintenant) :
- zéro test en échec = zéro merge (`.github/workflows/ci.yml`) ;
- pre-commit : suite unitaire complète (< 5 s) via husky ;
- couverture : 100 % lignes / 100 % fonctions sur `backtest.js`, `backtestExtended.js`,
  `annualize.js`, `random.js` (le périmètre s'élargit à chaque étape P0.6) ;
- lint/type-check : non configurés dans le repo à ce jour — à introduire en P1
  (ESLint + JSDoc-check sur `src/engine`), la CI a des étages prévus pour.

## 6. Checklist de validation finale

- [x] I1–I6 passent sur 5 régimes × plusieurs stratégies
- [x] Chaque garde-fou a une démonstration de faute (le test peut échouer)
- [x] Goldens métriques vérifiés à la main (calculs dans les commentaires)
- [x] Goldens de régime bit-à-bit reproductibles (générateurs sans transcendantes)
- [x] Librairie complète (121+ stratégies) sans violation de barrière temporelle
- [x] Parité dashboard/collector verrouillée par test
- [x] Suite < 3 min (mesuré : ~15 s tout compris)
- [x] Couverture bloquante en CI
- [x] VPIN causal (P0.4)
- [x] Dossiers IndexedDB (P0.5)
