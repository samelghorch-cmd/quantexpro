// P1 — filtre DSR Usine (factoryDsr.js)
import { describe, it, expect } from "vitest";
import {
  FACTORY_DSR_MIN,
  trialsForFactoryPair,
  evaluateFactoryDsr,
  passesFactoryDsr,
} from "../../src/engine/factoryDsr.js";

describe("trialsForFactoryPair", () => {
  it("additionne screening + grille, min 1", () => {
    expect(trialsForFactoryPair(700, 54)).toBe(754);
    expect(trialsForFactoryPair(0, 0)).toBe(1);
  });
});

describe("passesFactoryDsr", () => {
  it("rejette un DSR sous le seuil en OOS (même règle que Reco Finale)", () => {
    expect(passesFactoryDsr({ dsr: 0.49 }, { oos: true })).toBe(false);
    expect(passesFactoryDsr({ dsr: FACTORY_DSR_MIN }, { oos: true })).toBe(true);
    expect(passesFactoryDsr({ dsr: 0.91 }, { oos: true })).toBe(true);
  });

  it("rejette NaN en OOS (pas assez de trades pour un DSR fiable)", () => {
    expect(passesFactoryDsr({ dsr: NaN }, { oos: true })).toBe(false);
  });

  it("laisse passer sans OOS (série trop courte — pas de déflation fiable)", () => {
    expect(passesFactoryDsr({ dsr: 0.1 }, { oos: false })).toBe(true);
  });
});

describe("evaluateFactoryDsr", () => {
  it("retourne un DSR fini sur une série de PnL gagnante, et baisse quand nTrials explose", () => {
    // Série artificielle : gains stables → Sharpe élevé.
    const trades = Array.from({ length: 40 }, (_, i) => ({ pnl: i % 5 === 0 ? -20 : 30 }));
    const few = evaluateFactoryDsr(trades, 2);
    const many = evaluateFactoryDsr(trades, 10_000);
    expect(Number.isFinite(few.dsr)).toBe(true);
    expect(Number.isFinite(many.dsr)).toBe(true);
    // Plus d'essais → seuil H0 plus haut → DSR plus bas (ou égal).
    expect(many.dsr).toBeLessThanOrEqual(few.dsr + 1e-9);
    expect(many.nTrials).toBe(10_000);
  });

  it("NaN si moins de 3 trades", () => {
    const r = evaluateFactoryDsr([{ pnl: 1 }, { pnl: -1 }], 100);
    expect(Number.isNaN(r.dsr)).toBe(true);
  });
});
