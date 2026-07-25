// Modules analytiques avancés : CPCV, Feature Mining, Symbolic GP, Pairs Trading,
// Sensitivity 2D, Pareto, Cross-TF, Cross-Symbol. Tous purs JS sur le moteur interne.
import { runBacktestExt, type BacktestExtParams } from "./backtestExtended.ts";
import { buildContext, type OHLCVBar, type TradingContext } from "./context.ts";
import { aggregateBars } from "./syntheticData.ts";
import type { StrategyEvalFn } from "./backtest.ts";

export interface AnalyticsStrategy {
  eval: StrategyEvalFn;
}

export interface CpcvOptions {
  nGroups?: number;
  kTest?: number;
  purge?: number;
}

export interface CpcvPath {
  testGroups: number[];
  pnl: number;
  sharpe: number;
  winRate: number;
  maxDD: number;
  pf: number;
}

export interface CpcvResult {
  paths: CpcvPath[];
  nPaths: number;
  pbo: number;
  pnlP05: number;
  pnlP50: number;
  pnlP95: number;
  sharpeMean: number;
}

export interface FeatureMiningOptions {
  horizon?: number;
}

export interface FeatureIc {
  name: string;
  ic: number;
}

export interface FeatureMiningResult {
  features: FeatureIc[];
  horizon: number;
}

export interface SymbolicGpOptions {
  generations?: number;
  popSize?: number;
  seed?: number;
}

export interface SymbolicGpHistory {
  gen: number;
  best: number;
  mean: number;
}

export interface SymbolicGpResult {
  best: { expr: string; fitness: number };
  history: SymbolicGpHistory[];
  population: Array<{ expr: string; fit: number }>;
}

export interface PairsOptions {
  window?: number;
  entryZ?: number;
  exitZ?: number;
}

export interface PairsTrade {
  entryIdx: number;
  exitIdx: number;
  side: number;
  pnl: number;
}

export interface PairsResult {
  beta: number;
  spread: number[];
  z: number[];
  trades: PairsTrade[];
  totalPnL: number;
  winRate: number;
  correlation: number;
}

export interface Sensitivity2DOptions {
  paramX?: string;
  paramY?: string;
  valuesX?: number[];
  valuesY?: number[];
  metric?: string;
  contract?: string;
  capital?: number;
}

export interface Sensitivity2DResult {
  grid: number[][];
  valuesX: number[];
  valuesY: number[];
  paramX: string;
  paramY: string;
  metric: string;
}

export interface ParetoPoint {
  label?: string;
  ret: number;
  risk: number;
  [key: string]: unknown;
}

export interface ParetoResult {
  front: ParetoPoint[];
  dominated: ParetoPoint[];
}

export interface CrossTfOptions {
  factors?: number[];
  labels?: string[];
}

export interface CrossRunMetrics {
  sharpe: number;
  pf: number;
  winRate: number;
  maxDD: number;
  nTrades: number;
  totalPnL: number;
}

export interface CrossTfRow extends CrossRunMetrics {
  tf: string;
}

export interface CrossSymbolRow extends CrossRunMetrics {
  symbol: string;
}

interface MacdLike {
  hist: number[];
}

interface GpFeature {
  name: string;
  arr: number[];
  lo: number;
  hi: number;
}

interface GpRule {
  feat: GpFeature;
  op: "gt" | "lt";
  thr: number;
}

interface GpIndividual {
  rule: GpRule;
  fit: number;
}

