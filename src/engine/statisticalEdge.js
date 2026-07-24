// Statistical Edge Module 1 — grille de 10 métriques sur indicateurs (P1-EDGE).
// Évalue la qualité statistique d'un indicateur sur fenêtre glissante N vs rendement futur t+k.
import { IND } from "./indicators.js";

/** Catalogue d'indicateurs par défaut (séries depuis le contexte moteur). */
export function defaultIndicatorSeries(ctx) {
  if (!ctx) return {};
  return {
    "RSI 14": ctx.rsi?.[14],
    "RSI 2": ctx.rsi?.[2],
    "ADX 14": ctx.adx14?.adx,
    "ATR 14": ctx.atr14,
    "MACD hist": ctx.macd?.["12_26_9"]?.hist,
    "CCI 20": ctx.cci?.[20],
    "Z-Score 20": ctx.z?.[20],
    "Hurst 100": ctx.hurst100,
    "CMF 20": ctx.cmf20,
    "MFI 14": ctx.mfi?.[14],
    "ROC 10": ctx.roc?.[10],
    "StochRSI": ctx.stochRSI,
    "Williams%R 14": ctx.wpr?.[14],
    "Skew 20": ctx.skew20,
  };
}

function finitePairs(a, b) {
  const out = [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) out.push([a[i], b[i]]);
  }
  return out;
}

export function pearson(x, y) {
  const pairs = Array.isArray(x[0]) ? x : finitePairs(x, y);
  if (pairs.length < 10) return NaN;
  let mx = 0, my = 0;
  for (const [a, b] of pairs) { mx += a; my += b; }
  mx /= pairs.length; my /= pairs.length;
  let num = 0, dx = 0, dy = 0;
  for (const [a, b] of pairs) {
    num += (a - mx) * (b - my);
    dx += (a - mx) ** 2;
    dy += (b - my) ** 2;
  }
  return num / (Math.sqrt(dx * dy) || 1e-12);
}

export function spearman(x, y) {
  const pairs = finitePairs(x, y);
  if (pairs.length < 10) return NaN;
  const rank = (vals) => {
    const idx = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = Array(vals.length);
    idx.forEach(([, i], k) => { r[i] = k; });
    return r;
  };
  const rx = rank(pairs.map((p) => p[0]));
  const ry = rank(pairs.map((p) => p[1]));
  return pearson(rx, ry);
}

/** Autocorrélation lag-1 ; Noise = 1 − |ρ|. */
export function noiseLevel(series) {
  const x = series.filter(Number.isFinite);
  if (x.length < 20) return NaN;
  const a = x.slice(0, -1);
  const b = x.slice(1);
  const rho = pearson(a, b);
  if (!Number.isFinite(rho)) return NaN;
  return 1 - Math.abs(rho);
}

/** Fréquence de croisements de zéro (ou seuil) pour 100 barres. */
export function crossoverRate(series, threshold = 0) {
  const x = [];
  for (const v of series) if (Number.isFinite(v)) x.push(v);
  if (x.length < 5) return NaN;
  let crosses = 0;
  for (let i = 1; i < x.length; i++) {
    const a = x[i - 1] - threshold;
    const b = x[i] - threshold;
    if ((a <= 0 && b > 0) || (a >= 0 && b < 0)) crosses++;
  }
  return (crosses / x.length) * 100;
}

function predictSign(value, name) {
  if (/rsi/i.test(name) && !/stoch/i.test(name)) return Math.sign(value - 50);
  if (/williams|%r/i.test(name)) return Math.sign(value + 50); // W%R typiquement -100..0
  if (/mfi/i.test(name)) return Math.sign(value - 50);
  return Math.sign(value);
}

/** Hit rate directionnel vs signe du rendement futur. */
export function hitRate(series, fwdRet, name) {
  let ok = 0, n = 0;
  const len = Math.min(series.length, fwdRet.length);
  for (let i = 0; i < len; i++) {
    if (!Number.isFinite(series[i]) || !Number.isFinite(fwdRet[i]) || fwdRet[i] === 0) continue;
    const pred = predictSign(series[i], name);
    if (pred === 0) continue;
    n++;
    if (Math.sign(fwdRet[i]) === pred) ok++;
  }
  if (n < 10) return { hit: NaN, n: 0 };
  return { hit: ok / n, n };
}

/** Lag optimal = horizon k∈[1..maxLag] maximisant |IC Spearman|. */
export function bestLag(series, closes, maxLag = 10) {
  let bestK = 1;
  let bestAbs = -1;
  let bestIc = NaN;
  for (let k = 1; k <= maxLag; k++) {
    const fwd = forwardReturns(closes, k);
    const ic = spearman(series, fwd);
    const a = Math.abs(ic);
    if (Number.isFinite(a) && a > bestAbs) {
      bestAbs = a;
      bestK = k;
      bestIc = ic;
    }
  }
  return { lag: bestK, icAtLag: bestIc };
}

export function forwardReturns(closes, horizon) {
  const n = closes.length;
  const out = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (i + horizon < n && closes[i] > 0) {
      out[i] = (closes[i + horizon] - closes[i]) / closes[i];
    }
  }
  return out;
}

