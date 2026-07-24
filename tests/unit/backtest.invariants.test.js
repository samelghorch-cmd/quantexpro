// INVARIANTS DU BACKTESTER — Agent "Backtest Inquisitor"
// Chaque test protège un invariant qu'une due diligence institutionnelle vérifiera :
//   I1  Conservation du capital : finalEquity = capital + Σ pnl(trades), à epsilon près
//   I2  Coûts toujours déduits : un aller-retour à prix constant perd EXACTEMENT le coût
//   I3  Pas de look-ahead : aucun signal ne lit de donnée d'indice > barre courante
//   I4  Séquentialité : timestamps de trades croissants, entrée avant sortie, pas de réordonnancement
//   I5  Edge cases : zéro trade, trade unique, position jamais fermée, capital nul, drawdown 100%
// Les tests "démonstration de faute" prouvent que chaque garde-fou DÉTECTE une version cassée.
import { describe, it, expect } from "vitest";
import { runBacktest, runBatchBacktest } from "../../src/engine/backtest.ts";
import { runBacktestExt, computeMetrics } from "../../src/engine/backtestExtended.ts";
import { CONTRACTS } from "../../src/engine/contracts.ts";
import {
  makeBars, REGIMES, minimalCtx, DAY_MS, T0,
  neverTrade, alwaysLong, smaCross, alternating, singleRoundTrip,
  lookaheadCheat, makeCausalityGuard, roundTripCost,
} from "../helpers/fixtures.js";

const EPS = 1e-9;
const baseOptions = { contract: "MES", contracts: 1, useAtrStop: true, atrMult: 2, direction: "both", capital: 100000 };
const extParams = { contract: "MES", contracts: 1, capital: 100000, direction: "both", slAtr: 2, tpAtr: 0, beAtr: 0 };

// ---------------------------------------------------------------------------
// I1 — CONSERVATION DU CAPITAL
// ---------------------------------------------------------------------------
describe("I1 — Conservation du capital", () => {
  const strategies = { smaCross: smaCross(10, 30), alternating: alternating(15) };

  for (const [regimeName, gen] of Object.entries(REGIMES)) {
    for (const [stratName, strat] of Object.entries(strategies)) {
      it(`runBacktest : ${regimeName} × ${stratName}`, () => {
        const bars = gen(500);
        const res = runBacktest(bars, minimalCtx(bars), strat, baseOptions);
        const sumPnl = res.trades.reduce((s, t) => s + t.pnl, 0);
        expect(res.finalEquity).toBeCloseTo(baseOptions.capital + sumPnl, 6);
        expect(res.totalPnL).toBeCloseTo(sumPnl, 6);
      });

      it(`runBacktestExt : ${regimeName} × ${stratName}`, () => {
        const bars = gen(500);
        const res = runBacktestExt(bars, minimalCtx(bars), strat, extParams);
        const sumPnl = res.trades.reduce((s, t) => s + t.pnl, 0);
        expect(res.finalEquity).toBeCloseTo(extParams.capital + sumPnl, 6);
      });
    }
  }

  it("la courbe d'équité se termine sur finalEquity quand la position est fermée", () => {
    const bars = makeBars({ n: 300, seed: 12 });
    // direction "long" : le signal short à 250 ferme la position SANS en rouvrir une inverse
    const res = runBacktestExt(bars, minimalCtx(bars), singleRoundTrip(60, 250), { ...extParams, direction: "long" });
    expect(res.trades.length).toBe(1);
    expect(res.equityCurve[res.equityCurve.length - 1]).toBeCloseTo(res.finalEquity, 6);
  });

  it("DÉMONSTRATION DE FAUTE : un pnl falsifié casse la conservation", () => {
    const bars = REGIMES.bull(400);
    const res = runBacktestExt(bars, minimalCtx(bars), alternating(15), extParams);
    expect(res.trades.length).toBeGreaterThan(0);
    const tampered = res.trades.map((t, k) => (k === 0 ? { ...t, pnl: t.pnl + 500 } : t));
    const sumTampered = tampered.reduce((s, t) => s + t.pnl, 0);
    // l'assertion de I1 échouerait : l'écart est exactement la falsification
    expect(Math.abs(res.finalEquity - (extParams.capital + sumTampered))).toBeCloseTo(500, 6);
  });
});

