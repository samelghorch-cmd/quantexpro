// GOLDEN TESTS PAR RÉGIME DE MARCHÉ — Agent "Metric Goldsmith"
// Le moteur complet (runBacktestExt) est exécuté sur 5 régimes synthétiques seedés
// (bull, bear, range, gap, flash crash) et les métriques sont verrouillées sur des
// valeurs de référence capturées le 2026-07-23 (commit de la suite initiale).
//
// POURQUOI (due diligence) : tout refactor du moteur qui change le moindre chiffre
// (ordre des barres, coûts, annualisation, gestion des stops) casse ces tests. Un
// changement INTENTIONNEL doit régénérer les goldens et être justifié dans le commit.
//
// Reproductibilité : générateurs seedés sans fonction transcendante (fixtures.js)
// → bit-à-bit identique sur toute machine IEEE-754 / V8. Tolérances : ±0.5e-4 sur
// les ratios (sqrt en jeu), ±0.5e-3 sur les P&L en dollars.
import { describe, it, expect } from "vitest";
import { runBacktestExt } from "../../src/engine/backtestExtended.ts";
import { REGIMES, minimalCtx, smaCross, alternating } from "../helpers/fixtures.js";

const extParams = { contract: "MES", contracts: 1, capital: 100000, direction: "both", slAtr: 2, tpAtr: 0, beAtr: 0 };

// Valeurs de référence — régénérables via le protocole documenté dans tests/README.md.
const GOLDEN_ALTERNATING = {
  bull:       { nTrades: 49, totalPnL:    57.092903, winRate: 46.938776, profitFactor: 1.018622, sharpe: -0.130280, sortino: -0.182296, maxDD: 0.00456099, expectancyR:  0.009881 },
  bear:       { nTrades: 50, totalPnL:  -517.051162, winRate: 46.000000, profitFactor: 0.851908, sharpe: -0.553036, sortino: -0.768645, maxDD: 0.00633491, expectancyR: -0.079970 },
  range:      { nTrades: 45, totalPnL:  1011.818855, winRate: 55.555556, profitFactor: 1.777848, sharpe:  1.126251, sortino:  1.672638, maxDD: 0.00610594, expectancyR:  0.345710 },
  gap:        { nTrades: 44, totalPnL:   916.488331, winRate: 54.545455, profitFactor: 1.429767, sharpe:  0.606828, sortino:  1.102372, maxDD: 0.00823071, expectancyR:  0.195349 },
  flashCrash: { nTrades: 53, totalPnL:  -971.360491, winRate: 32.075472, profitFactor: 0.738128, sharpe: -1.377933, sortino: -1.797599, maxDD: 0.01188188, expectancyR: -0.177876 },
};

const GOLDEN_SMACROSS = {
  range:      { nTrades: 33, totalPnL: -2923.175007, winRate: 12.121212, profitFactor: 0.049459, sharpe: -3.395377, sortino: -4.210657, maxDD: 0.03056511, expectancyR: -0.835324 },
  gap:        { nTrades: 26, totalPnL: -1566.364181, winRate: 11.538462, profitFactor: 0.391154, sharpe: -1.312117, sortino: -1.611874, maxDD: 0.02203692, expectancyR: -0.538595 },
  flashCrash: { nTrades: 14, totalPnL:   833.274700, winRate: 14.285714, profitFactor: 1.402381, sharpe:  1.373812, sortino:  1.596680, maxDD: 0.02555803, expectancyR:  0.344898 },
};

function assertGolden(res, g) {
  expect(res.nTrades).toBe(g.nTrades);
  expect(res.totalPnL).toBeCloseTo(g.totalPnL, 3);
  expect(res.winRate).toBeCloseTo(g.winRate, 4);
  expect(res.profitFactor).toBeCloseTo(g.profitFactor, 4);
  expect(res.sharpe).toBeCloseTo(g.sharpe, 4);
  expect(res.sortino).toBeCloseTo(g.sortino, 4);
  expect(res.maxDD).toBeCloseTo(g.maxDD, 6);
  expect(res.expectancyR).toBeCloseTo(g.expectancyR, 4);
}

describe("Golden par régime — stratégie alternating(10)", () => {
  for (const [regime, golden] of Object.entries(GOLDEN_ALTERNATING)) {
    it(`régime ${regime} : métriques verrouillées`, () => {
      const bars = REGIMES[regime](500);
      assertGolden(runBacktestExt(bars, minimalCtx(bars), alternating(10), extParams), golden);
    });
  }
});

describe("Golden par régime — stratégie smaCross(10,30)", () => {
  for (const [regime, golden] of Object.entries(GOLDEN_SMACROSS)) {
    it(`régime ${regime} : métriques verrouillées`, () => {
      const bars = REGIMES[regime](500);
      assertGolden(runBacktestExt(bars, minimalCtx(bars), smaCross(10, 30), extParams), golden);
    });
  }

  it("bull/bear en tendance : smaCross reste en position → 0 trade clos (comportement documenté)", () => {
    // Garde le comportement explicite : en tendance pure, le croisement ne se re-croise
    // jamais, la position reste ouverte, aucun trade n'est comptabilisé au P&L clos.
    for (const regime of ["bull", "bear"]) {
      const bars = REGIMES[regime](500);
      const res = runBacktestExt(bars, minimalCtx(bars), smaCross(10, 30), extParams);
      expect(res.nTrades).toBe(0);
      expect(res.finalEquity).toBe(extParams.capital);
    }
  });

  it("le PRNG seedé est stable : deux générations successives sont identiques bit à bit", () => {
    const a = REGIMES.range(500);
    const b = REGIMES.range(500);
    expect(a).toEqual(b);
  });
});
