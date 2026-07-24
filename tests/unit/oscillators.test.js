import { describe, it, expect } from "vitest";
import {
  rollingZScore,
  scaleHurstForOverlay,
  buildMarketOscillators,
  oscillatorsToCSV,
} from "../../src/engine/oscillators.js";
import { makeBars, DAY_MS } from "../helpers/fixtures.js";
import { buildContext } from "../../src/engine/context.js";

describe("rollingZScore", () => {
  it("null pendant warmup puis fini", () => {
    const s = Array.from({ length: 40 }, (_, i) => 100 + i * 0.1);
    const z = rollingZScore(s, 20);
    expect(z[10]).toBeNull();
    expect(Number.isFinite(z[25])).toBe(true);
  });

  it("causal : troncature ne change pas le passé", () => {
    const s = Array.from({ length: 60 }, (_, i) => Math.sin(i / 5) * 10 + 100);
    const full = rollingZScore(s, 15);
    const trunc = rollingZScore(s.slice(0, 40), 15);
    for (let i = 14; i < 40; i++) {
      if (full[i] == null || trunc[i] == null) continue;
      expect(trunc[i]).toBeCloseTo(full[i], 10);
    }
  });
});

describe("scaleHurstForOverlay", () => {
  it("centre 0.5 → 0", () => {
    expect(scaleHurstForOverlay([0.5, 0.75, 0.25], 4)).toEqual([0, 1, -1]);
  });
});

describe("buildMarketOscillators", () => {
  it("produit Z / Hurst / régime alignés", () => {
    const bars = makeBars({ n: 180, dtMs: DAY_MS, seed: 11, vol: 12 });
    const ctx = buildContext(bars);
    const osc = buildMarketOscillators(bars, ctx);
    expect(osc.zScore.length).toBe(bars.length);
    expect(osc.hurst.length).toBe(bars.length);
    expect(osc.regime.length).toBe(bars.length);
    expect(osc.current.zScore).not.toBeNull();
    expect(osc.current.hurst).not.toBeNull();
    expect(osc.regimeLabels).toHaveLength(4);
    expect(osc.meta.zWin).toBe(20);
  });

  it("CSV non vide", () => {
    const bars = makeBars({ n: 80, dtMs: DAY_MS, seed: 2 });
    const ctx = buildContext(bars);
    const csv = oscillatorsToCSV(bars, buildMarketOscillators(bars, ctx));
    expect(csv.split("\n").length).toBe(81);
    expect(csv.startsWith("t,close")).toBe(true);
  });
});
