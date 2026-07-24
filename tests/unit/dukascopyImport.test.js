// P2-DUKA — schéma import Dukascopy / séries profondes
import { describe, it, expect } from "vitest";
import {
  normalizeDukaRows,
  validateImportSeries,
  parseImportPayload,
  yearChunks,
  DUKA_TF,
  DUKA_INSTRUMENT,
} from "../../src/engine/dukascopyImport.js";

function makeBars(n, start = Date.UTC(2020, 0, 1), step = 3600_000) {
  return Array.from({ length: n }, (_, i) => {
    const t = start + i * step;
    const o = 1.1 + i * 0.0001;
    return { t, o, h: o + 0.001, l: o - 0.001, c: o + 0.0005, v: 100 + i };
  });
}

describe("DUKA maps", () => {
  it("expose TF et instruments clés", () => {
    expect(DUKA_TF.h1).toBe(12);
    expect(DUKA_TF.d1).toBe(288);
    expect(DUKA_INSTRUMENT.EURUSD).toBe("eurusd");
    expect(DUKA_INSTRUMENT.GOLD).toBe("xauusd");
  });
});

describe("normalizeDukaRows", () => {
  it("accepte format duka timestamp/open et dédoublonne", () => {
    const rows = [
      { timestamp: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
      { timestamp: 1000, open: 1.1, high: 2.1, low: 0.6, close: 1.6, volume: 11 },
      { t: 2000, o: 1.2, h: 2.2, l: 0.7, c: 1.7, v: 12 },
    ];
    const bars = normalizeDukaRows(rows);
    expect(bars).toHaveLength(2);
    expect(bars[0].o).toBe(1.1);
    expect(bars[1].t).toBe(2000);
  });

  it("rejette OHLC incohérent", () => {
    expect(normalizeDukaRows([{ t: 1, o: 2, h: 1, l: 0, c: 1, v: 0 }])).toHaveLength(0);
  });
});

describe("validateImportSeries", () => {
  it("valide une série minimale", () => {
    const r = validateImportSeries({
      symbolKey: "eurusd",
      tf: 12,
      bars: makeBars(20),
    });
    expect(r.ok).toBe(true);
    expect(r.series.symbolKey).toBe("EURUSD");
    expect(r.series.meta.n).toBe(20);
    expect(r.series.provider).toBe("dukascopy");
  });

  it("rejette tf et trop peu de barres", () => {
    const r = validateImportSeries({ symbolKey: "X", tf: 7, bars: makeBars(3) });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("tf"))).toBe(true);
    expect(r.errors.some((e) => e.includes("barres"))).toBe(true);
  });
});

describe("parseImportPayload", () => {
  it("sépare OK / failed sur un tableau", () => {
    const { ok, failed, total } = parseImportPayload([
      { symbolKey: "GOLD", tf: 288, bars: makeBars(15) },
      { symbolKey: "BAD", tf: 12, bars: [] },
    ]);
    expect(total).toBe(2);
    expect(ok).toHaveLength(1);
    expect(ok[0].symbolKey).toBe("GOLD");
    expect(failed).toHaveLength(1);
  });
});

describe("yearChunks", () => {
  it("découpe 2008→2010 en années", () => {
    const chunks = yearChunks("2008-01-01", "2010-06-15");
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks[0].from.toISOString().slice(0, 10)).toBe("2008-01-01");
    expect(chunks[0].to.toISOString().slice(0, 10)).toBe("2009-01-01");
    expect(chunks[chunks.length - 1].to.toISOString().slice(0, 10)).toBe("2010-06-15");
  });

  it("retourne [] si from >= to", () => {
    expect(yearChunks("2020-01-01", "2019-01-01")).toEqual([]);
  });
});
