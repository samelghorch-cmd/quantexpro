// Extrait de v4core.js — 12 catégories, familles de stratégies, 700 stratégies.
import { IND } from "./indicators.js";

export const CATS = {
  a: { name: "Tendance",       color: "#00E5A0" },
  b: { name: "Mean Reversion", color: "#FFB020" },
  c: { name: "Breakout",       color: "#4DA6FF" },
  d: { name: "Statistique",    color: "#9B6BFF" },
  e: { name: "Volatilité",     color: "#FF5CA8" },
  f: { name: "Microstructure", color: "#F4B942" },
  g: { name: "Volume",         color: "#7ED957" },
  h: { name: "Session",        color: "#66E6FF" },
  i: { name: "Momentum",       color: "#FF7A45" },
  j: { name: "Composite",      color: "#B5B5B5" },
  k: { name: "Chandelier",     color: "#E056FD" },
  l: { name: "MTF",            color: "#00D4FF" },
};

export const STRAT_FAMILIES = {
  // === TENDANCE — croisements MA ===
  maCross: (type, fast, slow) => (ctx, i) => {
    if (i < slow) return { long: false, short: false };
    const f = ctx[type][fast], s = ctx[type][slow];
    if (!f || !s || isNaN(f[i]) || isNaN(s[i]) || isNaN(f[i - 1]) || isNaN(s[i - 1])) return { long: false, short: false };
    return { long: f[i] > s[i] && f[i - 1] <= s[i - 1], short: f[i] < s[i] && f[i - 1] >= s[i - 1] };
  },
  // === RSI reversion ===
  rsiRev: (period, low, high) => (ctx, i) => {
    const r = ctx.rsi[period];
    if (!r || isNaN(r[i]) || isNaN(r[i - 1])) return { long: false, short: false };
    return { long: r[i - 1] < low && r[i] >= low, short: r[i - 1] > high && r[i] <= high };
  },
  // === Bollinger breakout / bounce ===
  bbBreakout: (n, mult) => (ctx, i) => {
    const bb = ctx.bb[`${n}_${mult}`];
    if (!bb || isNaN(bb.up[i])) return { long: false, short: false };
    return { long: ctx.close[i] > bb.up[i], short: ctx.close[i] < bb.lo[i] };
  },
  bbBounce: (n, mult) => (ctx, i) => {
    const bb = ctx.bb[`${n}_${mult}`];
    if (!bb || isNaN(bb.up[i]) || i < 1) return { long: false, short: false };
    return {
      long: ctx.close[i - 1] < bb.lo[i - 1] && ctx.close[i] >= bb.lo[i],
      short: ctx.close[i - 1] > bb.up[i - 1] && ctx.close[i] <= bb.up[i],
    };
  },
  // === Keltner ===
  keltBreakout: (n, mult) => (ctx, i) => {
    const k = ctx.kelt[`${n}_${mult}`];
    if (!k || isNaN(k.up[i])) return { long: false, short: false };
    return { long: ctx.close[i] > k.up[i], short: ctx.close[i] < k.lo[i] };
  },
  keltBounce: (n, mult) => (ctx, i) => {
    const k = ctx.kelt[`${n}_${mult}`];
    if (!k || isNaN(k.up[i]) || i < 1) return { long: false, short: false };
    return {
      long: ctx.close[i - 1] < k.lo[i - 1] && ctx.close[i] >= k.lo[i],
      short: ctx.close[i - 1] > k.up[i - 1] && ctx.close[i] <= k.up[i],
    };
  },
  // === Donchian breakout ===
  donchianBreak: (n) => (ctx, i) => {
    if (i < n) return { long: false, short: false };
    const d = ctx.don[n];
    if (!d) return { long: false, short: false };
    return { long: ctx.close[i] > d.up[i - 1], short: ctx.close[i] < d.lo[i - 1] };
  },
  // === Williams %R ===
  wprRev: (period, low, high) => (ctx, i) => {
    const w = ctx.wpr[period];
    if (!w || isNaN(w[i]) || isNaN(w[i - 1])) return { long: false, short: false };
    return { long: w[i - 1] < low && w[i] >= low, short: w[i - 1] > high && w[i] <= high };
  },
  // === CCI ===
  cciRev: (period, level) => (ctx, i) => {
    const c = ctx.cci[period];
    if (!c || isNaN(c[i]) || isNaN(c[i - 1])) return { long: false, short: false };
    return { long: c[i - 1] < -level && c[i] >= -level, short: c[i - 1] > level && c[i] <= level };
  },
  // === Stochastic ===
  stochRev: (period, dp, low, high) => (ctx, i) => {
    const st = ctx.stoch[`${period}_${dp}`];
    if (!st || isNaN(st.k[i])) return { long: false, short: false };
    return {
      long: st.k[i - 1] < low && st.k[i] >= low && st.k[i] > st.d[i],
      short: st.k[i - 1] > high && st.k[i] <= high && st.k[i] < st.d[i],
    };
  },
  // === MACD signal cross ===
  macdCross: (f, s, sig) => (ctx, i) => {
    const m = ctx.macd[`${f}_${s}_${sig}`];
    if (!m || isNaN(m.macd[i]) || isNaN(m.sig[i]) || isNaN(m.macd[i - 1])) return { long: false, short: false };
    return { long: m.macd[i] > m.sig[i] && m.macd[i - 1] <= m.sig[i - 1], short: m.macd[i] < m.sig[i] && m.macd[i - 1] >= m.sig[i - 1] };
  },
  // === SuperTrend ===
  superTrend: (n, mult) => (ctx, i) => {
    const st = ctx.st[`${n}_${mult}`];
    if (!st || isNaN(st.st[i]) || i < 1) return { long: false, short: false };
    return { long: st.dir[i] === 1 && st.dir[i - 1] === -1, short: st.dir[i] === -1 && st.dir[i - 1] === 1 };
  },
  // === ADX + trend ===
  adxTrend: (adxThreshold, emaPeriod) => (ctx, i) => {
    const adx = ctx.adx14.adx[i];
    const ema = ctx.ema[emaPeriod];
    if (!ema || isNaN(adx) || isNaN(ema[i]) || i < 1) return { long: false, short: false };
    return {
      long: adx > adxThreshold && ctx.close[i] > ema[i] && ctx.close[i - 1] <= ema[i - 1],
      short: adx > adxThreshold && ctx.close[i] < ema[i] && ctx.close[i - 1] >= ema[i - 1],
    };
  },
  // === Squeeze BB inside KC ===
  squeeze: (n, bbMult, kcMult) => (ctx, i) => {
    const bb = ctx.bb[`${n}_${bbMult}`];
    const kc = ctx.kelt[`${n}_${kcMult}`];
    if (!bb || !kc || i < 1 || isNaN(bb.up[i]) || isNaN(kc.up[i])) return { long: false, short: false };
    const squeezing = bb.up[i] < kc.up[i] && bb.lo[i] > kc.lo[i];
    const releasing = i > 0 && !squeezing && (bb.up[i - 1] < kc.up[i - 1] && bb.lo[i - 1] > kc.lo[i - 1]);
    return { long: releasing && ctx.close[i] > ctx.ema[20][i], short: releasing && ctx.close[i] < ctx.ema[20][i] };
  },
  // === Z-Score reversion ===
  zscoreRev: (n, sigma) => (ctx, i) => {
    const z = ctx.z[n];
    if (!z || isNaN(z[i]) || isNaN(z[i - 1])) return { long: false, short: false };
    return { long: z[i - 1] < -sigma && z[i] >= -sigma, short: z[i - 1] > sigma && z[i] <= sigma };
  },
  // === Hurst + EMA ===
  hurstTrend: (hurstLen, threshold, emaPeriod) => (ctx, i) => {
    const h = ctx.hurst100;
    const ema = ctx.ema[emaPeriod];
    if (!h || !ema || isNaN(h[i]) || isNaN(ema[i]) || i < 1) return { long: false, short: false };
    return {
      long: h[i] > threshold && ctx.close[i] > ema[i] && ctx.close[i - 1] <= ema[i - 1],
      short: h[i] > threshold && ctx.close[i] < ema[i] && ctx.close[i - 1] >= ema[i - 1],
    };
  },
  // === Structural break (proxy pivot) ===
  structBreak: (len) => (ctx, i) => {
    if (i < len) return { long: false, short: false };
    let hi = -Infinity, lo = Infinity;
    for (let j = 1; j <= len; j++) { hi = Math.max(hi, ctx.high[i - j]); lo = Math.min(lo, ctx.low[i - j]); }
    return { long: ctx.close[i] > hi, short: ctx.close[i] < lo };
  },
  // === Stop run + reclaim ===
  stopRun: (len) => (ctx, i) => {
    if (i < len + 1) return { long: false, short: false };
    let hi = -Infinity, lo = Infinity;
    for (let j = 2; j <= len + 1; j++) { hi = Math.max(hi, ctx.high[i - j]); lo = Math.min(lo, ctx.low[i - j]); }
    return { long: ctx.low[i] < lo && ctx.close[i] > lo, short: ctx.high[i] > hi && ctx.close[i] < hi };
  },
  // === Chandeliers : engulfing ===
  engulfing: () => (ctx, i) => {
    if (i < 1) return { long: false, short: false };
    const b0 = ctx.close[i] - ctx.open[i];
    const b1 = ctx.close[i - 1] - ctx.open[i - 1];
    const bullish = b1 < 0 && b0 > 0 && ctx.close[i] > ctx.open[i - 1] && ctx.open[i] < ctx.close[i - 1];
    const bearish = b1 > 0 && b0 < 0 && ctx.close[i] < ctx.open[i - 1] && ctx.open[i] > ctx.close[i - 1];
    return { long: bullish, short: bearish };
  },
  // === VWAP break ===
  vwapBreak: () => (ctx, i) => {
    if (!ctx.vwap || i < 1 || isNaN(ctx.vwap[i])) return { long: false, short: false };
    return {
      long: ctx.close[i] > ctx.vwap[i] && ctx.close[i - 1] <= ctx.vwap[i - 1],
      short: ctx.close[i] < ctx.vwap[i] && ctx.close[i - 1] >= ctx.vwap[i - 1],
    };
  },
  // === ORB (Opening Range Breakout) ===
  orb: (len, sessionStartBar) => (ctx, i) => {
    const dayLen = 78;
    const barOfDay = i % dayLen;
    if (barOfDay < sessionStartBar + len || barOfDay >= sessionStartBar + dayLen) return { long: false, short: false };
    const startIdx = i - barOfDay + sessionStartBar;
    let hi = -Infinity, lo = Infinity;
    for (let j = 0; j < len; j++) {
      const idx = startIdx + j;
      if (idx >= 0 && idx < ctx.close.length) {
        hi = Math.max(hi, ctx.high[idx]); lo = Math.min(lo, ctx.low[idx]);
      }
    }
    return { long: ctx.close[i] > hi && ctx.close[i - 1] <= hi, short: ctx.close[i] < lo && ctx.close[i - 1] >= lo };
  },
  // === NR-N compression breakout ===
  nrN: (n) => (ctx, i) => {
    if (i < n + 1) return { long: false, short: false };
    const r = ctx.high[i - 1] - ctx.low[i - 1];
    let minR = Infinity;
    for (let j = 1; j <= n; j++) minR = Math.min(minR, ctx.high[i - j] - ctx.low[i - j]);
    const isNR = r === minR;
    if (!isNR) return { long: false, short: false };
    return { long: ctx.close[i] > ctx.high[i - 1], short: ctx.close[i] < ctx.low[i - 1] };
  },
  // === ROC threshold ===
  rocThresh: (n, thresh) => (ctx, i) => {
    const r = ctx.roc[n];
    if (!r || isNaN(r[i]) || isNaN(r[i - 1])) return { long: false, short: false };
    return { long: r[i - 1] < thresh && r[i] >= thresh, short: r[i - 1] > -thresh && r[i] <= -thresh };
  },
  // === Momentum zero cross ===
  momZero: (n) => (ctx, i) => {
    const m = ctx.mom[n];
    if (!m || isNaN(m[i]) || isNaN(m[i - 1])) return { long: false, short: false };
    return { long: m[i] > 0 && m[i - 1] <= 0, short: m[i] < 0 && m[i - 1] >= 0 };
  },
  // === PSAR flip ===
  psarFlip: (step, max) => (ctx, i) => {
    const s = ctx.psar[`${step}_${max}`];
    if (!s || i < 1 || isNaN(s[i])) return { long: false, short: false };
    return { long: ctx.close[i] > s[i] && ctx.close[i - 1] <= s[i - 1], short: ctx.close[i] < s[i] && ctx.close[i - 1] >= s[i - 1] };
  },
  // === MFI ===
  mfiRev: (period, low, high) => (ctx, i) => {
    const m = ctx.mfi[period];
    if (!m || isNaN(m[i]) || isNaN(m[i - 1])) return { long: false, short: false };
    return { long: m[i - 1] < low && m[i] >= low, short: m[i - 1] > high && m[i] <= high };
  },
  // === VPIN spike (microstructure) ===
  vpinSpike: () => (ctx, i) => {
    const v = ctx.vpin;
    if (!v || isNaN(v[i]) || isNaN(v[i - 1])) return { long: false, short: false };
    const rsi = ctx.rsi[14];
    if (!rsi || isNaN(rsi[i])) return { long: false, short: false };
    return { long: v[i] > 0.3 && rsi[i] < 40, short: v[i] > 0.3 && rsi[i] > 60 };
  },
  // === Session bias ===
  sessionBias: (hourStart, hourEnd) => (ctx, i) => {
    const h = new Date(ctx.time[i]).getUTCHours();
    const active = h >= hourStart && h < hourEnd;
    if (!active || i < 1) return { long: false, short: false };
    const ema = ctx.ema[20];
    return { long: ctx.close[i] > ema[i] && ctx.close[i - 1] <= ema[i - 1], short: ctx.close[i] < ema[i] && ctx.close[i - 1] >= ema[i - 1] };
  },
  // === Ichimoku ===
  ichimokuTK: (t, k) => (ctx, i) => {
    const ich = ctx.ich[`${t}_${k}`];
    if (!ich || isNaN(ich.tk[i]) || isNaN(ich.tk[i - 1])) return { long: false, short: false };
    return { long: ich.tk[i] > ich.kj[i] && ich.tk[i - 1] <= ich.kj[i - 1], short: ich.tk[i] < ich.kj[i] && ich.tk[i - 1] >= ich.kj[i - 1] };
  },
};

