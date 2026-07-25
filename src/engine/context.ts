// Extrait de v4core.js — pré-calcul de tous les indicateurs sur une série.
import { IND } from "./indicators.ts";
import { computeVPIN } from "./vpin.ts";

// Barre OHLCV brute consommée par buildContext.
export interface OHLCVBar {
  o: number; h: number; l: number; c: number; v: number; t: number;
}

// Contexte d'indicateurs pré-calculés, partagé par tout le moteur (recherche + exécution).
// Cartes indexées par période (number) pour les séries simples, par clé composite
// (string "n_m", "f_s_sig", …) pour les indicateurs multi-paramètres. Les valeurs composites
// restent `unknown` ici : leur shape est fixée par indicators.ts (encore souple, à typer ensuite).
export interface TradingContext {
  open: number[]; high: number[]; low: number[]; close: number[]; volume: number[]; time: number[];
  sma: Record<number, number[]>; ema: Record<number, number[]>; dema: Record<number, number[]>;
  tema: Record<number, number[]>; hma: Record<number, number[]>; wma: Record<number, number[]>;
  rsi: Record<number, number[]>; wpr: Record<number, number[]>; cci: Record<number, number[]>;
  mfi: Record<number, number[]>; roc: Record<number, number[]>; mom: Record<number, number[]>;
  z: Record<number, number[]>; kama: Record<number, number[]>; linreg: Record<number, unknown>;
  bb: Record<string, unknown>; kelt: Record<string, unknown>; st: Record<string, unknown>;
  macd: Record<string, unknown>; stoch: Record<string, unknown>; psar: Record<string, unknown>;
  ich: Record<string, unknown>; don: Record<number, unknown>;
  atr10: number[]; atr14: number[]; atr20: number[];
  adx14: { plusDI: number[]; minusDI: number[]; adx: number[] };
  vwap: number[]; obv: number[]; cmf20: number[]; stochRSI: number[];
  hurst100: number[]; skew20: number[]; skew50: number[]; kurt50: number[];
  vpin: number[]; vpinBvc: number[]; vpinCdf: number[]; tsi: number[]; trix: number[];
}