export function zScoreAndPercentile(series) {
  const vals = series.filter(Number.isFinite);
  if (vals.length < 5) return { zScore: NaN, percentile: NaN, last: NaN };
  const last = vals[vals.length - 1];
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1e-12;
  const zScore = (last - mean) / sd;
  const below = vals.filter((v) => v <= last).length;
  const percentile = below / vals.length;
  return { zScore, percentile, last };
}

/**
 * Évalue un indicateur (série alignée aux barres).
 * @returns {object} les 10 métriques + score composite
 */
export function evaluateIndicator(name, series, bars, { horizon = 5, window = null } = {}) {
  const closes = bars.map((b) => b.c);
  const nBars = bars.length;
  const start = window != null ? Math.max(0, nBars - window) : 0;
  const slice = (arr) => arr.slice(start);
  const s = slice(series || []);
  const c = slice(closes);
  const fwd = forwardReturns(c, horizon);
  const priceLevel = c.map((v, i) => (i > 0 && c[i - 1] ? (v - c[i - 1]) / c[i - 1] : NaN));

  const noise = noiseLevel(s);
  // Persistence = dernier Hurst sur la série d'indicateur (fenêtre min 40)
  const hurstArr = IND.hurst(s.map((v) => (Number.isFinite(v) ? v : 0)), Math.min(100, Math.max(40, Math.floor(s.length / 3))));
  let persist = NaN;
  for (let i = hurstArr.length - 1; i >= 0; i--) {
    if (Number.isFinite(hurstArr[i])) { persist = hurstArr[i]; break; }
  }
  const crosses = crossoverRate(s, /rsi|mfi/i.test(name) ? 50 : 0);
  const corrRet = pearson(s, fwd);
  const corrPrice = pearson(s, priceLevel);
  const { lag, icAtLag } = bestLag(s, c, Math.max(horizon, 10));
  const ic = spearman(s, fwd);
  const { hit, n: hitN } = hitRate(s, fwd, name);
  const edgeNet = Number.isFinite(hit) ? hit - 0.5 : NaN;
  const n = s.filter(Number.isFinite).length;
  const { zScore, percentile, last } = zScoreAndPercentile(s);

  // Score 0–100 : favorise IC fort, edge net, faible bruit, persist ≠ 0.5
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const score =
    100 * (
      0.30 * clamp(Math.abs(ic || 0) / 0.15, 0, 1)
      + 0.25 * clamp(Math.abs(edgeNet || 0) / 0.1, 0, 1)
      + 0.15 * clamp(1 - (noise || 1), 0, 1)
      + 0.15 * clamp(Math.abs((persist || 0.5) - 0.5) / 0.2, 0, 1)
      + 0.15 * clamp(Math.abs(corrRet || 0) / 0.2, 0, 1)
    );

  return {
    name,
    noise,
    persist,
    crossovers: crosses,
    corrPrice,
    corrRet,
    lag,
    ic,
    icAtLag,
    hit: hit != null && Number.isFinite(hit) ? hit * 100 : NaN,
    edgeNet: edgeNet != null && Number.isFinite(edgeNet) ? edgeNet * 100 : NaN,
    n,
    hitN,
    zScore,
    percentile: percentile != null && Number.isFinite(percentile) ? percentile * 100 : NaN,
    last,
    score,
    horizon,
  };
}

/**
 * Lance Statistical Edge sur le catalogue d'indicateurs.
 */
export function runStatisticalEdge(bars, ctx, opts = {}) {
  const horizon = opts.horizon ?? 5;
  const window = opts.window ?? null;
  const catalog = opts.indicators || defaultIndicatorSeries(ctx);
  const rows = [];
  for (const [name, series] of Object.entries(catalog)) {
    if (!series || !series.length) continue;
    rows.push(evaluateIndicator(name, series, bars, { horizon, window }));
  }
  rows.sort((a, b) => (b.score || 0) - (a.score || 0));
  return {
    rows,
    horizon,
    window: window || bars.length,
    nIndicators: rows.length,
    generatedAt: Date.now(),
  };
}

/** CSV de la grille métriques (10 colonnes + score). */
export function metricsToCSV(rows) {
  const header = [
    "name", "noise", "persist", "crossovers", "corr_price", "corr_ret",
    "lag", "ic", "hit_pct", "edge_net_pct", "n", "z_score", "percentile", "score",
  ].join(",");
  const lines = (rows || []).map((r) => [
    JSON.stringify(r.name),
    num(r.noise), num(r.persist), num(r.crossovers),
    num(r.corrPrice), num(r.corrRet),
    r.lag ?? "",
    num(r.ic), num(r.hit), num(r.edgeNet),
    r.n ?? "",
    num(r.zScore), num(r.percentile), num(r.score),
  ].join(","));
  return [header, ...lines].join("\n");
}

/** CSV séries alignées (timestamp + indicateurs sélectionnés). */
export function seriesToCSV(bars, catalog, names = null) {
  const keys = names || Object.keys(catalog || {});
  const header = ["t", "close", ...keys.map((k) => JSON.stringify(k))].join(",");
  const lines = [];
  for (let i = 0; i < bars.length; i++) {
    const row = [bars[i].t, bars[i].c];
    for (const k of keys) {
      const v = catalog[k]?.[i];
      row.push(Number.isFinite(v) ? v : "");
    }
    lines.push(row.join(","));
  }
  return [header, ...lines].join("\n");
}

function num(v, d = 6) {
  if (v == null || !Number.isFinite(Number(v))) return "";
  return Number(v).toFixed(d);
}
