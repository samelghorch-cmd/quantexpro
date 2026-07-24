// @ts-nocheck — migration bulk P10-TS-ENGINE; typage strict à reprendre fichier par fichier.
// Quant Optimizer — optimisation bayésienne INSPIRÉE de TPE (approximation, pas un port d'Optuna).
// Cible : Score Quant 0-100 = moyenne pondérée de 5 sous-scores ML/stat.
import { seededRandom } from "./random.ts";
import { runBacktestExt } from "./backtestExtended.ts";
import { drawdownDistribution, tradeClustering, varCvar } from "./quantToolbox/index.js";
import { FAO_SPACE } from "./fao.ts";

// Score Quant (0-100) à partir d'un résultat de backtest.
export function quantScore(result) {
  const pnls = result.trades.map((t) => t.pnl);
  if (pnls.length < 5) return { score: 0, parts: null };

  const dd = drawdownDistribution(result.equityCurve);
  const tc = tradeClustering(pnls);
  const vc = varCvar(pnls);

  // 1. Drawdown Distribution : Ulcer inversé (faible ulcer = bon)
  const s1 = dd ? Math.max(0, 1 - dd.ulcer / 25) : 0.5;
  // 2. Regime-Conditional : Sharpe stable (proxy via Sortino/Sharpe)
  const s2 = Math.max(0, Math.min(1, (result.sortino || 0) / 3));
  // 3. Trade Clustering : faible autocorrélation
  const s3 = tc ? tc.clusterScore : 0.5;
  // 4. Tail Risk : CVaR relatif à l'expectancy
  const evAbs = Math.abs(result.evTrade) || 1;
  const s4 = vc ? Math.max(0, Math.min(1, 1 + vc.histCvar / (evAbs * 8))) : 0.5;
  // 5. Turnover / capacité : pénalise le surtrading
  const s5 = Math.max(0, Math.min(1, 1 - Math.max(0, result.nTrades - 200) / 800));

  const score = (0.25 * s1 + 0.25 * s2 + 0.20 * s3 + 0.20 * s4 + 0.10 * s5) * 100;
  return { score, parts: { drawdown: s1 * 100, regime: s2 * 100, clustering: s3 * 100, tailRisk: s4 * 100, turnover: s5 * 100 } };
}

// TPE-like : historique (params, score), échantillonne en biaisant vers le quartile supérieur.
export function runQuantOptimizer(bars, ctx, strategy, options = {}) {
  const { nTrials = 60, contract = "MES", capital = 100000, seed = 11, baseline = null } = options;
  const rnd = seededRandom(seed);
  const space = {
    slAtr: FAO_SPACE.slAtr, tpAtr: FAO_SPACE.tpAtr, beAtr: FAO_SPACE.beAtr, direction: FAO_SPACE.direction,
  };
  const keys = Object.keys(space);
  const pickRandom = () => { const p = {}; keys.forEach((k) => (p[k] = space[k][Math.floor(rnd() * space[k].length)])); return p; };

  const history = [];
  const evalP = (p) => {
    const res = runBacktestExt(bars, ctx, strategy.eval, { ...p, contract, capital });
    const qs = quantScore(res);
    return { params: p, score: qs.score, parts: qs.parts, res, sharpe: res.sharpe, pf: res.profitFactor, maxDD: res.maxDD };
  };

  // Contraintes fondamentales vs baseline
  const baseSharpe = baseline?.sharpe ?? 0;
  const basePF = baseline?.profitFactor ?? 0;
  const baseDD = baseline?.maxDD ?? 1;
  const violates = (t) =>
    (baseSharpe > 0 && t.sharpe < baseSharpe * 0.9) ||
    (basePF > 0 && Number.isFinite(t.pf) && t.pf < basePF * 0.9) ||
    (t.maxDD > baseDD * 1.2);

  const nStart = Math.min(15, nTrials);
  for (let i = 0; i < nStart; i++) history.push(evalP(pickRandom()));

  for (let i = nStart; i < nTrials; i++) {
    history.sort((a, b) => b.score - a.score);
    const cut = Math.max(1, Math.floor(history.length * 0.25));
    const good = history.slice(0, cut);
    // échantillonne un paramètre depuis un "bon" essai + bruit (saute vers un voisin dans l'espace)
    const seedTrial = good[Math.floor(rnd() * good.length)];
    const p = {};
    keys.forEach((k) => {
      const arr = space[k];
      if (rnd() < 0.7) {
        const idx = arr.indexOf(seedTrial.params[k]);
        const jitter = idx + (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.5 ? 0 : 1);
        p[k] = arr[Math.max(0, Math.min(arr.length - 1, jitter))];
      } else p[k] = arr[Math.floor(rnd() * arr.length)];
    });
    history.push(evalP(p));
  }

  history.sort((a, b) => b.score - a.score);
  const valid = history.filter((t) => !violates(t));
  const best = valid[0] || history[0];
  return {
    history, best, convergence: history.map((t, i) => ({ trial: i + 1, score: t.score })),
    rejected: history.length - valid.length, constraints: { sharpe: baseSharpe, pf: basePF, dd: baseDD },
  };
}