export function buildContext(bars: OHLCVBar[]): TradingContext {
  const open   = bars.map(b => b.o);
  const high   = bars.map(b => b.h);
  const low    = bars.map(b => b.l);
  const close  = bars.map(b => b.c);
  const volume = bars.map(b => b.v);
  const time   = bars.map(b => b.t);
  // Assemblé incrémentalement ci-dessous ; le cast déclare la shape finale garantie au retour.
  const ctx = { open, high, low, close, volume, time } as TradingContext;

  // Moyennes mobiles multiples
  const periods = [3, 5, 9, 10, 12, 20, 21, 26, 30, 34, 50, 60, 100, 200, 400];
  ctx.sma = {}; ctx.ema = {}; ctx.dema = {}; ctx.tema = {}; ctx.hma = {}; ctx.wma = {};
  periods.forEach(p => {
    ctx.sma[p] = IND.sma(close, p);
    ctx.ema[p] = IND.ema(close, p);
    ctx.dema[p] = IND.dema(close, p);
    ctx.tema[p] = IND.tema(close, p);
    ctx.hma[p] = IND.hma(close, p);
    ctx.wma[p] = IND.wma(close, p);
  });

  ctx.rsi = {}; [2, 3, 4, 5, 7, 14, 21].forEach(p => ctx.rsi[p] = IND.rsi(close, p));
  ctx.wpr = {}; [7, 14, 21, 28].forEach(p => ctx.wpr[p] = IND.wpr(high, low, close, p));
  ctx.cci = {}; [14, 20, 30, 40].forEach(p => ctx.cci[p] = IND.cci(high, low, close, p));
  ctx.mfi = {}; [7, 14, 21].forEach(p => ctx.mfi[p] = IND.mfi(high, low, close, volume, p));
  ctx.roc = {}; [5, 10, 20, 63].forEach(p => ctx.roc[p] = IND.roc(close, p));
  ctx.mom = {}; [10, 12, 15, 20, 63].forEach(p => ctx.mom[p] = IND.momentum(close, p));

  ctx.z = {};
  [10, 15, 20, 30, 50].forEach(p => ctx.z[p] = IND.zscore(close, p));

  ctx.bb = {};
  [10, 15, 20, 25, 30].forEach(n => [1.5, 2, 2.5, 3].forEach(m => {
    ctx.bb[`${n}_${m}`] = IND.bollinger(close, n, m);
  }));

  ctx.kelt = {};
  [14, 20, 30].forEach(n => [1, 1.5, 2, 2.5].forEach(m => {
    ctx.kelt[`${n}_${m}`] = IND.keltner(high, low, close, n, m);
  }));

  ctx.don = {};
  [5, 10, 15, 20, 25, 40, 55, 100, 200].forEach(n => ctx.don[n] = IND.donchian(high, low, n));

  ctx.st = {};
  [7, 10, 14, 20].forEach(n => [1.5, 2, 2.5, 3].forEach(m => {
    ctx.st[`${n}_${m}`] = IND.superTrend(high, low, close, n, m);
  }));

  ctx.macd = {};
  [[5,13,9],[8,17,9],[12,26,9],[5,35,5],[3,10,16],[19,39,9]].forEach(([f,s,sig]) => {
    ctx.macd[`${f}_${s}_${sig}`] = IND.macd(close, f, s, sig);
  });

  ctx.stoch = {};
  [[5,3],[9,3],[14,3],[21,5]].forEach(([p, d]) => {
    ctx.stoch[`${p}_${d}`] = IND.stoch(high, low, close, p, d);
  });

  ctx.psar = {};
  [[0.01,0.1],[0.02,0.2],[0.03,0.3],[0.04,0.4]].forEach(([s, m]) => {
    ctx.psar[`${s}_${m}`] = IND.psar(high, low, close, s, m);
  });

  ctx.ich = {};
  [[9,26,52],[7,22,44],[12,24,120]].forEach(([t,k,s]) => {
    ctx.ich[`${t}_${k}`] = IND.ichimoku(high, low, close, t, k, s);
  });

  // P4-CORE — KAMA / LinReg pour Rule Builder + Core Mode
  ctx.kama = {};
  [10, 21].forEach((p) => { ctx.kama[p] = IND.kama(close, p); });
  ctx.linreg = {};
  [14, 20, 50].forEach((p) => { ctx.linreg[p] = IND.linreg(close, p); });

  ctx.atr10 = IND.atr(high, low, close, 10);
  ctx.atr14 = IND.atr(high, low, close, 14);
  ctx.atr20 = IND.atr(high, low, close, 20);
  ctx.adx14 = IND.adx(high, low, close, 14);
  ctx.vwap = IND.vwap(high, low, close, volume);
  ctx.obv = IND.obv(close, volume);
  ctx.cmf20 = IND.cmf(high, low, close, volume, 20);
  ctx.stochRSI = IND.stochRSI(close, 14);
  ctx.hurst100 = IND.hurst(close, 100);
  ctx.skew20 = IND.skew(close, 20);
  ctx.skew50 = IND.skew(close, 50);
  ctx.kurt50 = IND.kurt(close, 50);
  ctx.vpin = IND.vpin(close, volume, 5000, 20);
  // VPIN réel (BVC + CDF de toxicité) — causal : la CDF ne regarde que les buckets passés.
  const _vp = computeVPIN(bars, { buckets: 200, window: 50, method: "auto", cdfWindow: 250 });
  ctx.vpinBvc = _vp.vpinByBar;   // VPIN par barre (Bulk Volume Classification)
  ctx.vpinCdf = _vp.cdfByBar;    // percentile de toxicité ∈ [0,1] — le signal opérationnel
  ctx.tsi = IND.momentum(close, 25);
  ctx.trix = IND.roc(IND.ema(IND.ema(IND.ema(close, 14), 14), 14), 1);

  return ctx;
}
