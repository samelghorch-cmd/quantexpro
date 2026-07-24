// POSITION SIZING — tests du mode RISK_PERCENT (risque fixe en % de l'équité courante).
// Exigence due diligence : le sizing affiché dans l'UI doit être CELUI du moteur
// (bug historique : inputs Lot Mode / Risk % affichés mais jamais branchés).
import { describe, it, expect } from "vitest";
import { runBacktestExt } from "../../src/engine/backtestExtended.js";
import { CONTRACTS, resolveSpec, roundTripCost } from "../../src/engine/contracts.js";
import { makeBars, minimalCtx, singleRoundTrip, REGIMES, alternating, DAY_MS, T0 } from "../helpers/fixtures.js";

// Barres plates à prix P, avec un plongeon à la barre `dipAt` pour toucher le SL.
const flatWithDip = (P, dipAt, dipTo, n = 100) =>
  Array.from({ length: n }, (_, i) => {
    const c = i === dipAt ? dipTo : P;
    return { o: P, h: P, l: Math.min(P, c), c, v: 100, t: T0 + i * DAY_MS };
  });

describe("RISK_PERCENT — quantité dimensionnée par le stop", () => {
  it("futures MES : capital 100k, risk 1%, stop 2×ATR(20) → qty = floor(1000/200) = 5 ; SL → perte $1000 + coûts", () => {
    // stop distance = 40 pts ; riskPerUnit = 40 × pv 5 = $200 ; risk$ = 1000 → qty 5 (entier)
    const bars = flatWithDip(5000, 60, 4900);
    const res = runBacktestExt(bars, minimalCtx(bars, 20), singleRoundTrip(55, 90),
      { contract: "MES", capital: 100000, direction: "long", slAtr: 2, lotMode: "RISK_PERCENT", riskPct: 1 });
    expect(res.trades.length).toBe(1);
    expect(res.trades[0].qty).toBe(5);
    expect(res.trades[0].reason).toBe("SL");
    expect(res.trades[0].pnl).toBeCloseTo(-(40 * 5 * 5) - roundTripCost(CONTRACTS.MES, 5, 5000, 4960), 9);
  });

  it("crypto BTC : quantité FRACTIONNAIRE — risk 1% de 100k, stop 1000 → qty = 1.0 exactement", () => {
    // atr 500, slAtr 2 → stop 1000 ; pv 1 → riskPerUnit 1000 ; 1% de 100k = 1000 → qty 1.0
    const bars = flatWithDip(50000, 60, 48000);
    const res = runBacktestExt(bars, minimalCtx(bars, 500), singleRoundTrip(55, 90),
      { contract: "BTC", capital: 100000, direction: "long", slAtr: 2, lotMode: "RISK_PERCENT", riskPct: 1 });
    expect(res.trades[0].qty).toBeCloseTo(1.0, 12);
    expect(res.trades[0].exit).toBe(49000);
    expect(res.trades[0].pnl).toBeCloseTo(-1000 - roundTripCost(resolveSpec("BTC"), 1, 50000, 49000), 9);
  });

  it("compounding : après une perte, la quantité du trade suivant baisse (risque sur équité COURANTE)", () => {
    const P = 50000;
    const bars = Array.from({ length: 200 }, (_, i) => {
      let c = P;
      if (i === 60) c = 47000; // SL trade 1
      if (i === 130) c = 47000; // SL trade 2
      return { o: P, h: P, l: Math.min(P, c), c, v: 100, t: T0 + i * DAY_MS };
    });
    const strat = (ctx, i) => ({ long: i === 55 || i === 125, short: false });
    const res = runBacktestExt(bars, minimalCtx(bars, 500), strat,
      { contract: "BTC", capital: 100000, direction: "long", slAtr: 2, lotMode: "RISK_PERCENT", riskPct: 1 });
    expect(res.trades.length).toBe(2);
    const [t1, t2] = res.trades;
    expect(t2.qty).toBeLessThan(t1.qty);
    // le risque réalisé (hors coûts) est bien 1 % de l'équité au moment de l'entrée
    expect(t2.qty).toBeCloseTo(((100000 + t1.pnl) * 0.01) / 1000, 9);
  });

  it("qty = 0 (capital insuffisant pour 1 lot entier) → AUCUN trade, jamais de sur-risque silencieux", () => {
    // risk$ = 1% de 1000 = $10 < riskPerUnit $200 → floor = 0 → pas d'entrée
    const bars = flatWithDip(5000, 60, 4900);
    const res = runBacktestExt(bars, minimalCtx(bars, 20), singleRoundTrip(55, 90),
      { contract: "MES", capital: 1000, direction: "long", slAtr: 2, lotMode: "RISK_PERCENT", riskPct: 1 });
    expect(res.trades.length).toBe(0);
    expect(res.finalEquity).toBe(1000);
  });

  it("repli documenté : RISK_PERCENT sans SL (slAtr=0) → lots fixes", () => {
    const bars = makeBars({ n: 200, seed: 77 });
    const res = runBacktestExt(bars, minimalCtx(bars), singleRoundTrip(60, 90),
      { contract: "MES", capital: 100000, direction: "long", slAtr: 0, lotMode: "RISK_PERCENT", riskPct: 1, contracts: 3 });
    expect(res.trades[0].qty).toBe(3);
  });
});

describe("Rétro-compatibilité et warmup", () => {
  it("FIXED_LOTS par défaut : résultats identiques à un appel sans lotMode (goldens intacts)", () => {
    const bars = REGIMES.range(500);
    const a = runBacktestExt(bars, minimalCtx(bars), alternating(10), { contract: "MES", capital: 100000, slAtr: 2 });
    const b = runBacktestExt(bars, minimalCtx(bars), alternating(10), { contract: "MES", capital: 100000, slAtr: 2, lotMode: "FIXED_LOTS", riskPct: 99 });
    expect(a.totalPnL).toBe(b.totalPnL);
    expect(a.trades.length).toBe(b.trades.length);
  });

  it("warmup paramétrable : warmup=100 → courbe d'équité de n−100+1 points, aucun trade avant", () => {
    const bars = makeBars({ n: 300, seed: 55 });
    const res = runBacktestExt(bars, minimalCtx(bars), alternating(10), { contract: "MES", capital: 100000, slAtr: 2, warmup: 100 });
    expect(res.equityCurve.length).toBe(300 - 100 + 1);
    for (const t of res.trades) expect(t.entryTime).toBeGreaterThanOrEqual(bars[100].t);
  });
});
