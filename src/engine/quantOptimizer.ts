// Quant Optimizer — optimisation bayésienne INSPIRÉE de TPE (approximation, pas un port d'Optuna).
// Cible : Score Quant 0-100 = moyenne pondérée de 5 sous-scores ML/stat.
import { seededRandom } from "./random.ts";
import { runBacktestExt, type BacktestExtParams } from "./backtestExtended.ts";
import type { BacktestBar, BacktestContext, StrategyEvalFn } from "./backtest.ts";
import { drawdownDistribution, tradeClustering, varCvar } from "./quantToolbox/index.ts";
import { FAO_SPACE } from "./fao.ts";

type OptDirection = "both" | "long" | "short";
type SpaceKey = "slAtr" | "tpAtr" | "beAtr" | "direction";

interface OptParams {
  slAtr: number;
  tpAtr: number;
  beAtr: number;
  direction: OptDirection;
}

interface QuantScoreParts {
  drawdown: number;
  regime: number;
  clustering: number;
  tailRisk: number;
  turnover: number;
}

/** Shape minimale pour quantScore (accepte résultat Ext + mocks Reco). */
export interface QuantScoreInput {
  trades: { pnl: number }[];
  equityCurve?: number[];
  sortino?: number;
  evTrade?: number;
  nTrades?: number;
}

type ExtResult = ReturnType<typeof runBacktestExt>;

interface Trial {
  params: OptParams;
  score: number;
  parts: QuantScoreParts | null;
  res: ExtResult;
  sharpe: number;
  pf: number;
  maxDD: number;
}

export interface QuantOptimizerOptions {
  nTrials?: number;
  contract?: string;
  capital?: number;
  seed?: number;
  baseline?: { sharpe?: number; profitFactor?: number; maxDD?: number } | null;
}

export interface QuantStrategy {
  eval: StrategyEvalFn;
}

// Score Quant (0-100) à partir d'un résultat de backtest.
export function quantScore(result: QuantScoreInput) {
  const pnls = result.trades.map((t) => t.pnl);
  if (pnls.length < 5) return { score: 0, parts: null as QuantScoreParts | null };

  const dd = result.equityCurve
    ? (drawdownDistribution(result.equityCurve) as { ulcer: number } | null)
    : null;
  const tc = tradeClustering(pnls) as { clusterScore: number } | null;
  const vc = varCvar(pnls) as { histCvar: number } | null;

  // 1. Drawdown Distribution : Ulcer inversé (faible ulcer = bon)
  const s1 = dd ? Math.max(0, 1 - dd.ulcer / 25) : 0.5;
  // 2. Regime-Conditional : Sharpe stable (proxy via Sortino/Sharpe)
  const s2 = Math.max(0, Math.min(1, (result.sortino || 0) / 3));
  // 3. Trade Clustering : faible autocorrélation
  const s3 = tc ? tc.clusterScore : 0.5;
  // 4. Tail Risk : CVaR relatif à l'expectancy
  const evAbs = Math.abs(result.evTrade || 0) || 1;
  const s4 = vc ? Math.max(0, Math.min(1, 1 + vc.histCvar / (evAbs * 8))) : 0.5;
  // 5. Turnover / capacité : pénalise le surtrading
  const nTrades = result.nTrades ?? result.trades.length;
  const s5 = Math.max(0, Math.min(1, 1 - Math.max(0, nTrades - 200) / 800));

  const score = (0.25 * s1 + 0.25 * s2 + 0.20 * s3 + 0.20 * s4 + 0.10 * s5) * 100;
  return { score, parts: { drawdown: s1 * 100, regime: s2 * 100, clustering: s3 * 100, tailRisk: s4 * 100, turnover: s5 * 100 } };
}

// TPE-like : historique (params, score), échantillonne en biaisant vers le quartile supérieur.
export function runQuantOptimizer(
  bars: BacktestBar[],
  ctx: BacktestContext,
  strategy: QuantStrategy,
  options: QuantOptimizerOptions = {},
) {
  const { nTrials = 60, contract = "MES", capital = 100000, seed = 11, baseline = null } = options;
  const rnd = seededRandom(seed);
  const space: Record<SpaceKey, readonly (number | string)[]> = {
    slAtr: FAO_SPACE.slAtr,
    tpAtr: FAO_SPACE.tpAtr,
    beAtr: FAO_SPACE.beAtr,
    direction: FAO_SPACE.direction,
  };
  const keys = Object.keys(space) as SpaceKey[];
  const pickRandom = (): OptParams => {
    const p: Record<SpaceKey, number | string> = {
      slAtr: 0, tpAtr: 0, beAtr: 0, direction: "both",
    };
    keys.forEach((k) => { p[k] = space[k][Math.floor(rnd() * space[k].length)]; });
    return p as unknown as OptParams;
  };

  const history: Trial[] = [];
  const evalP = (p: OptParams): Trial => {
    const extParams: BacktestExtParams = { ...p, contract, capital };
    const res = runBacktestExt(bars, ctx, strategy.eval, extParams);
    const qs = quantScore(res);
    return { params: p, score: qs.score, parts: qs.parts, res, sharpe: res.sharpe, pf: res.profitFactor, maxDD: res.maxDD };
  };

  // Contraintes fondamentales vs baseline
  const baseSharpe = baseline?.sharpe ?? 0;
  const basePF = baseline?.profitFactor ?? 0;
  const baseDD = baseline?.maxDD ?? 1;
  const violates = (t: Trial) =>
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
    const p: Record<SpaceKey, number | string> = {
      slAtr: 0, tpAtr: 0, beAtr: 0, direction: "both",
    };
    keys.forEach((k) => {
      const arr = space[k];
      if (rnd() < 0.7) {
        const idx = arr.indexOf(seedTrial.params[k]);
        const jitter = idx + (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.5 ? 0 : 1);
        p[k] = arr[Math.max(0, Math.min(arr.length - 1, jitter))];
      } else p[k] = arr[Math.floor(rnd() * arr.length)];
    });
    history.push(evalP(p as unknown as OptParams));
  }

  history.sort((a, b) => b.score - a.score);
  const valid = history.filter((t) => !violates(t));
  const best = valid[0] || history[0];
  return {
    history, best, convergence: history.map((t, i) => ({ trial: i + 1, score: t.score })),
    rejected: history.length - valid.length, constraints: { sharpe: baseSharpe, pf: basePF, dd: baseDD },
  };
}
