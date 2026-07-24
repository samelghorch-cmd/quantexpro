// @ts-nocheck — migration bulk P10-TS-ENGINE; typage strict à reprendre fichier par fichier.
// Extrait de v4core.js — analyse des trades + matrice de corrélation.
import { runBacktest } from "./backtest.ts";

export function analyzeTrades(trades, bars) {
  if (!trades || trades.length === 0) return null;
  const byHour = Array(24).fill(null).map(() => ({ n: 0, pnl: 0, wins: 0 }));
  const byDow = Array(7).fill(null).map(() => ({ n: 0, pnl: 0, wins: 0 }));
  const bySession = { asia: { n: 0, pnl: 0 }, london: { n: 0, pnl: 0 }, ny: { n: 0, pnl: 0 }, overlap: { n: 0, pnl: 0 } };
  let curStreak = 0, maxWinStreak = 0, maxLossStreak = 0;
  const pnls = trades.map(t => t.pnl);
  trades.forEach(t => {
    const d = new Date(t.entryTime);
    const h = d.getUTCHours(), dow = d.getUTCDay();
    byHour[h].n++; byHour[h].pnl += t.pnl; if (t.pnl > 0) byHour[h].wins++;
    byDow[dow].n++; byDow[dow].pnl += t.pnl; if (t.pnl > 0) byDow[dow].wins++;
    let sess = "asia";
    if (h >= 7 && h < 13) sess = "london";
    else if (h >= 13 && h < 16) sess = "overlap";
    else if (h >= 16 && h < 22) sess = "ny";
    bySession[sess].n++; bySession[sess].pnl += t.pnl;
    if (t.pnl > 0) { curStreak = curStreak >= 0 ? curStreak + 1 : 1; maxWinStreak = Math.max(maxWinStreak, curStreak); }
    else { curStreak = curStreak <= 0 ? curStreak - 1 : -1; maxLossStreak = Math.max(maxLossStreak, -curStreak); }
  });
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const variance = pnls.reduce((a, b) => a + (b - mean) ** 2, 0) / pnls.length;
  const stdDev = Math.sqrt(variance);
  const sorted = [...pnls].sort((a, b) => a - b);
  const var95 = sorted[Math.floor(sorted.length * 0.05)] || 0;
  const cvar95 = sorted.slice(0, Math.floor(sorted.length * 0.05) + 1).reduce((a, b) => a + b, 0) / (Math.floor(sorted.length * 0.05) + 1);
  return { byHour, byDow, bySession, maxWinStreak, maxLossStreak, mean, stdDev, var95, cvar95, best: Math.max(...pnls), worst: Math.min(...pnls) };
}

export function strategiesCorrelation(bars, ctx, strategies, options) {
  const rets = strategies.map(s => {
    const bt = runBacktest(bars, ctx, s.eval, options);
    return bt.equityCurve.map((e, i) => i === 0 ? 0 : e - bt.equityCurve[i - 1]);
  });
  const n = rets.length;
  const mat = Array(n).fill(null).map(() => Array(n).fill(0));
  const corr = (a, b) => {
    const len = Math.min(a.length, b.length);
    let ma = 0, mb = 0;
    for (let i = 0; i < len; i++) { ma += a[i]; mb += b[i]; }
    ma /= len; mb /= len;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < len; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return num / (Math.sqrt(da * db) || 1e-10);
  };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) mat[i][j] = i === j ? 1 : corr(rets[i], rets[j]);
  return mat;
}