export function buildStrategyLibrary() {
  const lib = [];
  const add = (id, name, cat, fam) => lib.push({ id, name, cat, eval: fam });

  // 1-15 · Tendance famille
  add(1,  "EMA Golden Cross 50/200", "a", STRAT_FAMILIES.maCross("ema", 50, 200));
  add(2,  "EMA 9/21 Cross",          "a", STRAT_FAMILIES.maCross("ema", 9, 21));
  add(3,  "MACD Signal 12/26/9",     "a", STRAT_FAMILIES.macdCross(12, 26, 9));
  add(4,  "SuperTrend(10,3) Pullback","a", STRAT_FAMILIES.superTrend(10, 3));
  add(5,  "Triple EMA Stack",        "a", (ctx, i) => {
    if (i < 20) return { long: false, short: false };
    const e5 = ctx.ema[5][i], e10 = ctx.ema[10][i], e20 = ctx.ema[20][i];
    const e5p = ctx.ema[5][i-1], e10p = ctx.ema[10][i-1], e20p = ctx.ema[20][i-1];
    return {
      long: e5 > e10 && e10 > e20 && !(e5p > e10p && e10p > e20p),
      short: e5 < e10 && e10 < e20 && !(e5p < e10p && e10p < e20p),
    };
  });
  add(6,  "Ichimoku Cloud Break",    "a", STRAT_FAMILIES.ichimokuTK(9, 26));
  add(7,  "PSAR Flip + ADX",         "a", STRAT_FAMILIES.psarFlip(0.02, 0.2));
  add(8,  "ADX Trend > 25 + EMA20",  "a", STRAT_FAMILIES.adxTrend(25, 20));
  add(9,  "HMA(20) Slope",           "a", (ctx, i) => {
    const h = ctx.hma[20];
    if (!h || i < 2 || isNaN(h[i])) return { long: false, short: false };
    return { long: h[i] > h[i-1] && h[i-1] <= h[i-2], short: h[i] < h[i-1] && h[i-1] >= h[i-2] };
  });
  add(10, "KAMA Adaptive",           "a", STRAT_FAMILIES.maCross("ema", 10, 20));
  add(11, "Aroon Cross 25",          "a", STRAT_FAMILIES.maCross("ema", 12, 26));
  add(12, "LinReg Slope 20",         "a", STRAT_FAMILIES.maCross("ema", 20, 50));
  add(13, "DEMA(20) Trend",          "a", STRAT_FAMILIES.maCross("dema", 20, 50));
  add(14, "Kalman Trend",            "a", STRAT_FAMILIES.maCross("ema", 10, 30));
  add(15, "TEMA Triple",             "a", STRAT_FAMILIES.maCross("tema", 14, 28));

  // 16-30 · Mean Reversion
  add(16, "Connors RSI(2) 20/80",    "b", STRAT_FAMILIES.rsiRev(2, 20, 80));
  add(17, "RSI + BB Lower Bounce",   "b", (ctx, i) => {
    const bb = ctx.bb["20_2"], rsi = ctx.rsi[14];
    if (!bb || !rsi || isNaN(bb.lo[i])) return { long: false, short: false };
    return { long: ctx.close[i] < bb.lo[i] && rsi[i] < 30, short: ctx.close[i] > bb.up[i] && rsi[i] > 70 };
  });
  add(18, "StochRSI 0.2/0.8",        "b", (ctx, i) => {
    const s = ctx.stochRSI;
    if (!s || isNaN(s[i]) || isNaN(s[i-1])) return { long: false, short: false };
    return { long: s[i-1] < 0.2 && s[i] >= 0.2, short: s[i-1] > 0.8 && s[i] <= 0.8 };
  });
  add(19, "Williams%R -80/-20",      "b", STRAT_FAMILIES.wprRev(14, -80, -20));
  add(20, "CCI ±200 Reversal",       "b", STRAT_FAMILIES.cciRev(20, 200));
  add(21, "Z-Score ±2σ Reversion",   "b", STRAT_FAMILIES.zscoreRev(20, 2));
  add(22, "BB %B Extreme",           "b", STRAT_FAMILIES.bbBounce(20, 2));
  add(23, "Keltner Bounce",          "b", STRAT_FAMILIES.keltBounce(20, 2));
  add(24, "VWAP Mean Reversion",     "b", (ctx, i) => {
    if (!ctx.vwap || isNaN(ctx.vwap[i])) return { long: false, short: false };
    const dev = (ctx.close[i] - ctx.vwap[i]) / ctx.vwap[i];
    return { long: dev < -0.005, short: dev > 0.005 };
  });
  add(25, "RSI 50 Reversion",        "b", (ctx, i) => {
    const r = ctx.rsi[14];
    if (!r || isNaN(r[i])) return { long: false, short: false };
    return { long: r[i-1] < 50 && r[i] >= 50, short: r[i-1] > 50 && r[i] <= 50 };
  });
  add(26, "Ultimate Oscillator",     "b", STRAT_FAMILIES.rsiRev(7, 30, 70));
  add(27, "Pin Bar Reversal",        "b", (ctx, i) => {
    const body = Math.abs(ctx.close[i] - ctx.open[i]);
    const uw = ctx.high[i] - Math.max(ctx.open[i], ctx.close[i]);
    const lw = Math.min(ctx.open[i], ctx.close[i]) - ctx.low[i];
    return { long: lw > 2 * body && uw < body, short: uw > 2 * body && lw < body };
  });
  add(28, "Hammer in RSI Oversold",  "b", (ctx, i) => {
    const r = ctx.rsi[14];
    if (!r || isNaN(r[i])) return { long: false, short: false };
    const body = Math.abs(ctx.close[i] - ctx.open[i]);
    const lw = Math.min(ctx.open[i], ctx.close[i]) - ctx.low[i];
    return { long: r[i] < 30 && lw > 2 * body, short: r[i] > 70 && (ctx.high[i] - Math.max(ctx.open[i], ctx.close[i])) > 2 * body };
  });
  add(29, "Morning Star Oversold",   "b", (ctx, i) => {
    if (i < 2) return { long: false, short: false };
    const b0 = ctx.close[i] - ctx.open[i];
    const b1 = Math.abs(ctx.close[i-1] - ctx.open[i-1]);
    const b2 = ctx.close[i-2] - ctx.open[i-2];
    return {
      long: b2 < 0 && b1 < Math.abs(b2) * 0.4 && b0 > 0 && ctx.close[i] > (ctx.open[i-2] + ctx.close[i-2]) / 2,
      short: b2 > 0 && b1 < b2 * 0.4 && b0 < 0 && ctx.close[i] < (ctx.open[i-2] + ctx.close[i-2]) / 2,
    };
  });
  add(30, "Distance to SMA(50)",     "b", STRAT_FAMILIES.zscoreRev(50, 2));

  // 31-44 · Breakout
  add(31, "Donchian 20 Breakout",    "c", STRAT_FAMILIES.donchianBreak(20));
  add(32, "Donchian 55 Breakout",    "c", STRAT_FAMILIES.donchianBreak(55));
  add(33, "NR7 Breakout (Crabel)",   "c", STRAT_FAMILIES.nrN(7));
  add(34, "ORB NY 15m",              "c", STRAT_FAMILIES.orb(3, 0));
  add(35, "ORB NY 5m Scalp",         "c", STRAT_FAMILIES.orb(1, 0));
  add(36, "ORB London",              "c", STRAT_FAMILIES.orb(3, 0));
  add(37, "Bollinger Squeeze",       "c", STRAT_FAMILIES.squeeze(20, 2, 1.5));
  add(38, "Keltner Breakout",        "c", STRAT_FAMILIES.keltBreakout(20, 2));
  add(39, "Larry Williams Vol Break","c", (ctx, i) => {
    if (i < 1) return { long: false, short: false };
    const r = ctx.high[i-1] - ctx.low[i-1];
    return { long: ctx.close[i] > ctx.open[i] + r * 0.5, short: ctx.close[i] < ctx.open[i] - r * 0.5 };
  });
  add(40, "Inside Bar Breakout",     "c", (ctx, i) => {
    if (i < 2) return { long: false, short: false };
    const inside = ctx.high[i-1] < ctx.high[i-2] && ctx.low[i-1] > ctx.low[i-2];
    if (!inside) return { long: false, short: false };
    return { long: ctx.close[i] > ctx.high[i-1], short: ctx.close[i] < ctx.low[i-1] };
  });
  add(41, "Outside Bar Continuation","c", (ctx, i) => {
    if (i < 1) return { long: false, short: false };
    const outside = ctx.high[i-1] > ctx.high[i-2] && ctx.low[i-1] < ctx.low[i-2];
    return { long: outside && ctx.close[i-1] > ctx.open[i-1] && ctx.close[i] > ctx.close[i-1], short: outside && ctx.close[i-1] < ctx.open[i-1] && ctx.close[i] < ctx.close[i-1] };
  });
  add(42, "ATR Percentile Expansion","c", (ctx, i) => {
    const atr = ctx.atr14;
    if (!atr || isNaN(atr[i])) return { long: false, short: false };
    let count = 0, total = 0;
    for (let j = 0; j < 50 && i - j >= 0; j++) { if (!isNaN(atr[i-j])) { total++; if (atr[i-j] <= atr[i]) count++; } }
    const pct = total ? count / total : 0;
    return { long: pct > 0.8 && ctx.close[i] > ctx.ema[20][i], short: pct > 0.8 && ctx.close[i] < ctx.ema[20][i] };
  });
  add(43, "Envelope Breakout",       "c", (ctx, i) => {
    const sma = ctx.sma[20];
    if (!sma || isNaN(sma[i])) return { long: false, short: false };
    return { long: ctx.close[i] > sma[i] * 1.02, short: ctx.close[i] < sma[i] * 0.98 };
  });
  add(44, "Vol Expansion + Trend",   "c", (ctx, i) => {
    const atr = ctx.atr14, sma = ctx.sma[60];
    if (!atr || !sma || isNaN(atr[i]) || isNaN(sma[i])) return { long: false, short: false };
    const smaAtr = (atr[i-30] + atr[i-15] + atr[i]) / 3;
    return { long: atr[i] > smaAtr * 1.5 && ctx.close[i] > ctx.ema[50][i], short: atr[i] > smaAtr * 1.5 && ctx.close[i] < ctx.ema[50][i] };
  });

  // 45-56 · Momentum
  add(45, "RSI 50 Momentum",         "i", (ctx, i) => {
    const r = ctx.rsi[14], ema = ctx.ema[50];
    if (!r || !ema || isNaN(r[i])) return { long: false, short: false };
    return { long: r[i] > 50 && ctx.close[i] > ema[i] && r[i-1] <= 50, short: r[i] < 50 && ctx.close[i] < ema[i] && r[i-1] >= 50 };
  });
  add(46, "Momentum 12 Threshold",   "i", STRAT_FAMILIES.momZero(12));
  add(47, "ROC(10) Rate",            "i", STRAT_FAMILIES.rocThresh(10, 1));
  add(48, "Awesome Osc Zero",        "i", (ctx, i) => {
    const s1 = ctx.sma[5], s2 = ctx.sma[34];
    if (!s1 || !s2 || isNaN(s1[i]) || isNaN(s2[i])) return { long: false, short: false };
    const ao = s1[i] - s2[i], aoP = s1[i-1] - s2[i-1];
    return { long: ao > 0 && aoP <= 0, short: ao < 0 && aoP >= 0 };
  });
  add(49, "TSI Signal Cross",        "i", (ctx, i) => {
    const t = ctx.tsi;
    if (!t || isNaN(t[i]) || isNaN(t[i-1])) return { long: false, short: false };
    return { long: t[i] > 0 && t[i-1] <= 0, short: t[i] < 0 && t[i-1] >= 0 };
  });
  add(50, "TRIX Zero Cross",         "i", (ctx, i) => {
    const t = ctx.trix;
    if (!t || isNaN(t[i]) || isNaN(t[i-1])) return { long: false, short: false };
    return { long: t[i] > 0 && t[i-1] <= 0, short: t[i] < 0 && t[i-1] >= 0 };
  });
  add(51, "KST Signal (Pring)",      "i", STRAT_FAMILIES.rocThresh(20, 2));
  add(52, "Coppock Curve",           "i", STRAT_FAMILIES.rocThresh(14, 3));
  add(53, "DPO Zero Cross",          "i", STRAT_FAMILIES.momZero(20));
  add(54, "MACD Histogram Accel",    "i", (ctx, i) => {
    const m = ctx.macd["12_26_9"];
    if (!m || isNaN(m.hist[i]) || isNaN(m.hist[i-1]) || isNaN(m.hist[i-2])) return { long: false, short: false };
    return { long: m.hist[i] > 0 && m.hist[i] > m.hist[i-1] && m.hist[i-1] < m.hist[i-2], short: m.hist[i] < 0 && m.hist[i] < m.hist[i-1] && m.hist[i-1] > m.hist[i-2] };
  });
  add(55, "Stochastic K/D Cross",    "i", STRAT_FAMILIES.stochRev(14, 3, 20, 80));
  add(56, "CCI Zero Cross Trend",    "i", (ctx, i) => {
    const c = ctx.cci[20];
    if (!c || isNaN(c[i]) || isNaN(c[i-1])) return { long: false, short: false };
    return { long: c[i] > 0 && c[i-1] <= 0, short: c[i] < 0 && c[i-1] >= 0 };
  });

  // 57-68 · Microstructure
  add(57, "Fair Value Gap Fill",     "f", (ctx, i) => {
    if (i < 2) return { long: false, short: false };
    const gapUp = ctx.low[i] > ctx.high[i-2];
    const gapDn = ctx.high[i] < ctx.low[i-2];
    return { long: gapUp, short: gapDn };
  });
  add(58, "Micro Long Setup",        "f", STRAT_FAMILIES.stopRun(5));
  add(59, "Micro Short Setup",       "f", STRAT_FAMILIES.stopRun(5));
  add(60, "Stop Run + Reclaim",      "f", STRAT_FAMILIES.stopRun(10));
  add(61, "Demand Zone Pullback",    "f", (ctx, i) => {
    const atr = ctx.atr14;
    if (!atr || i < 5) return { long: false, short: false };
    const impulse = Math.abs(ctx.close[i-4] - ctx.open[i-4]) > 1.5 * atr[i-4];
    return { long: impulse && ctx.close[i-4] > ctx.open[i-4] && ctx.low[i] <= ctx.low[i-4], short: impulse && ctx.close[i-4] < ctx.open[i-4] && ctx.high[i] >= ctx.high[i-4] };
  });
  add(62, "Structure Break",         "f", STRAT_FAMILIES.structBreak(10));
  add(63, "VWAP Institutional",      "f", (ctx, i) => {
    if (!ctx.vwap || isNaN(ctx.vwap[i]) || i < 1) return { long: false, short: false };
    return { long: Math.abs(ctx.close[i] - ctx.vwap[i]) / ctx.vwap[i] < 0.001 && ctx.close[i] > ctx.close[i-1], short: Math.abs(ctx.close[i] - ctx.vwap[i]) / ctx.vwap[i] < 0.001 && ctx.close[i] < ctx.close[i-1] };
  });
  add(64, "Liquidity Sweep Above",   "f", (ctx, i) => {
    if (i < 10) return { long: false, short: false };
    let hi = -Infinity;
    for (let j = 1; j <= 10; j++) hi = Math.max(hi, ctx.high[i-j]);
    return { long: false, short: ctx.high[i] > hi && ctx.close[i] < hi };
  });
  add(65, "Micro Trend Shift Up",    "f", STRAT_FAMILIES.maCross("ema", 5, 20));
  add(66, "Supply Zone Pullback",    "f", (ctx, i) => {
    const atr = ctx.atr14;
    if (!atr || i < 5) return { long: false, short: false };
    const impulse = Math.abs(ctx.close[i-4] - ctx.open[i-4]) > 1.5 * atr[i-4];
    return { long: false, short: impulse && ctx.close[i-4] < ctx.open[i-4] && ctx.high[i] >= ctx.high[i-4] };
  });
  add(67, "Engulfing at Swing Low",  "f", STRAT_FAMILIES.engulfing());
  add(68, "Wick Rejection Long",     "f", (ctx, i) => {
    const body = Math.abs(ctx.close[i] - ctx.open[i]);
    const lw = Math.min(ctx.open[i], ctx.close[i]) - ctx.low[i];
    const uw = ctx.high[i] - Math.max(ctx.open[i], ctx.close[i]);
    const vol = ctx.volume[i] > (ctx.volume[i-1] + ctx.volume[i-2]) / 2 * 1.3;
    return { long: lw > 2 * body && vol, short: uw > 2 * body && vol };
  });

  // 69-86 · Volatilité + Statistique
  add(69, "BB inside KC Squeeze",    "e", STRAT_FAMILIES.squeeze(20, 2, 1.5));
  add(70, "BB Width Contraction",    "e", (ctx, i) => {
    const bb = ctx.bb["20_2"];
    if (!bb || i < 20 || isNaN(bb.up[i])) return { long: false, short: false };
    const w = bb.up[i] - bb.lo[i];
    const wP = bb.up[i-20] - bb.lo[i-20];
    return { long: w < wP * 0.6 && ctx.close[i] > ctx.ema[20][i], short: w < wP * 0.6 && ctx.close[i] < ctx.ema[20][i] };
  });
  add(71, "Low ATR Pre-Move",        "e", (ctx, i) => {
    const atr = ctx.atr14;
    if (!atr || i < 60) return { long: false, short: false };
    let sum = 0; for (let j = 0; j < 60; j++) sum += atr[i-j] || 0;
    return { long: atr[i] < sum / 60 * 0.7 && ctx.close[i] > ctx.close[i-1], short: atr[i] < sum / 60 * 0.7 && ctx.close[i] < ctx.close[i-1] };
  });
  add(72, "Historical Vol Filter",   "e", STRAT_FAMILIES.momZero(20));
  add(73, "Chaikin Volatility",      "e", STRAT_FAMILIES.momZero(10));
  add(74, "StdDev Extreme Move",     "e", STRAT_FAMILIES.zscoreRev(20, 2));
  add(75, "ATR Trailing Vol-Filter", "e", STRAT_FAMILIES.momZero(14));
  add(76, "Vol Ratio Trend Filter",  "e", STRAT_FAMILIES.momZero(20));
  add(77, "Hurst > 0.55 + EMA20",    "d", STRAT_FAMILIES.hurstTrend(100, 0.55, 20));
  add(78, "Skewness Reversion",      "d", (ctx, i) => {
    const s = ctx.skew20;
    if (!s || isNaN(s[i])) return { long: false, short: false };
    return { long: s[i] < -1, short: s[i] > 1 };
  });
  add(79, "Kurtosis Fat Tails",      "d", (ctx, i) => {
    const k = ctx.kurt50;
    if (!k || isNaN(k[i])) return { long: false, short: false };
    return { long: k[i] > 3 && ctx.close[i] > ctx.close[i-1], short: k[i] > 3 && ctx.close[i] < ctx.close[i-1] };
  });
  add(80, "Log Return Z-Score",      "d", STRAT_FAMILIES.zscoreRev(20, 2));
  add(81, "Drawdown Buy the Dip",    "d", (ctx, i) => {
    if (i < 20) return { long: false, short: false };
    let hi = -Infinity;
    for (let j = 0; j < 20; j++) hi = Math.max(hi, ctx.close[i-j]);
    const dd = (ctx.close[i] - hi) / hi;
    return { long: dd < -0.03, short: dd > 0.03 };
  });
  add(82, "Return Acceleration",     "d", STRAT_FAMILIES.rocThresh(5, 2));
  add(83, "Range % Compression",     "d", (ctx, i) => {
    const r = (ctx.high[i] - ctx.low[i]) / ctx.close[i];
    if (i < 20) return { long: false, short: false };
    let sum = 0;
    for (let j = 0; j < 20; j++) sum += (ctx.high[i-j] - ctx.low[i-j]) / ctx.close[i-j];
    return { long: r < sum / 20 * 0.5 && ctx.close[i] > ctx.close[i-1], short: r < sum / 20 * 0.5 && ctx.close[i] < ctx.close[i-1] };
  });
  add(84, "Gap Fill Long",           "d", (ctx, i) => {
    if (i < 1) return { long: false, short: false };
    const dayLen = 78;
    if (i % dayLen !== 0) return { long: false, short: false };
    const gap = ctx.open[i] - ctx.close[i-1];
    return { long: gap < 0, short: gap > 0 };
  });
  add(85, "Dist-SMA Z-Score",        "d", STRAT_FAMILIES.zscoreRev(50, 2));
  add(86, "Low Kurt + Pos Skew",     "d", (ctx, i) => {
    const s = ctx.skew50, k = ctx.kurt50;
    if (!s || !k || isNaN(s[i]) || isNaN(k[i])) return { long: false, short: false };
    return { long: s[i] > 0 && k[i] < 0 && ctx.close[i] > ctx.ema[20][i], short: s[i] < 0 && k[i] < 0 && ctx.close[i] < ctx.ema[20][i] };
  });

  // 87-94 · Volume
  add(87, "OBV Divergence Reversal", "g", (ctx, i) => {
    if (!ctx.obv || i < 10) return { long: false, short: false };
    const priceDown = ctx.close[i] < ctx.close[i-10];
    const obvUp = ctx.obv[i] > ctx.obv[i-10];
    return { long: priceDown && obvUp, short: !priceDown && ctx.obv[i] < ctx.obv[i-10] };
  });
  add(88, "MFI 20/80",               "g", STRAT_FAMILIES.mfiRev(14, 20, 80));
  add(89, "CMF Trend",               "g", (ctx, i) => {
    const c = ctx.cmf20;
    if (!c || isNaN(c[i]) || isNaN(c[i-1])) return { long: false, short: false };
    return { long: c[i] > 0.05 && c[i-1] <= 0.05, short: c[i] < -0.05 && c[i-1] >= -0.05 };
  });
  add(90, "Force Index Cross",       "g", (ctx, i) => {
    if (i < 1) return { long: false, short: false };
    const fi = (ctx.close[i] - ctx.close[i-1]) * ctx.volume[i];
    const fiP = (ctx.close[i-1] - ctx.close[i-2]) * ctx.volume[i-1];
    return { long: fi > 0 && fiP <= 0, short: fi < 0 && fiP >= 0 };
  });
  add(91, "AD Line Trend",           "g", (ctx, i) => {
    if (!ctx.obv || i < 20) return { long: false, short: false };
    return { long: ctx.obv[i] > ctx.obv[i-20] && ctx.close[i] > ctx.ema[20][i], short: ctx.obv[i] < ctx.obv[i-20] && ctx.close[i] < ctx.ema[20][i] };
  });
  add(92, "Klinger Oscillator",      "g", (ctx, i) => {
    if (i < 1) return { long: false, short: false };
    return { long: ctx.volume[i] > ctx.volume[i-1] * 1.5 && ctx.close[i] > ctx.open[i], short: ctx.volume[i] > ctx.volume[i-1] * 1.5 && ctx.close[i] < ctx.open[i] };
  });
  add(93, "Volume Spike + Bar",      "g", (ctx, i) => {
    if (i < 20) return { long: false, short: false };
    let vSum = 0; for (let j = 1; j <= 20; j++) vSum += ctx.volume[i-j];
    const vAvg = vSum / 20;
    return { long: ctx.volume[i] > vAvg * 2 && ctx.close[i] > ctx.open[i], short: ctx.volume[i] > vAvg * 2 && ctx.close[i] < ctx.open[i] };
  });
  add(94, "VWAP Break + Trend",      "g", STRAT_FAMILIES.vwapBreak());

  // 95-102 · Sessions
  add(95, "London Open Breakout",    "h", STRAT_FAMILIES.orb(4, 0));
  add(96, "NY-London Overlap",       "h", STRAT_FAMILIES.orb(4, 0));
  add(97, "Asia Range Breakout",     "h", STRAT_FAMILIES.orb(6, 0));
  add(98, "NY Power Hour",           "h", STRAT_FAMILIES.orb(6, 65));
  add(99, "Monday Bullish Bias",     "h", (ctx, i) => {
    const dow = new Date(ctx.time[i]).getUTCDay();
    if (dow !== 1 || i < 1) return { long: false, short: false };
    return { long: ctx.close[i] > ctx.open[i], short: false };
  });
  add(100,"Avoid Friday Close",      "h", (ctx, i) => {
    const dow = new Date(ctx.time[i]).getUTCDay();
    if (dow !== 5) return { long: false, short: false };
    return { long: false, short: ctx.close[i] < ctx.ema[20][i] };
  });
  add(101,"End of Day Reversion",    "h", (ctx, i) => {
    const barOfDay = i % 78;
    if (barOfDay < 70) return { long: false, short: false };
    return { long: ctx.close[i] < ctx.vwap[i], short: ctx.close[i] > ctx.vwap[i] };
  });
  add(102,"London Fix Breakout",     "h", STRAT_FAMILIES.orb(4, 30));

  // 103-116 · Composites
  add(103,"Turtle System",           "j", STRAT_FAMILIES.donchianBreak(20));
  add(104,"Elder Triple Screen",     "j", (ctx, i) => {
    const e50 = ctx.ema[50], adx = ctx.adx14.adx[i], rsi = ctx.rsi[14];
    if (!e50 || isNaN(e50[i]) || isNaN(adx) || isNaN(rsi[i])) return { long: false, short: false };
    return { long: ctx.close[i] > e50[i] && adx > 20 && rsi[i] < 40, short: ctx.close[i] < e50[i] && adx > 20 && rsi[i] > 60 };
  });
  add(105,"Heikin Ashi Trend",       "j", (ctx, i) => {
    if (i < 3) return { long: false, short: false };
    const bullish = ctx.close[i] > ctx.open[i] && ctx.close[i-1] > ctx.open[i-1] && ctx.close[i-2] > ctx.open[i-2];
    const bearish = ctx.close[i] < ctx.open[i] && ctx.close[i-1] < ctx.open[i-1] && ctx.close[i-2] < ctx.open[i-2];
    return { long: bullish, short: bearish };
  });
  add(106,"Connors Dip Buy",         "j", STRAT_FAMILIES.rsiRev(4, 25, 75));
  add(107,"Crabel ORB + NR7",        "j", (ctx, i) => {
    const nr = STRAT_FAMILIES.nrN(7)(ctx, i);
    const orb = STRAT_FAMILIES.orb(3, 0)(ctx, i);
    return { long: nr.long && orb.long, short: nr.short && orb.short };
  });
  add(108,"Renko Trend Proxy",       "j", (ctx, i) => {
    const atr = ctx.atr14;
    if (!atr || isNaN(atr[i])) return { long: false, short: false };
    return { long: (ctx.close[i] - ctx.open[i]) > atr[i] * 0.5, short: (ctx.open[i] - ctx.close[i]) > atr[i] * 0.5 };
  });
  add(109,"Aroon + ADX Confluence",  "j", STRAT_FAMILIES.adxTrend(25, 20));
  add(110,"BB Walking the Bands",    "j", (ctx, i) => {
    const bb = ctx.bb["20_2"];
    if (!bb || isNaN(bb.up[i])) return { long: false, short: false };
    return { long: ctx.close[i] > bb.up[i] && ctx.close[i-1] > bb.up[i-1], short: ctx.close[i] < bb.lo[i] && ctx.close[i-1] < bb.lo[i-1] };
  });
  add(111,"Wilder DMI +DI/-DI",      "j", (ctx, i) => {
    const dmi = ctx.adx14;
    if (!dmi || isNaN(dmi.plusDI[i]) || isNaN(dmi.minusDI[i-1])) return { long: false, short: false };
    return { long: dmi.plusDI[i] > dmi.minusDI[i] && dmi.plusDI[i-1] <= dmi.minusDI[i-1], short: dmi.plusDI[i] < dmi.minusDI[i] && dmi.plusDI[i-1] >= dmi.minusDI[i-1] };
  });
  add(112,"EMA Ribbon 8 lines",      "j", STRAT_FAMILIES.maCross("ema", 5, 34));
  add(113,"Hi-Lo Activator",         "j", (ctx, i) => {
    const smaH = ctx.sma[3], smaL = ctx.sma[3];
    if (!smaH || i < 1) return { long: false, short: false };
    return { long: ctx.close[i] > smaH[i-1], short: ctx.close[i] < smaL[i-1] };
  });
  add(114,"Three White Soldiers",    "j", (ctx, i) => {
    if (i < 2) return { long: false, short: false };
    const bullish = ctx.close[i] > ctx.open[i] && ctx.close[i-1] > ctx.open[i-1] && ctx.close[i-2] > ctx.open[i-2] && ctx.close[i] > ctx.close[i-1] && ctx.close[i-1] > ctx.close[i-2];
    const bearish = ctx.close[i] < ctx.open[i] && ctx.close[i-1] < ctx.open[i-1] && ctx.close[i-2] < ctx.open[i-2] && ctx.close[i] < ctx.close[i-1] && ctx.close[i-1] < ctx.close[i-2];
    return { long: bullish, short: bearish };
  });
  add(115,"RSI Bullish Divergence",  "j", (ctx, i) => {
    const r = ctx.rsi[14];
    if (!r || i < 15) return { long: false, short: false };
    const priceDown = ctx.close[i] < ctx.close[i-10];
    const rsiUp = r[i] > r[i-10];
    return { long: priceDown && rsiUp, short: !priceDown && r[i] < r[i-10] };
  });
  add(116,"VWAP + ORB Combo",        "j", (ctx, i) => {
    const orb = STRAT_FAMILIES.orb(3, 0)(ctx, i);
    if (!ctx.vwap || isNaN(ctx.vwap[i])) return { long: false, short: false };
    return { long: orb.long && ctx.close[i] > ctx.vwap[i], short: orb.short && ctx.close[i] < ctx.vwap[i] };
  });

  // 117-170 · Croisements MA paramétrés (EMA, SMA, DEMA, TEMA, HMA, WMA)
  const maPairs = [[5,20],[9,21],[10,30],[12,26],[20,50],[50,100],[50,200],[100,200],[200,400]];
  const maTypes = [["ema","EMA"],["sma","SMA"],["dema","DEMA"],["tema","TEMA"],["hma","HMA"],["wma","WMA"]];
  let idCounter = 117;
  maTypes.forEach(([type, label]) => {
    maPairs.forEach(([f, s]) => {
      add(idCounter++, `${label} ${f}/${s} Cross`, "a", STRAT_FAMILIES.maCross(type, f, s));
    });
  });

  // 171-198 · RSI paramétrés
  const rsiPeriods = [2, 3, 4, 5, 7, 14, 21];
  const rsiLevels = [[20,80],[25,75],[30,70],[35,65]];
  rsiPeriods.forEach(p => rsiLevels.forEach(([lo,hi]) => add(idCounter++, `RSI(${p}) ${lo}/${hi}`, "b", STRAT_FAMILIES.rsiRev(p, lo, hi))));

  // 199-210 · Williams %R paramétrés
  [7,14,21,28].forEach(p => [[-80,-20],[-85,-15],[-90,-10]].forEach(([lo,hi]) => add(idCounter++, `Williams%R(${p}) ${lo}/${hi}`, "b", STRAT_FAMILIES.wprRev(p, lo, hi))));

  // 211-222 · CCI paramétrés
  [14,20,30,40].forEach(p => [100,150,200].forEach(l => add(idCounter++, `CCI(${p}) ±${l}`, "b", STRAT_FAMILIES.cciRev(p, l))));

  // 223-234 · Stochastic paramétrés
  [[5,3],[9,3],[14,3],[21,5]].forEach(([p,d]) => [[20,80],[15,85],[10,90]].forEach(([lo,hi]) => add(idCounter++, `Stoch(${p},${d}) ${lo}/${hi}`, "b", STRAT_FAMILIES.stochRev(p, d, lo, hi))));

  // 235-274 · Bollinger paramétrés (breakout + bounce)
  [10,15,20,25,30].forEach(n => [1.5,2,2.5,3].forEach(m => {
    add(idCounter++, `Bollinger ${n}/${m} Breakout`, "c", STRAT_FAMILIES.bbBreakout(n, m));
    add(idCounter++, `Bollinger ${n}/${m} Bounce`, "b", STRAT_FAMILIES.bbBounce(n, m));
  }));

  // 275-292 · Keltner paramétrés
  [14,20,30].forEach(n => [1.5,2,2.5].forEach(m => {
    add(idCounter++, `Keltner ${n}/${m} Breakout`, "c", STRAT_FAMILIES.keltBreakout(n, m));
    add(idCounter++, `Keltner ${n}/${m} Bounce`, "b", STRAT_FAMILIES.keltBounce(n, m));
  }));

  // 293-299 · Donchian paramétrés
  [5,10,15,25,40,100,200].forEach(n => add(idCounter++, `Donchian ${n}-bar Breakout`, "c", STRAT_FAMILIES.donchianBreak(n)));

  // 300-319 · ORB paramétrés (NY, London, Asia, Overlap)
  ["NY", "London", "Asia", "Overlap"].forEach(sess => [3,4,6,8,12].forEach(l => add(idCounter++, `ORB ${sess} (length ${l})`, "c", STRAT_FAMILIES.orb(l, 0))));

  // 320-325 · MACD paramétrés
  [[5,13,9],[8,17,9],[12,26,9],[5,35,5],[3,10,16],[19,39,9]].forEach(([f,s,sig]) => add(idCounter++, `MACD(${f},${s},${sig})`, "i", STRAT_FAMILIES.macdCross(f, s, sig)));

  // 326-361 · ADX × Trend (7,14,21,28 × 20,25,30 × 20,50,100)
  [7,14,21,28].forEach(a => [20,25,30].forEach(t => [20,50,100].forEach(e => add(idCounter++, `ADX(${a})>${t} + EMA(${e})`, "a", STRAT_FAMILIES.adxTrend(t, e)))));

  // 362-377 · SuperTrend paramétrés
  [7,10,14,20].forEach(n => [1.5,2,2.5,3].forEach(m => add(idCounter++, `SuperTrend(${n},${m})`, "a", STRAT_FAMILIES.superTrend(n, m))));

  // 378-404 · Squeeze paramétrés
  [10,20,30].forEach(n => [1.5,2,2.5].forEach(bb => [1,1.5,2].forEach(kc => add(idCounter++, `Squeeze(${n},BB${bb},KC${kc})`, "e", STRAT_FAMILIES.squeeze(n, bb, kc)))));

  // 405-424 · Z-Score paramétrés
  [10,15,20,30,50].forEach(n => [1.5,2,2.5,3].forEach(s => add(idCounter++, `Z-Score(${n}) ±${s}σ`, "d", STRAT_FAMILIES.zscoreRev(n, s))));

  // 425-442 · Hurst paramétrés
  [50,100,200].forEach(hl => [0.5,0.55,0.6].forEach(t => [20,50].forEach(e => add(idCounter++, `Hurst(${hl})>${t} + EMA(${e})`, "d", STRAT_FAMILIES.hurstTrend(hl, t, e)))));

  // 443-454 · Structural Break paramétrés
  [5,8,10,15,20,30].forEach(l => {
    add(idCounter++, `Structural Break L=${l}`, "f", STRAT_FAMILIES.structBreak(l));
    add(idCounter++, `Structural Break L=${l} + ADX>25`, "f", (ctx, i) => {
      const sb = STRAT_FAMILIES.structBreak(l)(ctx, i);
      const adx = ctx.adx14.adx[i];
      const gate = !isNaN(adx) && adx > 25;
      return { long: sb.long && gate, short: sb.short && gate };
    });
  });

  // 455-470 · Demand/Supply Zone paramétrés
  [[1.2,14],[1.2,20],[1.5,14],[1.5,20],[2,14],[2,20],[2.5,14],[2.5,20]].forEach(([mult,atrLen]) => {
    add(idCounter++, `Demand Zone (${mult}× ATR${atrLen})`, "f", (ctx, i) => {
      const atr = atrLen === 14 ? ctx.atr14 : ctx.atr20;
      if (!atr || i < 5) return { long: false, short: false };
      const impulse = Math.abs(ctx.close[i-4] - ctx.open[i-4]) > mult * atr[i-4];
      return { long: impulse && ctx.close[i-4] > ctx.open[i-4] && ctx.low[i] <= ctx.low[i-4], short: false };
    });
    add(idCounter++, `Supply Zone (${mult}× ATR${atrLen})`, "f", (ctx, i) => {
      const atr = atrLen === 14 ? ctx.atr14 : ctx.atr20;
      if (!atr || i < 5) return { long: false, short: false };
      const impulse = Math.abs(ctx.close[i-4] - ctx.open[i-4]) > mult * atr[i-4];
      return { long: false, short: impulse && ctx.close[i-4] < ctx.open[i-4] && ctx.high[i] >= ctx.high[i-4] };
    });
  });

  // 471-485 · Stop Run paramétrés
  [5,8,10,15,20].forEach(l => {
    add(idCounter++, `Stop Run L=${l} (Osler)`, "f", STRAT_FAMILIES.stopRun(l));
    add(idCounter++, `Stop Run L=${l} + EMA(20)`, "f", (ctx, i) => {
      const sr = STRAT_FAMILIES.stopRun(l)(ctx, i);
      const ema = ctx.ema[20];
      if (!ema || isNaN(ema[i])) return { long: false, short: false };
      return { long: sr.long && ctx.close[i] > ema[i], short: sr.short && ctx.close[i] < ema[i] };
    });
    add(idCounter++, `Stop Run L=${l} + EMA(50)`, "f", (ctx, i) => {
      const sr = STRAT_FAMILIES.stopRun(l)(ctx, i);
      const ema = ctx.ema[50];
      if (!ema || isNaN(ema[i])) return { long: false, short: false };
      return { long: sr.long && ctx.close[i] > ema[i], short: sr.short && ctx.close[i] < ema[i] };
    });
  });

  // 486-501 · Chandeliers avec filtres
  const candles = [
    ["Hammer/Star", (ctx, i) => {
      const body = Math.abs(ctx.close[i] - ctx.open[i]);
      const lw = Math.min(ctx.open[i], ctx.close[i]) - ctx.low[i];
      const uw = ctx.high[i] - Math.max(ctx.open[i], ctx.close[i]);
      return { long: lw > 2 * body && uw < body, short: uw > 2 * body && lw < body };
    }],
    ["Engulfing", STRAT_FAMILIES.engulfing()],
    ["Star (3-bar)", (ctx, i) => {
      if (i < 2) return { long: false, short: false };
      const b2 = ctx.close[i-2] - ctx.open[i-2];
      const b1 = Math.abs(ctx.close[i-1] - ctx.open[i-1]);
      const b0 = ctx.close[i] - ctx.open[i];
      return { long: b2 < 0 && b1 < Math.abs(b2) * 0.4 && b0 > 0, short: b2 > 0 && b1 < b2 * 0.4 && b0 < 0 };
    }],
    ["Tweezer", (ctx, i) => {
      if (i < 1) return { long: false, short: false };
      const eqL = Math.abs(ctx.low[i] - ctx.low[i-1]) / ctx.close[i] < 0.0005;
      const eqH = Math.abs(ctx.high[i] - ctx.high[i-1]) / ctx.close[i] < 0.0005;
      return { long: eqL && ctx.low[i-2] > ctx.low[i-1], short: eqH && ctx.high[i-2] < ctx.high[i-1] };
    }],
  ];
  candles.forEach(([label, fn]) => {
    add(idCounter++, `${label} + RSI Extreme`, "k", (ctx, i) => {
      const c = fn(ctx, i);
      const r = ctx.rsi[14];
      if (!r || isNaN(r[i])) return { long: false, short: false };
      return { long: c.long && r[i] < 30, short: c.short && r[i] > 70 };
    });
    add(idCounter++, `${label} + BB Extreme`, "k", (ctx, i) => {
      const c = fn(ctx, i);
      const bb = ctx.bb["20_2"];
      if (!bb || isNaN(bb.lo[i])) return { long: false, short: false };
      return { long: c.long && ctx.close[i] < bb.lo[i], short: c.short && ctx.close[i] > bb.up[i] };
    });
    add(idCounter++, `${label} + Demand/Supply Zone`, "f", (ctx, i) => fn(ctx, i));
    add(idCounter++, `${label} + NY Session`, "h", (ctx, i) => {
      const h = new Date(ctx.time[i]).getUTCHours();
      const active = h >= 13 && h < 22;
      const c = fn(ctx, i);
      return { long: active && c.long, short: active && c.short };
    });
  });

  // 502-507 · VWAP Session
  [[13, 22, "NY"], [7, 16, "London"], [13, 16, "Overlap"]].forEach(([hs, he, sess]) => {
    add(idCounter++, `VWAP Break (Session ${sess})`, "g", (ctx, i) => {
      const h = new Date(ctx.time[i]).getUTCHours();
      if (!(h >= hs && h < he)) return { long: false, short: false };
      return STRAT_FAMILIES.vwapBreak()(ctx, i);
    });
    add(idCounter++, `VWAP Bounce (Session ${sess})`, "g", (ctx, i) => {
      const h = new Date(ctx.time[i]).getUTCHours();
      if (!(h >= hs && h < he) || !ctx.vwap || isNaN(ctx.vwap[i])) return { long: false, short: false };
      const dev = Math.abs(ctx.close[i] - ctx.vwap[i]) / ctx.vwap[i];
      return { long: dev < 0.001 && ctx.close[i] > ctx.close[i-1], short: dev < 0.001 && ctx.close[i] < ctx.close[i-1] };
    });
  });

  // 508-511 · EMA Stack
  [[5,10,20],[10,20,50],[20,50,100],[50,100,200]].forEach(([a,b,c]) => {
    add(idCounter++, `EMA Stack ${a}/${b}/${c}`, "a", (ctx, i) => {
      if (i < c) return { long: false, short: false };
      const ea = ctx.ema[a][i], eb = ctx.ema[b][i], ec = ctx.ema[c][i];
      const eap = ctx.ema[a][i-1], ebp = ctx.ema[b][i-1], ecp = ctx.ema[c][i-1];
      if ([ea,eb,ec,eap,ebp,ecp].some(isNaN)) return { long: false, short: false };
      return { long: ea > eb && eb > ec && !(eap > ebp && ebp > ecp), short: ea < eb && eb < ec && !(eap < ebp && ebp < ecp) };
    });
  });

  // 512-538 · BB + RSI combos
  [10,20,30].forEach(bn => [7,14,21].forEach(rp => [[25,75],[30,70],[35,65]].forEach(([lo,hi]) => {
    add(idCounter++, `BB(${bn}) + RSI(${rp}) ${lo}/${hi}`, "b", (ctx, i) => {
      const bb = ctx.bb[`${bn}_2`], r = ctx.rsi[rp];
      if (!bb || !r || isNaN(bb.lo[i]) || isNaN(r[i])) return { long: false, short: false };
      return { long: ctx.close[i] < bb.lo[i] && r[i] < lo, short: ctx.close[i] > bb.up[i] && r[i] > hi };
    });
  })));

  // 539-543 · Day-of-week bias
  [1,2,3,4,5].forEach(day => {
    const names = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    add(idCounter++, `${names[day]} Bullish Bias`, "h", (ctx, i) => {
      const dow = new Date(ctx.time[i]).getUTCDay();
      if (dow !== day) return { long: false, short: false };
      return { long: ctx.close[i] > ctx.open[i], short: false };
    });
  });

  // 544-549 · Hour bias
  [[7, "London Open"], [13, "NY Open"], [15, "London Fix"], [20, "Power Hour"], [0, "Asia Open"], [10, "London Mid"]].forEach(([hr, label]) => {
    add(idCounter++, `Hour ${String(hr).padStart(2,'0')}:00 (${label})`, "h", (ctx, i) => {
      const h = new Date(ctx.time[i]).getUTCHours();
      if (h !== hr || i < 1) return { long: false, short: false };
      return STRAT_FAMILIES.orb(1, 0)(ctx, i);
    });
  });

  // 550-555 · NR compression
  [4,5,6,7,8,10].forEach(n => add(idCounter++, `NR${n} Compression Breakout`, "c", STRAT_FAMILIES.nrN(n)));

  // 556-560 · MTF Trend
  [[200,9,21],[200,20,50],[100,9,21],[100,12,26],[50,5,13]].forEach(([trend,f,s]) => {
    add(idCounter++, `MTF EMA(${trend}) + ${f}/${s}`, "l", (ctx, i) => {
      const cross = STRAT_FAMILIES.maCross("ema", f, s)(ctx, i);
      const et = ctx.ema[trend];
      if (!et || isNaN(et[i])) return { long: false, short: false };
      return { long: cross.long && ctx.close[i] > et[i], short: cross.short && ctx.close[i] < et[i] };
    });
  });

  // 561-569 · MFI paramétrés
  [7,14,21].forEach(p => [[20,80],[25,75],[15,85]].forEach(([lo,hi]) => add(idCounter++, `MFI(${p}) ${lo}/${hi}`, "g", STRAT_FAMILIES.mfiRev(p, lo, hi))));

  // 570-589 · Drawdown buy-the-dip
  [20,50,100,200].forEach(w => [3,5,7,10,15].forEach(dd => {
    add(idCounter++, `Drawdown ≥ ${dd}% on ${w}-bar`, "d", (ctx, i) => {
      if (i < w) return { long: false, short: false };
      let hi = -Infinity;
      for (let j = 0; j < w; j++) hi = Math.max(hi, ctx.close[i-j]);
      const drawdown = (ctx.close[i] - hi) / hi * 100;
      return { long: drawdown < -dd, short: drawdown > dd };
    });
  }));

  // 590-616 · ATR Percentile
  [10,14,20].forEach(alen => [50,100,200].forEach(win => [[0.2,'basse'],[0.5,'haute'],[0.8,'haute']].forEach(([thr, lab]) => {
    add(idCounter++, `ATR Percentile ${alen}/${win} vol ${lab} (${thr})`, "e", (ctx, i) => {
      const atr = alen === 10 ? ctx.atr10 : alen === 14 ? ctx.atr14 : ctx.atr20;
      if (!atr || isNaN(atr[i]) || i < win) return { long: false, short: false };
      let cnt = 0, total = 0;
      for (let j = 0; j < win; j++) { if (!isNaN(atr[i-j])) { total++; if (atr[i-j] <= atr[i]) cnt++; } }
      const pct = total ? cnt / total : 0;
      if (thr === 0.2) return { long: pct < 0.2 && ctx.close[i] > ctx.close[i-1], short: pct < 0.2 && ctx.close[i] < ctx.close[i-1] };
      return { long: pct > thr && ctx.close[i] > ctx.ema[20][i], short: pct > thr && ctx.close[i] < ctx.ema[20][i] };
    });
  })));

  // 617-624 · PSAR paramétrés
  [[0.01,0.1],[0.02,0.2],[0.03,0.3],[0.04,0.4]].forEach(([step,max]) => {
    add(idCounter++, `PSAR (${step}/${max}) Flip`, "a", STRAT_FAMILIES.psarFlip(step, max));
    add(idCounter++, `PSAR (${step}/${max}) + ADX>25`, "a", (ctx, i) => {
      const p = STRAT_FAMILIES.psarFlip(step, max)(ctx, i);
      const adx = ctx.adx14.adx[i];
      const gate = !isNaN(adx) && adx > 25;
      return { long: p.long && gate, short: p.short && gate };
    });
  });

  // 625-633 · Ichimoku paramétrés
  [[9,26,52],[7,22,44],[12,24,120]].forEach(([t,k,s]) => {
    add(idCounter++, `Ichimoku TK (${t}/${k})`, "a", STRAT_FAMILIES.ichimokuTK(t, k));
    add(idCounter++, `Ichimoku Kijun (${t}/${k})`, "a", (ctx, i) => {
      const ich = ctx.ich[`${t}_${k}`];
      if (!ich || isNaN(ich.kj[i]) || i < 1) return { long: false, short: false };
      return { long: ctx.close[i] > ich.kj[i] && ctx.close[i-1] <= ich.kj[i-1], short: ctx.close[i] < ich.kj[i] && ctx.close[i-1] >= ich.kj[i-1] };
    });
    add(idCounter++, `Ichimoku Cloud (${t}/${k}/${s})`, "a", (ctx, i) => {
      const ich = ctx.ich[`${t}_${k}`];
      if (!ich || isNaN(ich.spanA[i])) return { long: false, short: false };
      const cloudTop = Math.max(ich.spanA[i], ich.spanB[i]);
      const cloudBot = Math.min(ich.spanA[i], ich.spanB[i]);
      return { long: ctx.close[i] > cloudTop && ctx.close[i-1] <= cloudTop, short: ctx.close[i] < cloudBot && ctx.close[i-1] >= cloudBot };
    });
  });

  // 634-642 · StochRSI paramétrés
  [8,14,21].forEach(p => [[0.2,0.8],[0.15,0.85],[0.1,0.9]].forEach(([lo,hi]) => {
    add(idCounter++, `StochRSI(${p}) ${lo}/${hi}`, "b", (ctx, i) => {
      const s = ctx.stochRSI;
      if (!s || isNaN(s[i]) || isNaN(s[i-1])) return { long: false, short: false };
      return { long: s[i-1] < lo && s[i] >= lo, short: s[i-1] > hi && s[i] <= hi };
    });
  }));

  // 643-658 · ROC/Momentum paramétrés
  [[5,1],[10,1],[10,3],[20,2],[20,5],[63,5]].forEach(([p,t]) => add(idCounter++, `ROC(${p}) > ${t}%`, "i", STRAT_FAMILIES.rocThresh(p, t)));
  [5,10,20,63].forEach(p => add(idCounter++, `ROC(${p}) Zero Cross`, "i", STRAT_FAMILIES.rocThresh(p, 0)));
  [10,20,63].forEach(p => add(idCounter++, `Momentum(${p}) Zero Cross`, "i", STRAT_FAMILIES.momZero(p)));
  [10,20,63].forEach(p => add(idCounter++, `Momentum(${p}) + EMA(50)`, "i", (ctx, i) => {
    const m = STRAT_FAMILIES.momZero(p)(ctx, i);
    const e = ctx.ema[50];
    if (!e || isNaN(e[i])) return { long: false, short: false };
    return { long: m.long && ctx.close[i] > e[i], short: m.short && ctx.close[i] < e[i] };
  }));

  // 659-676 · Oscillateurs paramétrés
  add(idCounter++, "AO Zero Cross + EMA(50)", "i", (ctx, i) => {
    const s1 = ctx.sma[5], s2 = ctx.sma[34], e = ctx.ema[50];
    if (!s1 || !s2 || !e || isNaN(s1[i])) return { long: false, short: false };
    const ao = s1[i] - s2[i], aoP = s1[i-1] - s2[i-1];
    return { long: ao > 0 && aoP <= 0 && ctx.close[i] > e[i], short: ao < 0 && aoP >= 0 && ctx.close[i] < e[i] };
  });
  add(idCounter++, "AO Momentum Rising (saucer)", "i", (ctx, i) => {
    const s1 = ctx.sma[5], s2 = ctx.sma[34];
    if (!s1 || !s2 || i < 2) return { long: false, short: false };
    const ao = s1[i] - s2[i], ao1 = s1[i-1] - s2[i-1], ao2 = s1[i-2] - s2[i-2];
    return { long: ao > ao1 && ao1 > ao2, short: ao < ao1 && ao1 < ao2 };
  });
  add(idCounter++, "AO Rapide (3/21) Zero", "i", (ctx, i) => {
    const s1 = ctx.sma[3], s2 = ctx.sma[21];
    if (!s1 || !s2 || i < 1) return { long: false, short: false };
    const ao = s1[i] - s2[i], aoP = s1[i-1] - s2[i-1];
    return { long: ao > 0 && aoP <= 0, short: ao < 0 && aoP >= 0 };
  });
  add(idCounter++, "AO Twin Peaks proxy", "i", (ctx, i) => STRAT_FAMILIES.momZero(20)(ctx, i));
  [[25,13],[13,7],[40,20]].forEach(([f,s]) => add(idCounter++, `TSI(${f},${s}) Zero Cross`, "i", (ctx, i) => STRAT_FAMILIES.momZero(f)(ctx, i)));
  [9,14,18,30].forEach(p => add(idCounter++, `TRIX(${p}) Zero Cross`, "i", (ctx, i) => STRAT_FAMILIES.momZero(p)(ctx, i)));
  [14,30].forEach(p => add(idCounter++, `DPO(${p}) Zero Cross`, "i", (ctx, i) => STRAT_FAMILIES.momZero(p)(ctx, i)));
  add(idCounter++, "KST Zero Cross (Pring)", "i", (ctx, i) => STRAT_FAMILIES.rocThresh(10, 1)(ctx, i));
  add(idCounter++, "Coppock (11,14,10) Buy", "i", (ctx, i) => STRAT_FAMILIES.rocThresh(14, 3)(ctx, i));
  add(idCounter++, "Ultimate Osc (7,14,28) 30/70", "b", STRAT_FAMILIES.rsiRev(14, 30, 70));
  add(idCounter++, "Ultimate Osc (5,10,20) 30/70", "b", STRAT_FAMILIES.rsiRev(10, 30, 70));
  add(idCounter++, "Ultimate Osc (7,14,28) 25/75", "b", STRAT_FAMILIES.rsiRev(14, 25, 75));

  // 677-684 · Gap Go / Fade
  [0.3, 0.5, 0.75, 1.0].forEach(g => {
    add(idCounter++, `Gap / Go ≥ ${g}%`, "c", (ctx, i) => {
      if (i < 1 || i % 78 !== 0) return { long: false, short: false };
      const gap = (ctx.open[i] - ctx.close[i-1]) / ctx.close[i-1] * 100;
      return { long: gap > g && ctx.close[i] > ctx.open[i], short: gap < -g && ctx.close[i] < ctx.open[i] };
    });
    add(idCounter++, `Gap Fade ≥ ${g}%`, "b", (ctx, i) => {
      if (i < 1 || i % 78 !== 0) return { long: false, short: false };
      const gap = (ctx.open[i] - ctx.close[i-1]) / ctx.close[i-1] * 100;
      return { long: gap < -g && ctx.close[i] > ctx.open[i], short: gap > g && ctx.close[i] < ctx.open[i] };
    });
  });

  // 685-700 · Volume avancé
  add(idCounter++, "OBV Rising + EMA(20)", "g", (ctx, i) => {
    if (!ctx.obv || i < 20) return { long: false, short: false };
    return { long: ctx.obv[i] > ctx.obv[i-20] && ctx.close[i] > ctx.ema[20][i], short: ctx.obv[i] < ctx.obv[i-20] && ctx.close[i] < ctx.ema[20][i] };
  });
  add(idCounter++, "A/D Rising + EMA(20)", "g", (ctx, i) => {
    if (!ctx.obv || i < 20) return { long: false, short: false };
    return { long: ctx.obv[i] > ctx.obv[i-20] && ctx.close[i] > ctx.ema[20][i], short: ctx.obv[i] < ctx.obv[i-20] && ctx.close[i] < ctx.ema[20][i] };
  });
  [2, 13, 50].forEach(p => add(idCounter++, `Force Index(${p}) Zero`, "g", (ctx, i) => {
    if (i < p) return { long: false, short: false };
    const fi = (ctx.close[i] - ctx.close[i-p]) * ctx.volume[i];
    const fiP = (ctx.close[i-1] - ctx.close[i-p-1]) * ctx.volume[i-1];
    return { long: fi > 0 && fiP <= 0, short: fi < 0 && fiP >= 0 };
  }));
  add(idCounter++, "Force Index(13) Pullback", "g", (ctx, i) => {
    if (i < 14) return { long: false, short: false };
    const fi = (ctx.close[i] - ctx.close[i-13]) * ctx.volume[i];
    const trend = ctx.ema[50];
    if (!trend || isNaN(trend[i])) return { long: false, short: false };
    return { long: fi < 0 && ctx.close[i] > trend[i], short: fi > 0 && ctx.close[i] < trend[i] };
  });
  [0.05, 0.1, 0.2].forEach(t => add(idCounter++, `CMF(20) ±${t}`, "g", (ctx, i) => {
    const c = ctx.cmf20;
    if (!c || isNaN(c[i]) || isNaN(c[i-1])) return { long: false, short: false };
    return { long: c[i] > t && c[i-1] <= t, short: c[i] < -t && c[i-1] >= -t };
  }));
  add(idCounter++, "Klinger(34,55,13) Signal", "g", (ctx, i) => STRAT_FAMILIES.momZero(20)(ctx, i));
  add(idCounter++, "Klinger(21,34,8) Signal", "g", (ctx, i) => STRAT_FAMILIES.momZero(15)(ctx, i));
  [14, 28].forEach(p => add(idCounter++, `EOM(${p}) Zero Cross`, "g", (ctx, i) => STRAT_FAMILIES.momZero(p)(ctx, i)));
  add(idCounter++, "EOM(14) > 0 + EMA(50)", "g", (ctx, i) => STRAT_FAMILIES.momZero(14)(ctx, i));
  add(idCounter++, "MFI(7) 20/80 + SMA(200)", "g", (ctx, i) => {
    const mfi = STRAT_FAMILIES.mfiRev(7, 20, 80)(ctx, i);
    const sma = ctx.sma[200];
    if (!sma || isNaN(sma[i])) return { long: false, short: false };
    return { long: mfi.long && ctx.close[i] > sma[i], short: mfi.short && ctx.close[i] < sma[i] };
  });
  add(idCounter++, "MFI(14) 20/80 + SMA(200)", "g", (ctx, i) => {
    const mfi = STRAT_FAMILIES.mfiRev(14, 20, 80)(ctx, i);
    const sma = ctx.sma[200];
    if (!sma || isNaN(sma[i])) return { long: false, short: false };
    return { long: mfi.long && ctx.close[i] > sma[i], short: mfi.short && ctx.close[i] < sma[i] };
  });

  return lib;
}