// ---------- CPCV (Combinatorial Purged Cross-Validation) ----------
// Découpe les barres en N groupes, teste toutes les combinaisons de k groupes en test
// (le reste en train), avec purge autour des frontières. Renvoie distribution OOS.
export function runCPCV(
  bars: OHLCVBar[],
  _ctx: TradingContext,
  strategy: AnalyticsStrategy,
  params: BacktestExtParams,
  { nGroups = 6, kTest = 2, purge = 5 }: CpcvOptions = {},
): CpcvResult {
  const groupLen = Math.floor(bars.length / nGroups);
  const groups: Array<[number, number]> = [];
  for (let g = 0; g < nGroups; g++) groups.push([g * groupLen, g === nGroups - 1 ? bars.length : (g + 1) * groupLen]);

  const combos = kCombinations([...Array(nGroups).keys()], kTest);
  const paths: CpcvPath[] = [];
  for (const testGroups of combos) {
    // concatène les barres de test (purge exclut les bords adjacents)
    let testBars: OHLCVBar[] = [];
    for (const g of testGroups) {
      const [s, e] = groups[g];
      testBars = testBars.concat(bars.slice(s + purge, e - purge));
    }
    if (testBars.length < 60) continue;
    const tctx = buildContext(testBars);
    const r = runBacktestExt(testBars, tctx, strategy.eval, params);
    paths.push({ testGroups, pnl: r.totalPnL, sharpe: r.sharpe, winRate: r.winRate, maxDD: r.maxDD, pf: r.profitFactor });
  }
  const pnls = paths.map((p) => p.pnl).sort((a, b) => a - b);
  const sharpes = paths.map((p) => p.sharpe);
  const pbo = pnls.length ? pnls.filter((p) => p < 0).length / pnls.length : 1; // proba d'overfit ≈ frac OOS négatifs
  const pct = (arr: number[], q: number): number =>
    (arr.length ? [...arr].sort((a, b) => a - b)[Math.floor(arr.length * q)] : NaN);
  return {
    paths, nPaths: paths.length, pbo,
    pnlP05: pct(pnls, 0.05), pnlP50: pct(pnls, 0.5), pnlP95: pct(pnls, 0.95),
    sharpeMean: sharpes.reduce((a, b) => a + b, 0) / (sharpes.length || 1),
  };
}

function kCombinations(arr: number[], k: number): number[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  const [head, ...rest] = arr;
  const withHead = kCombinations(rest, k - 1).map((c) => [head, ...c]);
  const withoutHead = kCombinations(rest, k);
  return [...withHead, ...withoutHead];
}

// ---------- Feature Mining : IC (information coefficient) des indicateurs vs rendement futur ----------
export function runFeatureMining(
  bars: OHLCVBar[],
  ctx: TradingContext,
  { horizon = 5 }: FeatureMiningOptions = {},
): FeatureMiningResult {
  const n = bars.length;
  const fwdRet: number[] = [];
  for (let i = 0; i < n; i++) fwdRet.push(i + horizon < n ? (bars[i + horizon].c - bars[i].c) / bars[i].c : NaN);

  const macd = ctx.macd["12_26_9"] as MacdLike;
  const features: Record<string, number[]> = {
    "RSI 14": ctx.rsi[14], "RSI 2": ctx.rsi[2], "ADX 14": ctx.adx14.adx, "ATR 14": ctx.atr14,
    "MACD hist": macd.hist, "CCI 20": ctx.cci[20], "Z-Score 20": ctx.z[20],
    "Hurst 100": ctx.hurst100, "CMF 20": ctx.cmf20, "MFI 14": ctx.mfi[14],
    "ROC 10": ctx.roc[10], "StochRSI": ctx.stochRSI, "Williams%R 14": ctx.wpr[14],
    "Skew 20": ctx.skew20, "Kurt 50": ctx.kurt50,
  };
  const spearman = (x: number[], y: number[]): number => {
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < x.length; i++) if (!Number.isNaN(x[i]) && !Number.isNaN(y[i])) pairs.push([x[i], y[i]]);
    if (pairs.length < 10) return 0;
    const rank = (vals: number[]): number[] => {
      const idx = vals.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
      const r = Array(vals.length) as number[];
      idx.forEach(([, i], k) => { r[i] = k; });
      return r;
    };
    const rx = rank(pairs.map((p) => p[0])), ry = rank(pairs.map((p) => p[1]));
    const m = pairs.length; let mx = 0, my = 0;
    for (let i = 0; i < m; i++) { mx += rx[i]; my += ry[i]; } mx /= m; my /= m;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < m; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
    return num / (Math.sqrt(dx * dy) || 1e-9);
  };
  const results = Object.entries(features).map(([name, arr]) => ({ name, ic: spearman(arr, fwdRet) }));
  results.sort((a, b) => Math.abs(b.ic) - Math.abs(a.ic));
  return { features: results, horizon };
}

