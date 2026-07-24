// @ts-nocheck — migration bulk P10-TS-ENGINE; typage strict à reprendre fichier par fichier.
// Extrait de v4core.js — Monte Carlo par permutation des trades.
import { seededRandom } from "./random.ts";

export function monteCarlo(trades, initial, nSims = 500) {
  if (!trades || trades.length === 0) return { curves: [], stats: null };
  const pnls = trades.map(t => t.pnl);
  const curves = [];
  const finals = [];
  const maxDDs = [];
  const rnd = seededRandom(12345);
  for (let s = 0; s < nSims; s++) {
    const shuffled = [...pnls];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    let eq = initial, peak = initial, dd = 0;
    const curve = [initial];
    for (const p of shuffled) {
      eq += p;
      curve.push(eq);
      if (eq > peak) peak = eq;
      const d = (peak - eq) / peak;
      if (d > dd) dd = d;
    }
    curves.push(curve);
    finals.push(eq);
    maxDDs.push(dd);
  }
  finals.sort((a, b) => a - b);
  maxDDs.sort((a, b) => a - b);
  const pct = (arr, p) => arr[Math.floor(arr.length * p)];
  return {
    curves,
    stats: {
      p05: pct(finals, 0.05), p50: pct(finals, 0.5), p95: pct(finals, 0.95),
      mean: finals.reduce((a, b) => a + b, 0) / finals.length,
      ddP50: pct(maxDDs, 0.5), ddP95: pct(maxDDs, 0.95),
      probLoss: finals.filter(f => f < initial).length / finals.length,
    },
  };
}