// ---------------------------------------------------------------------------
// I2 — COÛTS TOUJOURS DÉDUITS (slippage + commission avant P&L)
// ---------------------------------------------------------------------------
describe("I2 — Coûts systématiquement déduits", () => {
  // Prix rigoureusement constant : gross = 0 → net = -coût aller-retour exact.
  const flatBars = Array.from({ length: 100 }, (_, i) => ({ o: 5000, h: 5000, l: 5000, c: 5000, v: 1000, t: T0 + i * DAY_MS }));

  for (const contract of Object.keys(CONTRACTS)) {
    it(`aller-retour à prix constant sur ${contract} : perte = coût exact`, () => {
      const res = runBacktestExt(flatBars, minimalCtx(flatBars), singleRoundTrip(55, 60),
        { ...extParams, contract, slAtr: 0 });
      expect(res.trades.length).toBe(1);
      expect(res.trades[0].pnl).toBeCloseTo(-roundTripCost(CONTRACTS[contract], 1), 9);
    });
  }

  it("le coût est proportionnel au nombre de contrats", () => {
    const res3 = runBacktestExt(flatBars, minimalCtx(flatBars), singleRoundTrip(55, 60),
      { ...extParams, contracts: 3, slAtr: 0 });
    expect(res3.trades[0].pnl).toBeCloseTo(-roundTripCost(CONTRACTS.MES, 3), 9);
  });

  it("aucun trade n'échappe au coût : pnl < gross théorique sur tous les régimes", () => {
    for (const gen of Object.values(REGIMES)) {
      const bars = gen(500);
      const spec = CONTRACTS.MES;
      const res = runBacktestExt(bars, minimalCtx(bars), alternating(10), extParams);
      for (const t of res.trades) {
        const gross = (t.exit - t.entry) * t.side * spec.pv * 1;
        expect(gross - t.pnl).toBeCloseTo(roundTripCost(spec, 1), 6);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// I3 — PAS DE LOOK-AHEAD (barrière temporelle stricte)
// Sémantique du moteur : signal calculé sur la barre i, exécution au close de i
// ("trade on close"). L'invariant testable est : AUCUNE lecture d'indice > i.
// ---------------------------------------------------------------------------
describe("I3 — Barrière temporelle (anti look-ahead)", () => {
  it("les stratégies honnêtes ne lisent jamais le futur", () => {
    const bars = REGIMES.range(400);
    for (const strat of [smaCross(10, 30), alternating(10), neverTrade, alwaysLong]) {
      const guard = makeCausalityGuard(minimalCtx(bars));
      runBacktestExt(bars, guard.guarded, guard.wrapStrategy(strat), extParams);
      expect(guard.violations).toEqual([]);
    }
  });

  it("DÉMONSTRATION DE FAUTE : le garde détecte un tricheur qui lit i+1", () => {
    const bars = REGIMES.range(400);
    const guard = makeCausalityGuard(minimalCtx(bars));
    runBacktestExt(bars, guard.guarded, guard.wrapStrategy(lookaheadCheat()), extParams);
    expect(guard.violations.length).toBeGreaterThan(0);
    expect(guard.violations[0].index).toBe(guard.violations[0].currentI + 1);
  });

  it("invariance par troncature : tronquer le futur ne change pas les trades passés", () => {
    const full = REGIMES.bull(500);
    const cut = full.slice(0, 350);
    const strat = smaCross(10, 30);
    const resFull = runBacktestExt(full, minimalCtx(full), strat, extParams);
    const resCut = runBacktestExt(cut, minimalCtx(cut), strat, extParams);
    const cutoff = cut[cut.length - 1].t;
    const closedBefore = resFull.trades.filter((t) => t.exitTime <= cutoff);
    // tous les trades clos avant la coupure doivent être identiques
    expect(resCut.trades.slice(0, closedBefore.length)).toEqual(closedBefore);
  });
});

// ---------------------------------------------------------------------------
// I4 — SÉQUENTIALITÉ (pas de réordonnancement implicite des barres)
// ---------------------------------------------------------------------------
describe("I4 — Séquentialité", () => {
  it("trades ordonnés : entryTime ≤ exitTime, exits non décroissants, 1 position max", () => {
    for (const gen of Object.values(REGIMES)) {
      const bars = gen(500);
      const res = runBacktestExt(bars, minimalCtx(bars), alternating(10), extParams);
      let prevExit = -Infinity;
      for (const t of res.trades) {
        expect(t.entryTime).toBeLessThanOrEqual(t.exitTime);
        expect(t.entryTime).toBeGreaterThanOrEqual(prevExit); // pas de chevauchement (mono-position)
        expect(prevExit).toBeLessThanOrEqual(t.exitTime);
        expect(t.bars).toBeGreaterThanOrEqual(0);
        prevExit = t.exitTime;
      }
    }
  });

  it("la courbe d'équité a exactement (n - 50) points après le warm-up + le point initial", () => {
    const bars = makeBars({ n: 500, seed: 5 });
    const res = runBacktestExt(bars, minimalCtx(bars), smaCross(10, 30), extParams);
    expect(res.equityCurve.length).toBe(500 - 50 + 1);
  });

  it("DÉMONSTRATION DE FAUTE : des barres réordonnées produisent un résultat différent", () => {
    const bars = REGIMES.range(400);
    // prix inversés, timestamps d'origine : isole l'effet "ordre des prix"
    const reordered = bars.map((b, i) => ({ ...bars[bars.length - 1 - i], t: b.t }));
    const strat = alternating(10);
    const a = runBacktestExt(bars, minimalCtx(bars), strat, extParams);
    const b = runBacktestExt(reordered, minimalCtx(reordered), strat, extParams);
    expect(b.totalPnL).not.toBeCloseTo(a.totalPnL, 6);
  });
});

// ---------------------------------------------------------------------------
// I6 — SORTIES SL / TP / BREAK-EVEN À PRIX EXACTS
// Barres construites à la main : chaque sortie doit se faire AU niveau exact,
// avec la bonne raison, coûts déduits.
// ---------------------------------------------------------------------------
describe("I6 — Sorties SL/TP/BE à prix exacts", () => {
  const spec = CONTRACTS.MES;
  const flat = (c, extra = {}) => ({ o: c, h: c, l: c, c, v: 1000, ...extra });
  const mkBars = (mut) => {
    const bars = Array.from({ length: 70 }, (_, i) => ({ ...flat(5000), t: T0 + i * DAY_MS }));
    mut(bars);
    return bars;
  };
  const longAt55 = (ctx, i) => ({ long: i === 55, short: false });
  const p = { ...extParams, direction: "long" }; // atr constant = 20 via minimalCtx

  it("Take Profit : long 5000, tpAtr=2×20 → sortie exacte à 5040, raison TP", () => {
    const bars = mkBars((b) => { b[58] = { ...b[58], h: 5100, c: 5050 }; });
    const res = runBacktestExt(bars, minimalCtx(bars), longAt55, { ...p, slAtr: 0, tpAtr: 2 });
    expect(res.trades.length).toBe(1);
    expect(res.trades[0].reason).toBe("TP");
    expect(res.trades[0].exit).toBe(5040);
    expect(res.trades[0].pnl).toBeCloseTo(40 * spec.pv - roundTripCost(spec, 1), 9);
  });

  it("Stop Loss : long 5000, slAtr=2×20 → sortie exacte à 4960, raison SL", () => {
    const bars = mkBars((b) => { b[58] = { ...b[58], l: 4900, c: 4950 }; });
    const res = runBacktestExt(bars, minimalCtx(bars), longAt55, { ...p, slAtr: 2 });
    expect(res.trades.length).toBe(1);
    expect(res.trades[0].reason).toBe("SL");
    expect(res.trades[0].exit).toBe(4960);
    expect(res.trades[0].pnl).toBeCloseTo(-40 * spec.pv - roundTripCost(spec, 1), 9);
  });

  it("Break-Even : profit ≥ 1×ATR remonte le stop à l'entrée → sortie à 5000, raison BE, pnl = -coût", () => {
    const bars = mkBars((b) => {
      b[58] = { ...b[58], h: 5030, c: 5025 }; // favor 25 ≥ beAtr×20 → stop remonté à 5000
      b[60] = { ...b[60], l: 4980, c: 4990 }; // retombe sur le stop BE
    });
    const res = runBacktestExt(bars, minimalCtx(bars), longAt55, { ...p, slAtr: 2, beAtr: 1 });
    expect(res.trades.length).toBe(1);
    expect(res.trades[0].reason).toBe("BE");
    expect(res.trades[0].exit).toBe(5000);
    expect(res.trades[0].pnl).toBeCloseTo(-roundTripCost(spec, 1), 9);
  });
});

// ---------------------------------------------------------------------------
// I5 — EDGE CASES
// ---------------------------------------------------------------------------
describe("I5 — Edge cases", () => {
  it("zéro trade : capital intact, métriques neutres", () => {
    const bars = makeBars({ n: 300, seed: 3 });
    const res = runBacktestExt(bars, minimalCtx(bars), neverTrade, extParams);
    expect(res.trades).toEqual([]);
    expect(res.finalEquity).toBe(extParams.capital);
    expect(res.winRate).toBe(0);
    expect(res.profitFactor).toBe(0);
    expect(res.maxDD).toBe(0);
    expect(res.sharpe).toBe(0);
  });

  it("position jamais fermée : zéro trade clos mais mark-to-market dans la courbe", () => {
    const bars = makeBars({ n: 300, seed: 4 });
    const res = runBacktestExt(bars, minimalCtx(bars), alwaysLong, { ...extParams, slAtr: 0 });
    expect(res.trades.length).toBe(0);
    // le dernier point reflète la position ouverte, pas seulement le cash
    const last = res.equityCurve[res.equityCurve.length - 1];
    expect(last).not.toBe(extParams.capital);
  });

  it("trade unique : toutes les métriques restent finies", () => {
    const bars = makeBars({ n: 300, seed: 6 });
    const res = runBacktestExt(bars, minimalCtx(bars), singleRoundTrip(60, 90), { ...extParams, slAtr: 0 });
    expect(res.trades.length).toBe(1);
    for (const k of ["totalPnL", "winRate", "sharpe", "sortino", "maxDD", "expectancyR"]) {
      expect(Number.isFinite(res[k]), `${k} doit être fini`).toBe(true);
    }
  });

  it("drawdown 100% : maxDD plafonne à 1 quand l'équité tombe à zéro", () => {
    const curve = [100000, 50000, 0];
    const bars = makeBars({ n: 3, seed: 1 });
    const m = computeMetrics([], curve, 100000, bars);
    expect(m.maxDD).toBe(1);
  });

  it("capital nul : comportement documenté (pas de crash, métriques dégénérées)", () => {
    const bars = makeBars({ n: 200, seed: 8 });
    // caractérisation : le moteur ne lève pas d'exception avec capital = 0
    const res = runBacktestExt(bars, minimalCtx(bars), smaCross(10, 30), { ...extParams, capital: 0 });
    expect(res.trades.length).toBeGreaterThanOrEqual(0);
  });

  it("le batch produit exactement les mêmes chiffres que les runs individuels", () => {
    const bars = REGIMES.range(400);
    const ctx = minimalCtx(bars);
    const library = [
      { id: "s1", name: "alt10", cat: "test", eval: alternating(10) },
      { id: "s2", name: "sma", cat: "test", eval: smaCross(10, 30) },
      { id: "s3", name: "broken", cat: "test", eval: () => { throw new Error("boom"); } },
    ];
    const progress = [];
    const batch = runBatchBacktest(bars, ctx, library, baseOptions, (k, total) => progress.push([k, total]));
    expect(batch.length).toBe(2); // la stratégie qui jette est ignorée, pas propagée
    const solo = runBacktest(bars, ctx, alternating(10), baseOptions);
    expect(batch[0].pnl).toBeCloseTo(solo.totalPnL, 9);
    expect(batch[0].trades).toBe(solo.trades.length);
    expect(progress[progress.length - 1]).toEqual([3, 3]);
  });

  it("moins de barres que le warm-up (50) : zéro trade, pas de crash", () => {
    const bars = makeBars({ n: 30, seed: 9 });
    const res = runBacktestExt(bars, minimalCtx(bars), alternating(5), extParams);
    expect(res.trades).toEqual([]);
    expect(res.finalEquity).toBe(extParams.capital);
  });
});
