// Fixtures de test — données synthétiques 100% reproductibles (PRNG seedé, aucune
// fonction Math transcendante → bit-à-bit identique sur toute plateforme IEEE-754).
// Chaque générateur retourne des barres { o, h, l, c, v, t } au format du moteur.
import { seededRandom } from "../../src/engine/random.ts";

export const DAY_MS = 24 * 3600 * 1000;
export const HOUR_MS = 3600 * 1000;

// Époque de départ fixe (2024-01-01 UTC) — jamais Date.now() dans un test.
export const T0 = 1704067200000;

// Marche aléatoire additive : drift et vol en points par barre.
// N'utilise que + * / abs → déterminisme total inter-plateformes.
export function makeBars({ n = 500, start = 5000, drift = 0, vol = 10, seed = 42, dtMs = DAY_MS, t0 = T0 } = {}) {
  const rnd = seededRandom(seed);
  const bars = [];
  let prev = start;
  for (let i = 0; i < n; i++) {
    const shock = (rnd() * 2 - 1) * vol;      // uniforme [-vol, +vol]
    const c = Math.max(1e-6, prev + drift + shock);
    const o = prev;
    const wick = rnd() * vol * 0.5;
    const h = Math.max(o, c) + wick;
    const l = Math.max(1e-6, Math.min(o, c) - wick);
    const v = 1000 + Math.floor(rnd() * 500);
    bars.push({ o, h, l, c, v, t: t0 + i * dtMs });
    prev = c;
  }
  return bars;
}

// --- Régimes de marché (exigence due diligence : le moteur doit être testé
// sur bull, bear, range, gaps et flash crash, pas seulement sur un régime favorable) ---
export const REGIMES = {
  bull:  (n = 500) => makeBars({ n, drift: +3, vol: 8, seed: 101 }),
  bear:  (n = 500) => makeBars({ n, drift: -3, vol: 8, seed: 202 }),
  range: (n = 500) => makeRangeBars({ n, seed: 303 }),
  gap:   (n = 500) => makeGapBars({ n, seed: 404 }),
  flashCrash: (n = 500) => makeFlashCrashBars({ n, seed: 505 }),
};

// Range : rappel vers une moyenne (mean reversion) sans drift.
export function makeRangeBars({ n = 500, center = 5000, k = 0.1, vol = 12, seed = 7, dtMs = DAY_MS } = {}) {
  const rnd = seededRandom(seed);
  const bars = [];
  let prev = center;
  for (let i = 0; i < n; i++) {
    const shock = (rnd() * 2 - 1) * vol;
    const c = Math.max(1e-6, prev + k * (center - prev) + shock);
    const o = prev;
    const wick = rnd() * vol * 0.5;
    bars.push({ o, h: Math.max(o, c) + wick, l: Math.max(1e-6, Math.min(o, c) - wick), c, v: 1200, t: T0 + i * dtMs });
    prev = c;
  }
  return bars;
}

// Gaps : toutes les 20 barres, saut d'ouverture de ±2% (simule les gaps overnight / week-end).
export function makeGapBars({ n = 500, seed = 9, dtMs = DAY_MS } = {}) {
  const rnd = seededRandom(seed);
  const base = makeBars({ n, drift: 0.5, vol: 8, seed, dtMs });
  let offset = 0;
  return base.map((b, i) => {
    if (i > 0 && i % 20 === 0) offset += (rnd() * 2 - 1) * b.c * 0.02;
    const shift = (x) => Math.max(1e-6, x + offset);
    return { ...b, o: shift(b.o), h: shift(b.h), l: shift(b.l), c: shift(b.c) };
  });
}

// Flash crash : -15% en une barre à mi-parcours, récupération partielle ensuite.
export function makeFlashCrashBars({ n = 500, seed = 11, dtMs = DAY_MS } = {}) {
  const base = makeBars({ n, drift: 1, vol: 6, seed, dtMs });
  const crashAt = Math.floor(n / 2);
  let offset = 0;
  return base.map((b, i) => {
    if (i === crashAt) offset = -b.c * 0.15;          // le crash
    if (i > crashAt && offset < 0) offset += b.c * 0.15 / 50; // récupération sur ~50 barres
    const shift = (x) => Math.max(1e-6, x + Math.min(0, offset));
    const out = { ...b, o: shift(b.o), h: shift(b.h), l: shift(b.l), c: shift(b.c) };
    if (i === crashAt) out.l = Math.max(1e-6, out.l - b.c * 0.02); // mèche de panique
    return out;
  });
}

