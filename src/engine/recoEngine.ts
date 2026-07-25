// Moteur de recommandation du pipeline — conseille le PROCHAIN outil et POURQUOI,
// à partir des métriques RÉELLES de la stratégie active et de la méthodologie quant
// (in-sample → validation OOS → optimisation walk-forward → risque → forward test → live).
// Règles déterministes sur de vraies mesures : aucune recommandation inventée.

export interface RecoStepRef { id: string; label: string; }
export type RecoSeverity = "good" | "info" | "warn" | "danger";
export interface NextReco {
  next: RecoStepRef | null;   // module conseillé à ouvrir ensuite
  reason: string;             // pourquoi (fondé sur les métriques + la méthodo)
  severity: RecoSeverity;
  also: RecoStepRef[];        // pistes secondaires
  done: string[];             // étapes déjà franchies (affichage)
}

// Forme minimale lue dans le pipeline. Les payloads d'outils sont hétérogènes
// (sorties moteur variées) → typés `any`, honnête et cohérent avec le reste du moteur.
interface PipelineLike {
  selectedStrategyId?: number | string | null;
  lastBacktest?: any;
  validatorVerdict?: any;
  quantOptimizerBest?: any;
  faoResults?: any;
  recoFinale?: any;
}

const S: Record<string, RecoStepRef> = {
  factory: { id: "factory", label: "Usine" },
  backtest: { id: "backtest", label: "Backtest" },
  validator: { id: "validator", label: "Validation robustesse" },
  monteCarlo: { id: "monteCarlo", label: "Monte Carlo" },
  kellyEv: { id: "kellyEv", label: "Kelly / EV" },
  fao: { id: "fao", label: "Full Auto Optim" },
  quantOptimizer: { id: "quantOptimizer", label: "Quant Optimizer" },
  recoFinale: { id: "recoFinale", label: "Reco Finale" },
  propfirm: { id: "propfirm", label: "Prop firm" },
  forwardTest: { id: "forwardTest", label: "Forward test (démo)" },
  antiLibrary: { id: "antiLibrary", label: "Anti-Library" },
};

function num(x: unknown, d = 0): number {
  return typeof x === "number" && Number.isFinite(x) ? x : d;
}
function verdictOf(x: unknown): string {
  return String((x as { verdict?: unknown })?.verdict ?? "").toUpperCase();
}

export function recommendNext(pipeline: PipelineLike | null | undefined): NextReco {
  const p = pipeline || {};
  const bt = p.lastBacktest;
  const val = p.validatorVerdict;
  const opt = p.quantOptimizerBest || p.faoResults;
  const reco = p.recoFinale;
  const hasStrat = p.selectedStrategyId != null;

  const done: string[] = [];
  if (bt) done.push("Backtest");
  if (opt) done.push("Optimisation");
  if (val) done.push("Validation");
  if (reco) done.push("Reco Finale");

  // 0 — aucune stratégie active
  if (!hasStrat && !bt) {
    return { next: S.factory, severity: "info", done, also: [],
      reason: "Aucune stratégie active. Génère-en une dans l'Usine, ou charge-en une depuis Mes Stratégies." };
  }
  // 1 — pas encore backtestée
  if (!bt) {
    return { next: S.backtest, severity: "info", done, also: [],
      reason: "Étape 1 : un backtest détaillé sur données réelles pour mesurer l'edge brut (Sharpe, profit factor, drawdown)." };
  }

  const n = bt.nTrades != null ? num(bt.nTrades) : (Array.isArray(bt.trades) ? bt.trades.length : 0);
  const dd = Math.abs(num(bt.maxDD));       // fraction : 0.25 = 25 %
  const sharpe = num(bt.sharpe);
  const pf = num(bt.profitFactor);

  // 2 — pas d'edge : inutile d'aller plus loin
  if (sharpe <= 0 || (pf > 0 && pf < 1)) {
    return { next: S.factory, severity: "danger", done, also: [S.antiLibrary],
      reason: `Pas d'edge (Sharpe ${sharpe.toFixed(2)}, PF ${pf.toFixed(2)}). Reprends une autre variante à l'Usine, ou archive celle-ci (Anti-Library) pour ne plus la re-tester.` };
  }
  // 3 — échantillon trop faible
  if (n < 30) {
    return { next: S.backtest, severity: "warn", done, also: [],
      reason: `Échantillon trop faible (N=${n} trades) : statistiquement peu fiable. Élargis l'historique (plus de barres) ou choisis un actif/TF avec plus de signaux avant de valider.` };
  }
  // 4 — pas encore validée hors échantillon
  if (!val) {
    return { next: S.validator, severity: "info", done, also: dd >= 0.25 ? [S.monteCarlo] : [],
      reason: `Edge in-sample détecté (Sharpe ${sharpe.toFixed(2)}, N=${n}). Il ne vaut rien tant qu'il ne survit pas hors échantillon → valide la robustesse (out-of-sample + p-values).` };
  }
  // 5 — validation NO-GO (sur-ajustement)
  if (verdictOf(val) === "NO-GO") {
    return { next: S.factory, severity: "danger", done, also: [S.antiLibrary],
      reason: "La validation renvoie NO-GO : l'edge ne tient pas hors échantillon (sur-ajustement probable). Ne l'optimise pas — reprends une autre stratégie ou archive-la." };
  }
  // 6 — validée mais pas optimisée
  if (!opt) {
    return { next: S.fao, severity: "info", done, also: [S.quantOptimizer],
      reason: "Validée ✓. Cherche un edge supplémentaire par optimisation walk-forward (Full Auto Optim) — le Deflated Sharpe déflate le gain par le nombre d'essais pour éviter le sur-ajustement." };
  }
  // 7 — drawdown élevé : cadrer le risque avant d'avancer
  if (dd >= 0.25) {
    return { next: S.monteCarlo, severity: "warn", done, also: [S.kellyEv],
      reason: `Drawdown élevé (${(dd * 100).toFixed(0)} %). Passe par Monte Carlo + Kelly pour connaître le pire scénario et dimensionner le risque avant d'aller vers le live.` };
  }
  // 8 — tout fait sauf la décision finale
  if (!reco) {
    return { next: S.recoFinale, severity: "info", done, also: [S.propfirm],
      reason: "Backtest + validation + optimisation faits. Lance la Reco Finale : décision scorée agrégée (GO / REWORK) avant de simuler une prop firm." };
  }
  // 9 — décision finale rendue
  if (verdictOf(reco) === "GO") {
    return { next: S.forwardTest, severity: "good", done, also: [S.propfirm],
      reason: `Verdict GO (score ${Math.round(num(reco.finalScore))}). Simule une prop firm puis lance un forward test (démo réel) avant tout passage en live.` };
  }
  return { next: S.factory, severity: "warn", done, also: [S.antiLibrary],
    reason: `Verdict ${reco.verdict} (score ${Math.round(num(reco.finalScore))}) : pas assez solide pour le live. Retravaille les paramètres/l'hypothèse, ou passe à une autre stratégie.` };
}
