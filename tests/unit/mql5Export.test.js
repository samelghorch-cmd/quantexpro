// P2-MQL5 — export EA familles simples
import { describe, it, expect } from "vitest";
import {
  listSupportedFamilies,
  resolveFamily,
  generateEA,
  STRATEGY_EXPORT_META,
  SUPPORTED_FAMILIES,
} from "../../src/engine/mql5Export.js";

describe("listSupportedFamilies", () => {
  it("expose les 5 familles v1", () => {
    const ids = listSupportedFamilies().map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining([
      "maCross", "rsiRev", "macdCross", "donchianBreak", "bbBounce",
    ]));
    expect(ids).toHaveLength(5);
  });
});

describe("resolveFamily", () => {
  it("résout EMA Golden Cross #1", () => {
    const r = resolveFamily(1);
    expect(r.supported).toBe(true);
    expect(r.family).toBe("maCross");
    expect(r.params).toEqual({ type: "ema", fast: 50, slow: 200 });
  });

  it("accepte un objet strat", () => {
    expect(resolveFamily({ id: 16 }).family).toBe("rsiRev");
    expect(resolveFamily({ strategyId: 31 }).family).toBe("donchianBreak");
  });

  it("marque proxy sur KAMA #10", () => {
    expect(resolveFamily(10).proxy).toBe(true);
  });

  it("unsupported pour id inconnu", () => {
    const r = resolveFamily(99999);
    expect(r.supported).toBe(false);
    expect(r.family).toBeNull();
  });
});

describe("generateEA", () => {
  it("génère maCross avec iMA et params trade", () => {
    const ea = generateEA({
      strategyId: 2,
      name: "EMA 9/21 Cross",
      symbol: "EURUSD",
      params: { slAtr: 1.5, tpAtr: 3, beAtr: 1, direction: "long" },
    });
    expect(ea.supported).toBe(true);
    expect(ea.family).toBe("maCross");
    expect(ea.code).toContain("iMA");
    expect(ea.code).toContain("OnTick");
    expect(ea.code).toContain("SL_ATR_Mult   = 1.5");
    expect(ea.code).toContain("TP_ATR_Mult   = 3");
    expect(ea.code).toContain('Direction     = "long"');
    expect(ea.code).toContain("FastPeriod = 9");
    expect(ea.code).toContain("SlowPeriod = 21");
    expect(ea.filename).toMatch(/\.mq5$/);
    expect(ea.filename).not.toMatch(/[^A-Za-z0-9_.]/);
  });

  it("génère rsiRev / macd / donchian / bb", () => {
    expect(generateEA({ strategyId: 16, name: "RSI" }).code).toContain("iRSI");
    expect(generateEA({ strategyId: 3, name: "MACD" }).code).toContain("iMACD");
    expect(generateEA({ strategyId: 31, name: "Don" }).code).toContain("iHighest");
    expect(generateEA({ strategyId: 22, name: "BB" }).code).toContain("iBands");
  });

  it("stub + warning si famille non supportée", () => {
    const ea = generateEA({ strategyId: 4, name: "SuperTrend" });
    expect(ea.supported).toBe(false);
    expect(ea.warnings.length).toBeGreaterThan(0);
    expect(ea.code).toContain("stub");
  });

  it("warning proxy sur id proxy", () => {
    const ea = generateEA({ strategyId: 10, name: "KAMA" });
    expect(ea.supported).toBe(true);
    expect(ea.warnings.some((w) => /approximatif|proxy|famille/i.test(w))).toBe(true);
  });

  it("meta couvre uniquement des familles supportées", () => {
    for (const [id, meta] of Object.entries(STRATEGY_EXPORT_META)) {
      expect(SUPPORTED_FAMILIES[meta.family], `id ${id}`).toBeTruthy();
    }
  });
});