// Contexte minimal : le moteur n'exige que ctx.atr14 (les stratégies de test
// lisent bars/ctx.close). ATR constant → maths de stop exactes dans les assertions.
export function minimalCtx(bars, atr = 20) {
  return { close: bars.map((b) => b.c), atr14: bars.map(() => atr) };
}

// --- Stratégies de test déterministes ---

// Ne trade jamais (edge case : zéro trade).
export const neverTrade = () => ({ long: false, short: false });

// Toujours long (edge case : une seule position jamais fermée).
export const alwaysLong = () => ({ long: true, short: false });

// Croisement SMA rapide/lente calculé de façon strictement causale (fenêtre ≤ i).
export function smaCross(fast = 10, slow = 30) {
  const sma = (close, i, p) => {
    if (i < p - 1) return NaN;
    let s = 0;
    for (let j = 0; j < p; j++) s += close[i - j];
    return s / p;
  };
  return (ctx, i) => {
    const f = sma(ctx.close, i, fast);
    const s = sma(ctx.close, i, slow);
    if (isNaN(f) || isNaN(s)) return { long: false, short: false };
    return { long: f > s, short: f < s };
  };
}

// Alterne long/short toutes les `period` barres → beaucoup d'allers-retours.
export function alternating(period = 10) {
  return (ctx, i) => {
    const phase = Math.floor(i / period) % 2;
    return { long: phase === 0, short: phase === 1 };
  };
}

// Un seul aller-retour : long à openAt, signal inverse à closeAt.
export function singleRoundTrip(openAt = 50, closeAt = 60) {
  return (ctx, i) => ({ long: i === openAt, short: i === closeAt });
}

// TRICHEUR : lit la barre i+1 (look-ahead volontaire) — sert à démontrer
// que le garde-fou de causalité détecte bien la fraude.
export function lookaheadCheat() {
  return (ctx, i) => {
    const next = ctx.close[i + 1];
    if (next === undefined) return { long: false, short: false };
    return { long: next > ctx.close[i], short: next < ctx.close[i] };
  };
}

// --- Garde-fou de causalité (barrière temporelle stricte) ---
// Enveloppe un ctx dans des Proxy récursifs : tout accès à un indice > i courant
// est enregistré comme violation. C'est LE test anti look-ahead au niveau moteur.
export function makeCausalityGuard(ctx) {
  const violations = [];
  let currentI = -1;
  const wrap = (obj, path) => {
    if (Array.isArray(obj)) {
      return new Proxy(obj, {
        get(target, prop) {
          const idx = typeof prop === "string" ? Number(prop) : NaN;
          if (Number.isInteger(idx) && currentI >= 0 && idx > currentI) {
            violations.push({ path, index: idx, currentI });
          }
          return target[prop];
        },
      });
    }
    if (obj && typeof obj === "object") {
      const cache = new Map();
      return new Proxy(obj, {
        get(target, prop) {
          const v = target[prop];
          if (v && typeof v === "object") {
            if (!cache.has(prop)) cache.set(prop, wrap(v, `${path}.${String(prop)}`));
            return cache.get(prop);
          }
          return v;
        },
      });
    }
    return obj;
  };
  const guarded = wrap(ctx, "ctx");
  return {
    guarded,
    violations,
    // Enveloppe une stratégie pour que le garde connaisse la barre courante.
    wrapStrategy: (strategyEval) => (c, i) => { currentI = i; const s = strategyEval(c, i); currentI = -1; return s; },
  };
}

// Coût aller-retour exact du moteur pour un contrat donné (formule dupliquée
// volontairement depuis backtest.js : si le moteur change, le test doit casser).
export function roundTripCost(spec, contracts = 1) {
  return 2 * (spec.commission * contracts + spec.slippage * spec.tick * spec.pv * contracts);
}
