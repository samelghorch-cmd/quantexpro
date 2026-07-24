// P1-TCA — Transaction Cost Analysis
import { describe, it, expect, beforeEach } from "vitest";
import {
  slipBps,
  slipUsd,
  modelCostBps,
  modelCostForAsset,
  classIdForAsset,
  fillsFromTrades,
  runTCA,
  addTcaFill,
  loadTcaFills,
  clearTcaFills,
  TCA_WORSE_RATIO,
  TCA_BETTER_RATIO,
} from "../../src/engine/tca.ts";
import { COST_MODELS } from "../../src/engine/costModel.js";

beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
});

describe("slipBps", () => {
  it("long adverse si fill > signal", () => {
    // +10 bps
    expect(slipBps(100, 100.1, 1)).toBeCloseTo(10, 5);
  });
  it("short adverse si fill < signal", () => {
    expect(slipBps(100, 99.9, -1)).toBeCloseTo(10, 5);
  });
  it("slipUsd proportionnel au notionnel", () => {
    expect(slipUsd(100, 100.1, 1, 100000)).toBeCloseTo(100, 5);
  });
});

describe("modelCostBps", () => {
  it("crypto = fee+spread one-way en bps", () => {
    const m = COST_MODELS.crypto;
    const r = modelCostBps("crypto");
    expect(r.oneWayBps).toBeCloseTo((m.feePct + m.spreadPct) * 1e4, 6);
    expect(r.roundTripBps).toBeCloseTo(r.oneWayBps * 2, 6);
  });
  it("classe inconnue → synthetic", () => {
    expect(modelCostBps("nope").classId).toBe("synthetic");
  });
});

describe("classIdForAsset / modelCostForAsset", () => {
  it("BTC → crypto", () => {
    expect(classIdForAsset("BTC")).toBe("crypto");
    const r = modelCostForAsset("BTC", 50000);
    expect(r.oneWayBps).toBeGreaterThan(0);
  });
});

describe("fillsFromTrades", () => {
  it("utilise next-open comme fill observé", () => {
    const bars = [
      { t: 1000, o: 99, h: 101, l: 98, c: 100, v: 1 },
      { t: 2000, o: 100.5, h: 102, l: 100, c: 101, v: 1 },
      { t: 3000, o: 101, h: 103, l: 100.5, c: 102, v: 1 },
    ];
    const trades = [{ entry: 100, exit: 102, side: 1, entryTime: 1000, exitTime: 3000, pnl: 2000, ret: 0.02 }];
    const fills = fillsFromTrades(trades, bars, { notional: 100000 });
    expect(fills).toHaveLength(1);
    expect(fills[0].source).toBe("next_open");
    expect(fills[0].fillPrice).toBe(100.5);
    expect(fills[0].entrySlipBps).toBeCloseTo(50, 5); // +0.5 %
  });

  it("same_bar si pas de barre suivante", () => {
    const bars = [{ t: 1000, o: 99, h: 101, l: 98, c: 100, v: 1 }];
    const fills = fillsFromTrades([{ entry: 100, exit: 100, side: 1, entryTime: 1000, exitTime: 1000 }], bars);
    expect(fills[0].source).toBe("same_bar");
    expect(fills[0].entrySlipBps).toBe(0);
  });
});

describe("runTCA", () => {
  it("INSUFFICIENT sans fills", () => {
    const r = runTCA([], { classId: "crypto" });
    expect(r.verdict).toBe("INSUFFICIENT");
    expect(r.n).toBe(0);
  });

  it("WORSE_THAN_MODEL si slip >> modèle", () => {
    // crypto one-way ~ 6 bps ; 100 bps observé → ratio >> 1.3
    const fills = [{ signalPrice: 100, fillPrice: 101, side: 1, notional: 100000 }];
    const r = runTCA(fills, { classId: "crypto" });
    expect(r.ratio).toBeGreaterThan(TCA_WORSE_RATIO);
    expect(r.verdict).toBe("WORSE_THAN_MODEL");
    expect(r.calibration.suggestedSpreadPct).toBeGreaterThan(0);
  });

  it("BETTER_THAN_MODEL si slip quasi nul", () => {
    const fills = [{ signalPrice: 100, fillPrice: 100.0001, side: 1, notional: 100000 }];
    const r = runTCA(fills, { classId: "crypto" });
    expect(r.ratio).toBeLessThan(TCA_BETTER_RATIO);
    expect(r.verdict).toBe("BETTER_THAN_MODEL");
  });

  it("CALIBRATED autour du modèle", () => {
    const m = modelCostBps("forex");
    // fill pour ~ exactly model one-way bps
    const fill = 100 * (1 + m.oneWayBps / 1e4);
    const r = runTCA([{ signalPrice: 100, fillPrice: fill, side: 1, notional: 1e5 }], { classId: "forex" });
    expect(r.verdict).toBe("CALIBRATED");
  });
});

describe("manual fills store", () => {
  it("add / load / clear", () => {
    clearTcaFills();
    addTcaFill({ signalPrice: 10, fillPrice: 10.02, side: "long", notional: 50_000 });
    expect(loadTcaFills()).toHaveLength(1);
    expect(loadTcaFills()[0].entrySlipBps).toBeCloseTo(20, 4);
    clearTcaFills();
    expect(loadTcaFills()).toHaveLength(0);
  });
});
