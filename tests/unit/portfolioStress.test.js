// P1-PORT — stress-test historique portefeuille Usine
import { describe, it, expect } from "vitest";
import {
  STRESS_SCENARIOS,
  STRESS_MAX_DD_LIMIT,
  geometricCrashRecover,
  flashCrashPath,
  metricsFromCurve,
  applyScenario,
  stressPortfolio,
} from "../../src/engine/portfolioStress.js";

describe("STRESS_SCENARIOS", () => {
  it("expose les 3 crises requises (2008 / 2010 / 2020)", () => {
    expect(STRESS_SCENARIOS.map((s) => s.id)).toEqual(["gfc_2008", "flash_2010", "covid_2020"]);
    expect(STRESS_SCENARIOS.every((s) => s.marketReturns.length > 0)).toBe(true);
  });
});

describe("geometricCrashRecover", () => {
  it("atteint le trough puis récupère (déterministe)", () => {
    const rets = geometricCrashRecover({ trough: 0.5, crashDays: 10, recoverDays: 10, recoverTo: 0.8 });
    expect(rets).toHaveLength(20);
    let eq = 1;
    for (let i = 0; i < 10; i++) eq *= 1 + rets[i];
    expect(eq).toBeCloseTo(0.5, 5);
    for (let i = 10; i < 20; i++) eq *= 1 + rets[i];
    expect(eq).toBeCloseTo(0.8, 5);
  });
});

describe("metricsFromCurve", () => {
  it("calcule MaxDD sur un V-shape", () => {
    const m = metricsFromCurve([100, 110, 80, 90]);
    // peak 110 → 80 = 27.27 %
    expect(m.maxDD).toBeCloseTo((110 - 80) / 110, 5);
    expect(m.totalPnL).toBe(-10);
  });
});

describe("applyScenario", () => {
  it("aggrave le DD d'une courbe plate sous GFC (corrSpike élevé)", () => {
    const flat = Array.from({ length: 250 }, () => 100000);
    const gfc = STRESS_SCENARIOS.find((s) => s.id === "gfc_2008");
    const r = applyScenario(flat, gfc);
    expect(r).not.toBeNull();
    // Avec λ=0.92 et trough 0.45, MaxDD stressé >> 0
    expect(r.maxDD).toBeGreaterThan(0.3);
    expect(r.ddDelta).toBeGreaterThan(0.3);
    expect(r.curve.length).toBe(flat.length);
  });

  it("Flash Crash est court et violent", () => {
    expect(flashCrashPath().length).toBe(8);
    const rising = Array.from({ length: 40 }, (_, i) => 100000 + i * 100);
    const flash = STRESS_SCENARIOS.find((s) => s.id === "flash_2010");
    const r = applyScenario(rising, flash);
    expect(r.maxDD).toBeGreaterThan(0.05);
    expect(r.window.length).toBeLessThanOrEqual(8);
  });

  it("retourne null si courbe trop courte", () => {
    expect(applyScenario([100], STRESS_SCENARIOS[0])).toBeNull();
  });
});

describe("stressPortfolio", () => {
  it("null sans portefeuille", () => {
    expect(stressPortfolio(null)).toBeNull();
    expect(stressPortfolio({ curve: [1] })).toBeNull();
  });

  it("agrège les 3 scénarios + verdict PASS/FAIL", () => {
    const curve = Array.from({ length: 300 }, (_, i) => 100000 * (1 + i * 0.0005));
    const out = stressPortfolio({ curve, maxDD: 0.02 }, { maxDDLimit: STRESS_MAX_DD_LIMIT });
    expect(out.results).toHaveLength(3);
    expect(out.worst).toBeTruthy();
    expect(typeof out.allPass).toBe("boolean");
    expect(out.maxDDLimit).toBe(STRESS_MAX_DD_LIMIT);
    // GFC sur courbe longue → DD élevé → FAIL au seuil 40 %
    const gfc = out.results.find((r) => r.scenarioId === "gfc_2008");
    expect(gfc.maxDD).toBeGreaterThan(0.35);
    expect(gfc.pass).toBe(false);
    expect(out.allPass).toBe(false);
  });

  it("PASS si limite très haute", () => {
    const curve = Array.from({ length: 100 }, () => 100000);
    const out = stressPortfolio({ curve }, { maxDDLimit: 0.99 });
    expect(out.allPass).toBe(true);
    expect(out.results.every((r) => r.pass)).toBe(true);
  });
});
