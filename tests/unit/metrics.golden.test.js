// GOLDEN TESTS MÉTRIQUES — Agent "Metric Goldsmith"
// Chaque assertion compare une métrique à une valeur de référence CALCULÉE À LA MAIN
// (documentée dans le commentaire) avec une tolérance explicite. Exigence due diligence :
// les chiffres montrés à un investisseur doivent être reproductibles hors de la plateforme.
//
// Tolérances (voir tests/README.md) :
//   exactes        → toBe / toBeCloseTo(x, 9)  : arithmétique pure, zéro transcendante
//   transcendantes → toBeCloseTo(x, 3)  (±0.0005) : sqrt/pow/log (stables sur V8)
import { describe, it, expect } from "vitest";
import { computeMetrics } from "../../src/engine/backtestExtended.js";
import { annualFactor, periodsPerYear } from "../../src/engine/annualize.js";
import { makeBars, DAY_MS, HOUR_MS, T0 } from "../helpers/fixtures.js";

const dailyBars = (n) => makeBars({ n, dtMs: DAY_MS });
const trade = (pnl) => ({ pnl });

// ---------------------------------------------------------------------------
// Annualisation — verrouille la correction du bug historique sqrt(252×78) codé
// en dur, qui surévaluait Sharpe/Sortino d'un facteur 3 à 9 sur H1/H4/D1.
// ---------------------------------------------------------------------------
describe("Golden — annualFactor / periodsPerYear", () => {
  it("barres daily → 365.25 périodes/an EXACTEMENT (calendaire)", () => {
    expect(periodsPerYear(dailyBars(50))).toBe(365.25);
    expect(annualFactor(dailyBars(50))).toBeCloseTo(19.1115, 3); // √365.25
  });

  it("barres H1 → 8766 périodes/an exactement", () => {
    expect(periodsPerYear(makeBars({ n: 50, dtMs: HOUR_MS }))).toBe(8766);
    expect(annualFactor(makeBars({ n: 50, dtMs: HOUR_MS }))).toBeCloseTo(93.6270, 3); // √8766
  });

  it("barres M5 → 365.25 × 288 = 105192 périodes/an exactement", () => {
    expect(periodsPerYear(makeBars({ n: 50, dtMs: 5 * 60 * 1000 }))).toBe(365.25 * 288);
  });

  it("gaps week-end : la MÉDIANE ignore les trous (daily avec gaps de 3 j → 365.25)", () => {
    // 5 barres consécutives puis un gap de 3 jours, répété — la médiane des deltas reste 1 j
    const bars = [];
    let t = T0;
    for (let i = 0; i < 60; i++) {
      t += (i % 6 === 5 ? 3 : 1) * DAY_MS;
      bars.push({ o: 100, h: 101, l: 99, c: 100, v: 1, t });
    }
    expect(periodsPerYear(bars)).toBe(365.25);
  });

  it("garde anti-régression : le facteur daily n'est PLUS √(252×78) ≈ 140.2", () => {
    expect(annualFactor(dailyBars(50))).toBeLessThan(20);
  });

  it("dégénéré : < 3 barres → défaut 252", () => {
    expect(periodsPerYear([])).toBe(252);
    expect(periodsPerYear(dailyBars(2))).toBe(252);
  });

  it("dégénéré : timestamps identiques (aucun delta > 0) → défaut 252", () => {
    const bars = Array.from({ length: 10 }, () => ({ o: 1, h: 1, l: 1, c: 1, v: 1, t: T0 }));
    expect(periodsPerYear(bars)).toBe(252);
  });
});

