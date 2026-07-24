// @ts-nocheck — migration bulk P10-TS-ENGINE; typage strict à reprendre fichier par fichier.
// Synthetic Validator — 3 gates statistiques : Block Bootstrap, GBM, Surrogate.
// Verdict GO / WARN / NO-GO selon p-values (p<0.05 GO, p<0.10 WARN).
import { seededRandom } from "./random.ts";
import { buildContext } from "./context.ts";
import { runBacktestExt } from "./backtestExtended.ts";

// p-value = fraction des chemins synthétiques dont la perf ≥ perf observée (test unilatéral).
function pValue(observed, synthetic) {
  const ge = synthetic.filter((s) => s >= observed).length;
  return (ge + 1) / (synthetic.length + 1);
}

// Gate 1 — Block Bootstrap sur les PnL des trades (préserve l'autocorrélation locale).
function blockBootstrap(pnls, nPaths, rnd) {
  const n = pnls.length;
  const block = Math.max(2, Math.floor(Math.sqrt(n)));
  const finals = [];
  for (let p = 0; p < nPaths; p++) {
    let sum = 0, count = 0;
    while (count < n) {
      const start = Math.floor(rnd() * n);
      for (let b = 0; b < block && count < n; b++) { sum += pnls[(start + b) % n]; count++; }
    }
    finals.push(sum);
  }
  return finals;
}

// Gate 2 — GBM : calibre μ/σ sur les rendements par barre, génère des prix, rejoue la stratégie.
function gbmPaths(bars, ctx, strategy, params, nPaths, rnd) {
  const closes = bars.map((b) => b.c);
  const rets = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mu = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / rets.length);
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const finals = [];
  const nBars = Math.min(bars.length, 600); // limite perf
  for (let p = 0; p < nPaths; p++) {
    const synth = [];
    let price = closes[0];
    const startTs = bars[0].t;
    for (let i = 0; i < nBars; i++) {
      price = price * Math.exp(mu + sd * gauss());
      const o = price * (1 - Math.abs(sd) * 0.3), c = price;
      const h = Math.max(o, c) * (1 + Math.abs(sd) * 0.5), l = Math.min(o, c) * (1 - Math.abs(sd) * 0.5);
      synth.push({ t: startTs + i * 5 * 60000, o, h, l, c, v: 800 });
    }
    const sctx = buildContext(synth);
    const r = runBacktestExt(synth, sctx, strategy.eval, params);
    finals.push(r.totalPnL);
  }
  return finals;
}

// Gate 3 — Surrogate : shuffle par blocs des rendements pour casser la structure temporelle.
function surrogatePaths(bars, ctx, strategy, params, nPaths, rnd) {
  const closes = bars.map((b) => b.c);
  const rets = [];
  for (let i = 1; i < closes.length; i++) rets.push(closes[i] / closes[i - 1]);
  const finals = [];
  const block = Math.max(2, Math.floor(Math.sqrt(rets.length)));
  const nBars = Math.min(bars.length, 600);
  for (let p = 0; p < nPaths; p++) {
    const shuffled = [];
    while (shuffled.length < rets.length) {
      const start = Math.floor(rnd() * rets.length);
      for (let b = 0; b < block && shuffled.length < rets.length; b++) shuffled.push(rets[(start + b) % rets.length]);
    }
    const synth = [];
    let price = closes[0];
    const startTs = bars[0].t;
    for (let i = 0; i < Math.min(nBars, shuffled.length); i++) {
      const o = price; price = price * shuffled[i]; const c = price;
      const h = Math.max(o, c) * 1.001, l = Math.min(o, c) * 0.999;
      synth.push({ t: startTs + i * 5 * 60000, o, h, l, c, v: 800 });
    }
    const sctx = buildContext(synth);
    const r = runBacktestExt(synth, sctx, strategy.eval, params);
    finals.push(r.totalPnL);
  }
  return finals;
}

export function runValidator(bars, ctx, strategy, params, observedPnL, options = {}) {
  const { nPaths = 300, seed = 99 } = options;
  const rnd = seededRandom(seed);
  const pnls = params.__pnls || [];

  const bootFinals = blockBootstrap(pnls.length ? pnls : [observedPnL], Math.min(nPaths, 1000), rnd);
  const gbmFinals = gbmPaths(bars, ctx, strategy, params, Math.min(nPaths, 300), rnd);
  const surrFinals = surrogatePaths(bars, ctx, strategy, params, Math.min(nPaths, 300), rnd);

  // Pour bootstrap, l'observé = somme réelle (déjà = observedPnL) → on teste contre médiane nulle
  const gates = [
    { name: "Block Bootstrap", p: pValue(observedPnL, bootFinals.map((f) => f - median(bootFinals) + 0)), synthetic: bootFinals },
    { name: "GBM", p: pValue(observedPnL, gbmFinals), synthetic: gbmFinals },
    { name: "Surrogate", p: pValue(observedPnL, surrFinals), synthetic: surrFinals },
  ];

  const verdicts = gates.map((g) => (g.p < 0.05 ? "GO" : g.p < 0.10 ? "WARN" : "NO-GO"));
  let verdict = "GO";
  if (verdicts.includes("NO-GO")) verdict = "NO-GO";
  else if (verdicts.includes("WARN")) verdict = "WARN";

  return { gates: gates.map((g, i) => ({ ...g, verdict: verdicts[i] })), verdict, nPaths, observedPnL };
}

function median(arr) { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
