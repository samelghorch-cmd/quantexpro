// Reco Finale — décision finale scorée agrégeant tous les étages du pipeline.
import { minTRL, qualityLZ, deflatedSharpe } from "./backtestMetrics.js";
import { quantScore } from "./quantOptimizer.js";

// Combine les scores disponibles ; chaque composante manquante est neutre (50).
// nTrials = nombre de configurations testées pour aboutir à cette stratégie (déflation anti-overfitting).
export function computeRecoFinale({ postFao, quantOpt, validator, backtestResult, nTrials = 1 } = {}) {
  const components = [];

  // 1. Composite Post-FAO (0-100)
  const postScore = postFao?.best?.score100 ?? null;
  if (postScore != null) components.push({ name: "Composite Post-FAO", value: postScore, weight: 0.22 });

  // 2. Score Quant (0-100)
  let qScore = quantOpt?.best?.score ?? null;
  if (qScore == null && backtestResult) qScore = quantScore(backtestResult).score;
  if (qScore != null) components.push({ name: "Score Quant (5 modules ML)", value: qScore, weight: 0.25 });

  // 3. Robustesse Validator (issue des p-values)
  let vScore = null;
  if (validator) {
    const map = { GO: 100, WARN: 60, "NO-GO": 20 };
    vScore = validator.gates.reduce((s, g) => s + (map[g.verdict] ?? 50), 0) / validator.gates.length;
    components.push({ name: "Robustesse Synth Validator", value: vScore, weight: 0.23 });
  }

  // 4. MinTRL (Bailey / López de Prado) — convertit en score
  let trlScore = null;
  if (backtestResult) {
    const pnls = backtestResult.trades.map((t) => t.pnl);
    const { minTrl } = minTRL(pnls, 0, 0.95);
    if (Number.isFinite(minTrl)) {
      // moins de trades requis = plus fiable ; on borne à 400
      trlScore = Math.max(0, Math.min(100, 100 - (minTrl / 400) * 100));
      components.push({ name: "MinTRL (Bailey·LdP)", value: trlScore, weight: 0.15, extra: `${Math.round(minTrl)} trades requis` });
    } else {
      trlScore = 10;
      components.push({ name: "MinTRL (Bailey·LdP)", value: trlScore, weight: 0.15, extra: "SR ≤ 0 : non significatif" });
    }
  }

  // 5. Quality LZ
  let lzScore = null;
  if (backtestResult) {
    const pnls = backtestResult.trades.map((t) => t.pnl);
    lzScore = qualityLZ(pnls) * 100;
    components.push({ name: "Quality LZ (complexité)", value: lzScore, weight: 0.15 });
  }

  // 6. Deflated Sharpe Ratio — anti-overfitting : déflate le Sharpe par le nombre d'essais.
  let dsrScore = null;
  if (backtestResult) {
    const pnls = backtestResult.trades.map((t) => t.pnl);
    const { dsr } = deflatedSharpe(pnls, nTrials || 1);
    if (!Number.isNaN(dsr)) {
      dsrScore = dsr * 100;
      components.push({ name: "Deflated Sharpe (anti-overfit)", value: dsrScore, weight: 0.18, extra: `${(nTrials || 1).toLocaleString("fr-FR")} essais` });
    }
  }

  const totalW = components.reduce((s, c) => s + c.weight, 0) || 1;
  const finalScore = components.reduce((s, c) => s + c.value * c.weight, 0) / totalW;

  // Verdict
  let verdict = "NO-GO";
  if (finalScore >= 70) verdict = "GO";
  else if (finalScore >= 50) verdict = "REWORK";

  // Blocage dur si le validator a dit NO-GO
  if (validator?.verdict === "NO-GO" && verdict === "GO") verdict = "REWORK";
  // Blocage dur anti-overfitting : un DSR faible (< 50 %) interdit le GO même si le score global passe.
  if (dsrScore != null && dsrScore < 50 && verdict === "GO") verdict = "REWORK";

  return { finalScore, verdict, components };
}