// ---------- Symbolic GP : recherche génétique de règles (feature op seuil) ----------
export function runSymbolicGP(
  bars: OHLCVBar[],
  ctx: TradingContext,
  { generations = 8, popSize = 24, seed = 7 }: SymbolicGpOptions = {},
): SymbolicGpResult {
  const rndState = { s: seed >>> 0 };
  const rnd = (): number => { rndState.s = (rndState.s * 1664525 + 1013904223) >>> 0; return rndState.s / 4294967296; };
  const macd = ctx.macd["12_26_9"] as MacdLike;
  const feats: GpFeature[] = [
    { name: "RSI14", arr: ctx.rsi[14], lo: 20, hi: 80 },
    { name: "ADX14", arr: ctx.adx14.adx, lo: 15, hi: 40 },
    { name: "Zscore20", arr: ctx.z[20], lo: -2, hi: 2 },
    { name: "MACDhist", arr: macd.hist, lo: -5, hi: 5 },
    { name: "CCI20", arr: ctx.cci[20], lo: -150, hi: 150 },
    { name: "Hurst", arr: ctx.hurst100, lo: 0.4, hi: 0.6 },
  ];
  const fwd: number[] = [];
  for (let i = 0; i < bars.length; i++) fwd.push(i + 5 < bars.length ? Math.sign(bars[i + 5].c - bars[i].c) : 0);

  const randomRule = (): GpRule => {
    const f = feats[Math.floor(rnd() * feats.length)];
    return { feat: f, op: rnd() < 0.5 ? "gt" : "lt", thr: f.lo + rnd() * (f.hi - f.lo) };
  };
  const fitness = (rule: GpRule): number => {
    let correct = 0, count = 0;
    for (let i = 50; i < bars.length - 5; i++) {
      const v = rule.feat.arr[i];
      if (Number.isNaN(v)) continue;
      const sig = rule.op === "gt" ? v > rule.thr : v < rule.thr;
      if (sig) { count++; if (fwd[i] > 0) correct++; }
    }
    return count > 10 ? correct / count : 0;
  };

  let pop: GpIndividual[] = Array.from({ length: popSize }, randomRule).map((r) => ({ rule: r, fit: fitness(r) }));
  const history: SymbolicGpHistory[] = [];
  for (let g = 0; g < generations; g++) {
    pop.sort((a, b) => b.fit - a.fit);
    history.push({ gen: g + 1, best: pop[0].fit, mean: pop.reduce((s, x) => s + x.fit, 0) / pop.length });
    const elite = pop.slice(0, Math.max(2, Math.floor(popSize / 4)));
    const next: GpIndividual[] = [...elite];
    while (next.length < popSize) {
      const parent = elite[Math.floor(rnd() * elite.length)].rule;
      const child: GpRule = { ...parent, thr: parent.thr * (0.85 + rnd() * 0.3) }; // mutation
      if (rnd() < 0.3) { const nr = randomRule(); child.feat = nr.feat; child.op = nr.op; }
      next.push({ rule: child, fit: fitness(child) });
    }
    pop = next;
  }
  pop.sort((a, b) => b.fit - a.fit);
  const best = pop[0];
  return {
    best: { expr: `${best.rule.feat.name} ${best.rule.op === "gt" ? ">" : "<"} ${best.rule.thr.toFixed(2)}`, fitness: best.fit },
    history,
    population: pop.slice(0, 10).map((p) => ({
      expr: `${p.rule.feat.name} ${p.rule.op === "gt" ? ">" : "<"} ${p.rule.thr.toFixed(2)}`,
      fit: p.fit,
    })),
  };
}