// ---------------------------------------------------------------------------
// Micro-cas canonique calculé à la main, capital 10 000, barres daily.
// trades : +100, -50, +100, -50 ; courbe : 10000→10100→10050→10150→10100
// returns : [+0.01, -0.005, +0.01, -0.005]  (÷ capital)
//   mean = 0.0025 ; écarts = ±0.0075 → std (population) = 0.0075
//   downside = √((0.005² + 0.005²)/4) = 0.0035355339
// ---------------------------------------------------------------------------
describe("Golden — computeMetrics, micro-cas canonique", () => {
  const trades = [trade(100), trade(-50), trade(100), trade(-50)];
  const curve = [10000, 10100, 10050, 10150, 10100];
  const m = computeMetrics(trades, curve, 10000, dailyBars(60));

  it("comptages et P&L exacts", () => {
    expect(m.nTrades).toBe(4);
    expect(m.nWins).toBe(2);
    expect(m.nLosses).toBe(2);
    expect(m.totalPnL).toBe(100);
    expect(m.totalPnLPct).toBe(1);
    expect(m.finalEquity).toBe(10100);
    expect(m.grossWin).toBe(200);
    expect(m.grossLoss).toBe(100);
  });

  it("winRate = 50 %, avgWin = 100, avgLoss = 50, evTrade = 25 — exacts", () => {
    expect(m.winRate).toBe(50);
    expect(m.avgWin).toBe(100);
    expect(m.avgLoss).toBe(50);
    expect(m.evTrade).toBe(25);
  });

  it("Profit Factor = 200/100 = 2 exactement", () => {
    expect(m.profitFactor).toBe(2);
  });

  it("Expectancy R = (0.5×100 − 0.5×50)/50 = 0.5 exactement", () => {
    expect(m.expectancyR).toBeCloseTo(0.5, 9);
  });

  it("Kelly = W − (1−W)/R = 0.5 − 0.5/2 = 0.25 ; demi-Kelly = 12.5 %", () => {
    expect(m.kelly).toBeCloseTo(0.25, 9);
    expect(m.kellyHalf).toBeCloseTo(12.5, 9);
  });

  it("Sharpe = (0.0025/0.0075)×√365.25 = 6.3705 (±0.0005)", () => {
    expect(m.sharpe).toBeCloseTo(6.3705, 3);
  });

  it("Sortino = (0.0025/0.0035355)×√365.25 = 13.5139 (±0.0005)", () => {
    expect(m.sortino).toBeCloseTo(13.5139, 3);
  });

  it("Max Drawdown = 50/10100 = 0.00495050 (pic 10100 → creux 10050)", () => {
    expect(m.maxDD).toBeCloseTo(50 / 10100, 9);
    expect(m.maxDD).toBeCloseTo(0.0049505, 6);
  });

  it("CAGR ≈ 106.86 % (5 points daily → 1.01^73.05) et Calmar = CAGR/(maxDD×100) ≈ 215.86", () => {
    // years = 5/365.25 ; (10100/10000)^(1/years) − 1 = e^(73.05×ln 1.01) − 1 ≈ 1.06860
    expect(m.cagr).toBeCloseTo(106.8605, 2);
    expect(m.calmar).toBeCloseTo(215.8582, 2);
  });
});

// ---------------------------------------------------------------------------
// Série de référence à Sharpe annualisé = 1.0 EXACTEMENT, par construction :
// returns périodiques r = m ± s avec m = s/√(365.25) → mean/std × ann = 1.
// ---------------------------------------------------------------------------
describe("Golden — série de référence Sharpe = 1.0", () => {
  it("cycle déterministe m ± s → Sharpe annualisé exactement 1.0 (±1e-9)", () => {
    const capital = 100000;
    const ann = Math.sqrt(365.25);
    const s = 0.01;
    const mean = s / ann;
    const curve = [capital];
    for (let i = 0; i < 400; i++) {
      const r = i % 2 === 0 ? mean + s : mean - s; // moyenne = mean, écart-type = s, exacts
      curve.push(curve[curve.length - 1] + capital * r);
    }
    const m = computeMetrics([], curve, capital, dailyBars(60));
    expect(m.sharpe).toBeCloseTo(1.0, 9);
  });
});

// ---------------------------------------------------------------------------
// Cas limites de définition (comportements documentés, pas accidentels)
// ---------------------------------------------------------------------------
describe("Golden — cas limites de définition", () => {
  const bars = dailyBars(60);

  it("que des gains → Profit Factor = Infinity (convention documentée)", () => {
    const m = computeMetrics([trade(10), trade(20)], [1000, 1010, 1030], 1000, bars);
    expect(m.profitFactor).toBe(Infinity);
    expect(m.winRate).toBe(100);
  });

  it("aucun trade → toutes les métriques neutres, pas de NaN", () => {
    const m = computeMetrics([], [1000, 1000], 1000, bars);
    expect(m.profitFactor).toBe(0);
    expect(m.sharpe).toBe(0);
    expect(m.maxDD).toBe(0);
    expect(m.expectancyR).toBe(0);
    expect(m.kelly).toBe(0);
  });

  it("équité constante (std = 0) → Sharpe = 0, pas de division par zéro", () => {
    const m = computeMetrics([trade(0)], [1000, 1000, 1000], 1000, bars);
    expect(m.sharpe).toBe(0);
    expect(m.sortino).toBe(0);
  });

  it("que des pertes → Sortino négatif, expectancy < 0", () => {
    const m = computeMetrics([trade(-10), trade(-20)], [1000, 990, 970], 1000, bars);
    expect(m.profitFactor).toBe(0);
    expect(m.sortino).toBeLessThan(0);
    expect(m.expectancyR).toBeLessThan(0);
  });

  it("DÉMONSTRATION DE FAUTE : une annualisation codée en dur √(252×78) serait détectée", () => {
    // Sur des barres daily, l'ancien bug donnerait Sharpe ×(140.2/19.1) ≈ ×7.34
    const curve = [10000, 10100, 10050, 10150, 10100];
    const m = computeMetrics([trade(100), trade(-50), trade(100), trade(-50)], curve, 10000, bars);
    const buggyFactor = Math.sqrt(252 * 78);
    const buggySharpe = (0.0025 / 0.0075) * buggyFactor; // ≈ 46.75
    expect(Math.abs(m.sharpe - buggySharpe)).toBeGreaterThan(30); // impossible à confondre
  });
});
