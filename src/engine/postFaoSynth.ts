// Post-FAO Synth — scoring composite pondéré des résultats FAO.
// Score = 0.40·Robustesse + 0.35·Stabilité + 0.25·Performance, rescalé 0-100.
import { runBacktestExt, type BacktestExtParams } from "./backtestExtended.ts";
import type { BacktestBar, BacktestContext, StrategyEvalFn, StrategySignal } from "./backtest.ts";

/** Contexte FAO : ATR + ADX optionnel pour le filtre de régime. */
type FaoContext = BacktestContext & { adx14?: { adx?: number[] } };

interface FaoParams {
  slAtr: number;
  tpAtr: number;
  beAtr?: number;
  direction?: BacktestExtParams["direction"];
  regime?: string;
  contract?: string;
  capital?: number;
  [key: string]: unknown;
}

interface FaoCombo {
  params: FaoParams;
  profitFactor: number;
  sharpe: number;
  totalPnLPct: number;
  result: { equityCurve: number[] };
  [key: string]: unknown;
}

interface FaoResult {
  combos: FaoCombo[];
  baseline?: { params?: Record<string, unknown> };
}

interface SynthStrategy {
  eval: StrategyEvalFn;
}

interface RankedCombo extends FaoCombo {
  perf: number;
  stab: number;
  robust: number;
  composite: number;
  score100?: number;
}

const rescale = (arr: number[], v: number) => {
  const min = Math.min(...arr), max = Math.max(...arr);
  return max > min ? (v - min) / (max - min) : 0.5;
};

// Stabilité : 1 − coefficient de variation du Sharpe sur K sous-fenêtres de l'equity curve.
function stabilityScore(equityCurve: number[], capital: number, K = 6) {
  if (!equityCurve || equityCurve.length < K * 4) return 0.5;
  const win = Math.floor(equityCurve.length / K);
  const sharpes: number[] = [];
  for (let k = 0; k < K; k++) {
    const seg = equityCurve.slice(k * win, (k + 1) * win);
    const rets: number[] = [];
    for (let i = 1; i < seg.length; i++) rets.push((seg[i] - seg[i - 1]) / capital);
    const m = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length || 1)) || 1e-9;
    sharpes.push(m / sd);
  }
  const mean = sharpes.reduce((a, b) => a + b, 0) / sharpes.length;
  const sd = Math.sqrt(sharpes.reduce((a, b) => a + (b - mean) ** 2, 0) / sharpes.length);
  const cv = Math.abs(mean) > 1e-6 ? sd / Math.abs(mean) : 3;
  return Math.max(0, 1 - Math.min(1, cv / 3));
}

// Robustesse : perturbation locale ±10% des paramètres, on regarde combien la perf tient.
function robustnessScore(
  bars: BacktestBar[],
  ctx: FaoContext,
  strategy: SynthStrategy,
  params: FaoParams,
  baseSharpe: number,
) {
  const perturbs = [0.9, 1.1];
  const results: number[] = [];
  for (const f of perturbs) {
    const p: BacktestExtParams = {
      ...params,
      slAtr: Math.max(0.5, params.slAtr * f),
      tpAtr: params.tpAtr > 0 ? params.tpAtr * f : 0,
    };
    const r = runBacktestExt(bars, ctx, withRegimeInline(strategy.eval, params.regime), p);
    results.push(r.sharpe);
  }
  if (results.length === 0 || Math.abs(baseSharpe) < 1e-6) return 0.5;
  const drops = results.map((s) => 1 - Math.abs((baseSharpe - s) / baseSharpe));
  const avg = drops.reduce((a, b) => a + b, 0) / drops.length;
  return Math.max(0, Math.min(1, avg));
}

function withRegimeInline(evalFn: StrategyEvalFn, regime?: string): StrategyEvalFn {
  if (!regime || regime === "all") return evalFn;
  return (ctx: BacktestContext, i: number): StrategySignal => {
    const sig = evalFn(ctx, i);
    const adx = (ctx as FaoContext).adx14?.adx?.[i];
    if (adx == null || isNaN(adx)) return sig;
    const trending = adx > 25;
    const pass = regime === "trend" ? trending : !trending;
    return pass ? sig : { long: false, short: false };
  };
}

export function runPostFAO(
  faoResult: FaoResult,
  bars: BacktestBar[],
  ctx: FaoContext,
  strategy: SynthStrategy,
  capital = 100000,
) {
  const combos = faoResult.combos.slice(0, 50); // top survivants pour la robustesse
  if (combos.length === 0) return { ranked: [] as RankedCombo[], best: null as RankedCombo | null, deltas: [] as { param: string; baseline: unknown; best: unknown; deltaPct: number | null }[], weights: { robustesse: 0.40, stabilite: 0.35, performance: 0.25 } };

  const pfArr = combos.map((c) => (Number.isFinite(c.profitFactor) ? c.profitFactor : 3));
  const shArr = combos.map((c) => c.sharpe);
  const pnlArr = combos.map((c) => c.totalPnLPct);

  const ranked: RankedCombo[] = combos.map((c) => {
    const perf = (rescale(pfArr, Number.isFinite(c.profitFactor) ? c.profitFactor : 3)
      + rescale(shArr, c.sharpe) + rescale(pnlArr, c.totalPnLPct)) / 3;
    const stab = stabilityScore(c.result.equityCurve, capital);
    const robust = robustnessScore(bars, ctx, strategy, c.params, c.sharpe);
    const composite = 0.40 * robust + 0.35 * stab + 0.25 * perf;
    return { ...c, perf, stab, robust, composite };
  });
  ranked.sort((a, b) => b.composite - a.composite);

  // rescale composite → 0-100 sur le top 10
  const top10 = ranked.slice(0, 10);
  const comps = top10.map((r) => r.composite);
  top10.forEach((r) => { r.score100 = 20 + rescale(comps, r.composite) * 80; });

  // Δ% par paramètre vs baseline
  const base = faoResult.baseline?.params || {};
  const best = top10[0] ?? null;
  const deltas = best ? Object.keys(best.params).map((k) => {
    const bv = base[k], nv = best.params[k];
    const num = typeof bv === "number" && typeof nv === "number";
    const pct = num && bv !== 0 ? ((nv - bv) / Math.abs(bv)) * 100 : null;
    return { param: k, baseline: bv, best: nv, deltaPct: pct };
  }) : [];

  return { ranked: top10, best, deltas, weights: { robustesse: 0.40, stabilite: 0.35, performance: 0.25 } };
}