// ---------- Pairs Trading : spread + z-score entre deux séries synthétiques ----------
export function runPairsTrading(
  seriesA: OHLCVBar[],
  seriesB: OHLCVBar[],
  { window = 50, entryZ = 2, exitZ = 0.5 }: PairsOptions = {},
): PairsResult {
  const n = Math.min(seriesA.length, seriesB.length);
  const a = seriesA.slice(0, n).map((b) => b.c);
  const b = seriesB.slice(0, n).map((x) => x.c);
  // hedge ratio par régression simple
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let cov = 0, varb = 0;
  for (let i = 0; i < n; i++) { cov += (a[i] - ma) * (b[i] - mb); varb += (b[i] - mb) ** 2; }
  const beta = varb ? cov / varb : 1;
  const spread = a.map((x, i) => x - beta * b[i]);
  const z: number[] = [];
  const trades: PairsTrade[] = [];
  let pos = 0, entryIdx = 0, entrySpread = 0;
  for (let i = 0; i < n; i++) {
    if (i < window) { z.push(NaN); continue; }
    const seg = spread.slice(i - window, i);
    const m = seg.reduce((s, v) => s + v, 0) / window;
    const sd = Math.sqrt(seg.reduce((s, v) => s + (v - m) ** 2, 0) / window) || 1e-9;
    const zi = (spread[i] - m) / sd;
    z.push(zi);
    if (pos === 0) {
      if (zi > entryZ) { pos = -1; entryIdx = i; entrySpread = spread[i]; }
      else if (zi < -entryZ) { pos = 1; entryIdx = i; entrySpread = spread[i]; }
    } else if (Math.abs(zi) < exitZ) {
      const pnl = (spread[i] - entrySpread) * pos * -1;
      trades.push({ entryIdx, exitIdx: i, side: pos, pnl });
      pos = 0;
    }
  }
  const totalPnL = trades.reduce((s, t) => s + t.pnl, 0);
  const wins = trades.filter((t) => t.pnl > 0).length;
  return {
    beta, spread, z, trades, totalPnL,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    correlation: cov / (Math.sqrt(varb) * Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0)) || 1e-9),
  };
}

// ---------- Sensitivity 2D : grille de deux paramètres ----------
export function runSensitivity2D(
  bars: OHLCVBar[],
  ctx: TradingContext,
  strategy: AnalyticsStrategy,
  {
    paramX = "slAtr",
    paramY = "tpAtr",
    valuesX,
    valuesY,
    metric = "sharpe",
    contract = "MES",
    capital = 100000,
  }: Sensitivity2DOptions = {},
): Sensitivity2DResult {
  const vx = valuesX || [1, 1.5, 2, 2.5, 3, 4];
  const vy = valuesY || [0, 1.5, 2, 3, 4, 6];
  const grid = vy.map((y) => vx.map((x) => {
    const p: BacktestExtParams = { slAtr: 2, tpAtr: 0, beAtr: 0, direction: "both", contract, capital, [paramX]: x, [paramY]: y };
    const r = runBacktestExt(bars, ctx, strategy.eval, p);
    const metricVal = (r as unknown as Record<string, number>)[metric];
    return metricVal ?? r.totalPnL;
  }));
  return { grid, valuesX: vx, valuesY: vy, paramX, paramY, metric };
}

// ---------- Pareto Front : rendement vs risque, extrait la frontière non dominée ----------
export function paretoFront(points: ParetoPoint[]): ParetoResult {
  // points : [{ label, ret, risk, ... }] — maximise ret, minimise risk
  const sorted = [...points].sort((a, b) => a.risk - b.risk || b.ret - a.ret);
  const front: ParetoPoint[] = [];
  let bestRet = -Infinity;
  for (const p of sorted) { if (p.ret > bestRet) { front.push(p); bestRet = p.ret; } }
  return { front, dominated: points.filter((p) => !front.includes(p)) };
}

// ---------- Cross-TF Stability : même stratégie sur plusieurs timeframes ----------
export function runCrossTF(
  rawBars: OHLCVBar[],
  strategy: AnalyticsStrategy,
  params: BacktestExtParams,
  { factors = [1, 3, 12, 48], labels = ["5m", "15m", "1h", "4h"] }: CrossTfOptions = {},
): CrossTfRow[] {
  return factors.map((f, i) => {
    const bars = aggregateBars(rawBars, f) as OHLCVBar[];
    const ctx = buildContext(bars);
    const r = runBacktestExt(bars, ctx, strategy.eval, params);
    return { tf: labels[i], sharpe: r.sharpe, pf: r.profitFactor, winRate: r.winRate, maxDD: r.maxDD, nTrades: r.nTrades, totalPnL: r.totalPnL };
  });
}

// ---------- Cross-Symbol : même stratégie sur plusieurs séries du panier ----------
export function runCrossSymbol(
  basketSeries: Record<string, OHLCVBar[]>,
  strategy: AnalyticsStrategy,
  params: BacktestExtParams,
): CrossSymbolRow[] {
  return Object.entries(basketSeries).map(([sym, bars]) => {
    const ctx = buildContext(bars);
    const r = runBacktestExt(bars, ctx, strategy.eval, params);
    return { symbol: sym, sharpe: r.sharpe, pf: r.profitFactor, winRate: r.winRate, maxDD: r.maxDD, nTrades: r.nTrades, totalPnL: r.totalPnL };
  });
}
