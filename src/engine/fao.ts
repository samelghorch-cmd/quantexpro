// @ts-nocheck — migration bulk P10-TS-ENGINE; typage strict à reprendre fichier par fichier.
// Full Auto Optim (FAO) — sweep automatique des paramètres SL/TP/BE par random sampling,
// filtre régime (ADX/Hurst), filtres qualité (WR min, DD max).
import { seededRandom } from "./random.ts";
import { runBacktestExt } from "./backtestExtended.ts";

export const FAO_SPACE = {
  slAtr: [1, 1.5, 2, 2.5, 3, 4],
  tpAtr: [0, 1.5, 2, 3, 4, 6],
  beAtr: [0, 1, 1.5, 2],
  direction: ["both", "long", "short"],
  regime: ["all", "trend", "range"], // filtre ADX
};

// Applique un filtre de régime au signal d'une stratégie
function withRegime(evalFn, regime) {
  if (regime === "all") return evalFn;
  return (ctx, i) => {
    const sig = evalFn(ctx, i);
    const adx = ctx.adx14?.adx?.[i];
    if (isNaN(adx)) return sig;
    const trending = adx > 25;
    const pass = regime === "trend" ? trending : !trending;
    return pass ? sig : { long: false, short: false };
  };
}

// Exécution complète (synchrone) — pour petits échantillons
export function runFAO(bars, ctx, strategy, options = {}) {
  const { nSamples = 120, minWR = 35, maxDD = 40, contract = "MES", capital = 100000, seed = 7 } = options;
  const rnd = seededRandom(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  // Baseline : SL=2 ATR, pas de TP/BE, both
  const baseParams = { slAtr: 2, tpAtr: 0, beAtr: 0, direction: "both", regime: "all", contract, capital };
  const baseline = scoreCombo(bars, ctx, strategy, baseParams);

  const combos = [];
  const seen = new Set();
  let attempts = 0;
  while (combos.length < nSamples && attempts < nSamples * 6) {
    attempts++;
    const p = {
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

function scoreCombo(bars, ctx, strategy, p) {
  const evalFn = withRegime(strategy.eval, p.regime);
  const res = runBacktestExt(bars, ctx, evalFn, p);
  return {
    params: { slAtr: p.slAtr, tpAtr: p.tpAtr, beAtr: p.beAtr, direction: p.direction, regime: p.regime },
    nTrades: res.nTrades, winRate: res.winRate, profitFactor: res.profitFactor,
    sharpe: res.sharpe, sortino: res.sortino, maxDD: res.maxDD, totalPnL: res.totalPnL,
    totalPnLPct: res.totalPnLPct, expectancyR: res.expectancyR, calmar: res.calmar,
    kellyHalf: res.kellyHalf, result: res,
  };
}

// Génère un itérateur chunké pour exécution non bloquante côté UI.
export function makeFAOChunks(bars, ctx, strategy, options = {}) {
  const { nSamples = 120, seed = 7, contract = "MES", capital = 100000 } = options;
  const rnd = seededRandom(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const seen = new Set();
  const queue = [];
  let guard = 0;
  while (queue.length < nSamples && guard < nSamples * 6) {
    guard++;
    const p = { slAtr: pick(FAO_SPACE.slAtr), tpAtr: pick(FAO_SPACE.tpAtr), beAtr: pick(FAO_SPACE.beAtr),
      direction: pick(FAO_SPACE.direction), regime: pick(FAO_SPACE.regime), contract, capital };
    const key = `${p.slAtr}|${p.tpAtr}|${p.beAtr}|${p.direction}|${p.regime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(p);
  }
  return { queue, scoreCombo: (p) => scoreCombo(bars, ctx, strategy, p) };
}
