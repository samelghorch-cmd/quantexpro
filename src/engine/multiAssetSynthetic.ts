// @ts-nocheck — migration bulk P10-TS-ENGINE; typage strict à reprendre fichier par fichier.
// Panier synthétique multi-marché — génère plusieurs séries corrélées à partir de facteurs communs,
// pour alimenter Correlations, Macro Map, Regime Clock, Pairs Trading (données SIMULÉES, jamais réelles).
import { seededRandom } from "./random.ts";

export const SYNTH_ASSETS = [
  { sym: "SYN-EQ1", name: "Actions large cap", startPrice: 4500, beta: 1.0 },
  { sym: "SYN-EQ2", name: "Actions tech", startPrice: 15000, beta: 1.3 },
  { sym: "SYN-EQ3", name: "Small caps", startPrice: 2000, beta: 1.1 },
  { sym: "SYN-GOLD", name: "Or synthétique", startPrice: 2000, beta: -0.4 },
  { sym: "SYN-OIL", name: "Pétrole synthétique", startPrice: 75, beta: 0.5 },
  { sym: "SYN-FX1", name: "Devise majeure A", startPrice: 1.08, beta: -0.2 },
  { sym: "SYN-FX2", name: "Devise majeure B", startPrice: 1.26, beta: -0.15 },
  { sym: "SYN-BOND", name: "Obligations", startPrice: 100, beta: -0.6 },
  { sym: "SYN-CRYPTO", name: "Crypto synthétique", startPrice: 60000, beta: 1.8 },
];

// Génère nBars pour chaque actif : rendement = beta·facteur_marché + idiosyncratique.
export function generateBasket(nBars = 500, seed = 42) {
  const rndM = seededRandom(seed);
  const market = [];
  for (let i = 0; i < nBars; i++) market.push((rndM() - 0.5) * 0.02);

  const series = {};
  SYNTH_ASSETS.forEach((a, ai) => {
    const rnd = seededRandom(seed + ai * 101 + 1);
    const bars = [];
    let price = a.startPrice;
    const startTs = Date.UTC(2026, 0, 1, 13, 30, 0);
    for (let i = 0; i < nBars; i++) {
      const idio = (rnd() - 0.5) * 0.015;
      const ret = a.beta * market[i] + idio;
      const o = price; price = price * (1 + ret); const c = price;
      const h = Math.max(o, c) * (1 + rnd() * 0.004);
      const l = Math.min(o, c) * (1 - rnd() * 0.004);
      bars.push({ t: startTs + i * 5 * 60000, o, h, l, c, v: Math.floor(500 + rnd() * 800) });
    }
    series[a.sym] = bars;
  });
  return { series, market, assets: SYNTH_ASSETS };
}

// Matrice de corrélation des rendements entre actifs du panier.
export function basketCorrelation(basket) {
  const syms = Object.keys(basket.series);
  const rets = syms.map((s) => {
    const b = basket.series[s];
    const r = [];
    for (let i = 1; i < b.length; i++) r.push((b[i].c - b[i - 1].c) / b[i - 1].c);
    return r;
  });
  const corr = (a, b) => {
    const n = Math.min(a.length, b.length);
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return num / (Math.sqrt(da * db) || 1e-10);
  };
  const mat = syms.map((_, i) => syms.map((_, j) => (i === j ? 1 : corr(rets[i], rets[j]))));
  return { matrix: mat, labels: syms };
}
