import { describe, it, expect } from "vitest";
import {
  normalizeSignalRow,
  parseSignalHistory,
  alignSignalsToBars,
  replayExternalSignals,
  reverseEngineerRules,
  makeExternalSignalEval,
} from "../../src/engine/signalReverse.js";
import { makeBars, DAY_MS, T0 } from "../helpers/fixtures.js";
import { buildContext } from "../../src/engine/context.js";

describe("normalizeSignalRow", () => {
  it("accepte long/buy/short", () => {
    expect(normalizeSignalRow({ side: "long", t: T0 }).side).toBe(1);
    expect(normalizeSignalRow({ signal: "SELL", timestamp: T0 }).side).toBe(-1);
    expect(normalizeSignalRow({ side: 1, date: "2024-01-01T00:00:00Z" }).side).toBe(1);
  });
});

describe("parseSignalHistory", () => {
  it("parse JSON", () => {
    const { signals, format } = parseSignalHistory(
      JSON.stringify([
        { t: T0, side: "long" },
        { t: T0 + DAY_MS, side: "short" },
      ]),
    );
    expect(format).toBe("json");
    expect(signals).toHaveLength(2);
  });

  it("parse CSV avec header", () => {
    const csv = "date,side\n2024-01-01,buy\n2024-01-03,sell\n";
    const { signals, format } = parseSignalHistory(csv);
    expect(format).toBe("csv");
    expect(signals).toHaveLength(2);
    expect(signals[0].side).toBe(1);
    expect(signals[1].side).toBe(-1);
  });
});

describe("align + replay", () => {
  it("aligne causalement sur barres daily", () => {
    const bars = makeBars({ n: 10, dtMs: DAY_MS, seed: 1 });
    const signals = [
      { t: bars[2].t - 1000, side: 1 },
      { t: bars[5].t, side: -1 },
    ];
    const aligned = alignSignalsToBars(signals, bars);
    expect(aligned[0].index).toBe(2);
    expect(aligned[1].index).toBe(5);
  });

  it("replay produit des trades", () => {
    const bars = makeBars({ n: 120, dtMs: DAY_MS, seed: 7, vol: 15 });
    const ctx = buildContext(bars);
    const signals = [];
    for (let i = 20; i < 100; i += 15) {
      signals.push({ t: bars[i].t, side: i % 2 === 0 ? 1 : -1 });
    }
    const aligned = alignSignalsToBars(signals, bars);
    const res = replayExternalSignals(bars, ctx, aligned, { warmup: 10, slAtr: 2 });
    expect(aligned.length).toBeGreaterThan(3);
    expect(res.nSignals).toBe(aligned.length);
    expect(res.nTrades).toBeGreaterThan(0);
  });
});

describe("reverseEngineerRules", () => {
  it("propose des règles quand signaux cohérents avec un edge simple", () => {
    const bars = makeBars({ n: 200, dtMs: DAY_MS, seed: 42, drift: 0.5, vol: 8 });
    const ctx = buildContext(bars);
    // Signaux long quand close > ema20 (approx)
    const signals = [];
    for (let i = 60; i < 180; i++) {
      const c = ctx.close[i];
      const e = ctx.ema[20]?.[i];
      if (c != null && e != null && c > e) signals.push({ t: bars[i].t, side: 1 });
      if (c != null && e != null && c < e && i % 7 === 0) signals.push({ t: bars[i].t, side: -1 });
    }
    const aligned = alignSignalsToBars(signals, bars);
    const rev = reverseEngineerRules(bars, ctx, aligned, { topK: 3, minHits: 3 });
    expect(rev.nLong).toBeGreaterThan(5);
    expect(rev.long.length).toBeGreaterThan(0);
    const closeGtEma = rev.long.find((s) => s.left === "close" && s.op === "gt" && s.right === "ema20");
    expect(closeGtEma).toBeTruthy();
    expect(closeGtEma.hitRate).toBeGreaterThan(0.85);
    expect(rev.proposedRules.long.length + rev.proposedRules.short.length).toBeGreaterThan(0);
  });

  it("makeExternalSignalEval lit la map", () => {
    const fn = makeExternalSignalEval([{ index: 3, side: 1 }]);
    expect(fn({}, 3)).toEqual({ long: true, short: false });
    expect(fn({}, 4)).toEqual({ long: false, short: false });
  });
});
