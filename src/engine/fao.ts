// Full Auto Optim (FAO) — sweep automatique des paramètres SL/TP/BE par random sampling,
// filtre régime (ADX/Hurst), filtres qualité (WR min, DD max).
import { seededRandom } from "./random.ts";
import { runBacktestExt, type BacktestExtParams } from "./backtestExtended.ts";
import type { BacktestBar, BacktestContext, StrategyEvalFn, StrategySignal } from "./backtest.ts";

export type FaoDirection = "both" | "long" | "short";
export type FaoRegime = "all" | "trend" | "range";

export const FAO_SPACE = {
  slAtr: [1, 1.5, 2, 2.5, 3, 4] as const,
  tpAtr: [0, 1.5, 2, 3, 4, 6] as const,
  beAtr: [0, 1, 1.5, 2] as const,
  direction: ["both", "long", "short"] as const satisfies readonly FaoDirection[],
  regime: ["all", "trend", "range"] as const satisfies readonly FaoRegime[],
};

/** Contexte FAO : ATR + ADX optionnel pour le filtre de régime. */
export type FaoContext = BacktestContext & { adx14?: { adx?: number[] } };

export interface FaoStrategy {
  eval: StrategyEvalFn;
}

export interface FaoOptions {
  nSamples?: number;
  minWR?: number;
  maxDD?: number;
  contract?: string;
  capital?: number;
  seed?: number;
}

export interface FaoComboParams {
  slAtr: number;
  tpAtr: number;
  beAtr: number;
  direction: FaoDirection;
  regime: FaoRegime;
  contract: string;
  capital: number;
}

type ExtResult = ReturnType<typeof runBacktestExt>;

export interface FaoComboScore {
  params: {
    slAtr: number;
    tpAtr: number;
    beAtr: number;
    direction: FaoDirection;
    regime: FaoRegime;
  };
  nTrades: number;
  winRate: number;
  profitFactor: number;
  sharpe: number;
  sortino: number;
  maxDD: number;
  totalPnL: number;
  totalPnLPct: number;
  expectancyR: number;
  calmar: number;
  kellyHalf: number;
  result: ExtResult;
}

// Applique un filtre de régime au signal d'une stratégie
function withRegime(evalFn: StrategyEvalFn, regime: FaoRegime): StrategyEvalFn {
  if (regime === "all") return evalFn;
  return (ctx: BacktestContext, i: number): StrategySignal => {
    const sig = evalFn(ctx, i);
    const faoCtx = ctx as FaoContext;
    const adx = faoCtx.adx14?.adx?.[i];
    if (adx == null || isNaN(adx)) return sig;
    const trending = adx > 25;
    const pass = regime === "trend" ? trending : !trending;
    return pass ? sig : { long: false, short: false };
  };
}

// Exécution complète (synchrone) — pour petits échantillons
export function runFAO(
  bars: BacktestBar[],
  ctx: FaoContext,
  strategy: FaoStrategy,
  options: FaoOptions = {},
) {
  const { nSamples = 120, minWR = 35, maxDD = 40, contract = "MES", capital = 100000, seed = 7 } = options;
  const rnd = seededRandom(seed);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];

  // Baseline : SL=2 ATR, pas de TP/BE, both
  const baseParams: FaoComboParams = {
    slAtr: 2, tpAtr: 0, beAtr: 0, direction: "both", regime: "all", contract, capital,
  };
  const baseline = scoreCombo(bars, ctx, strategy, baseParams);

  const combos: FaoComboScore[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  while (combos.length < nSamples && attempts < nSamples * 6) {
    attempts++;
    const p: FaoComboParams = {
      slAtr: pick(FAO_SPACE.slAtr), tpAtr: pick(FAO_SPACE.tpAtr), beAtr: pick(FAO_SPACE.beAtr),
      direction: pick(FAO_SPACE.direction), regime: pick(FAO_SPACE.regime), contract, capital,
    };
    const key = `${p.slAtr}|${p.tpAtr}|${p.beAtr}|${p.direction}|${p.regime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const r = scoreCombo(bars, ctx, strategy, p);
    // filtres qualité
    if (r.nTrades < 5) continue;
    if (r.winRate < minWR) continue;
    if (r.maxDD * 100 > maxDD) continue;
    combos.push(r);
  }
  combos.sort((a, b) => b.expectancyR - a.expectancyR);
  const best = combos[0] || baseline;
  return { combos, best, baseline, params: { nSamples, minWR, maxDD }, attempts };
}

function scoreCombo(
  bars: BacktestBar[],
  ctx: FaoContext,
  strategy: FaoStrategy,
  p: FaoComboParams,
): FaoComboScore {
  const evalFn = withRegime(strategy.eval, p.regime);
  const extParams: BacktestExtParams = {
    slAtr: p.slAtr, tpAtr: p.tpAtr, beAtr: p.beAtr,
    direction: p.direction, contract: p.contract, capital: p.capital,
    regime: p.regime,
  };
  const res = runBacktestExt(bars, ctx, evalFn, extParams);
  return {
    params: { slAtr: p.slAtr, tpAtr: p.tpAtr, beAtr: p.beAtr, direction: p.direction, regime: p.regime },
    nTrades: res.nTrades, winRate: res.winRate, profitFactor: res.profitFactor,
    sharpe: res.sharpe, sortino: res.sortino, maxDD: res.maxDD, totalPnL: res.totalPnL,
    totalPnLPct: res.totalPnLPct, expectancyR: res.expectancyR, calmar: res.calmar,
    kellyHalf: res.kellyHalf, result: res,
  };
}

// Génère un itérateur chunké pour exécution non bloquante côté UI.
export function makeFAOChunks(
  bars: BacktestBar[],
  ctx: FaoContext,
  strategy: FaoStrategy,
  options: FaoOptions = {},
) {
  const { nSamples = 120, seed = 7, contract = "MES", capital = 100000 } = options;
  const rnd = seededRandom(seed);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
  const seen = new Set<string>();
  const queue: FaoComboParams[] = [];
  let guard = 0;
  while (queue.length < nSamples && guard < nSamples * 6) {
    guard++;
    const p: FaoComboParams = {
      slAtr: pick(FAO_SPACE.slAtr), tpAtr: pick(FAO_SPACE.tpAtr), beAtr: pick(FAO_SPACE.beAtr),
      direction: pick(FAO_SPACE.direction), regime: pick(FAO_SPACE.regime), contract, capital,
    };
    const key = `${p.slAtr}|${p.tpAtr}|${p.beAtr}|${p.direction}|${p.regime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(p);
  }
  return { queue, scoreCombo: (p: FaoComboParams) => scoreCombo(bars, ctx, strategy, p) };
}
