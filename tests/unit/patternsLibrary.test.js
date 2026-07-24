import { describe, it, expect, beforeEach } from "vitest";
import {
  TIMEFRAMES,
  TF_FAMILIES,
  buildPatternsLibrary,
  filterPatterns,
  countByTimeframe,
  clearPatternsCache,
  PATTERN_FILTERS,
} from "../../src/engine/patternsLibrary.ts";

beforeEach(() => clearPatternsCache());

describe("P4-PAT timeframes M1–MN", () => {
  it("expose la grille complète", () => {
    expect(TIMEFRAMES).toEqual(["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN"]);
    expect(PATTERN_FILTERS.TIMEFRAMES).toContain("M1");
    expect(PATTERN_FILTERS.TIMEFRAMES).toContain("MN");
  });

  it("distribue les 616 patterns sur tous les TF", () => {
    const patterns = buildPatternsLibrary(616);
    expect(patterns).toHaveLength(616);
    const counts = countByTimeframe(patterns);
    for (const tf of TIMEFRAMES) {
      expect(counts[tf]).toBeGreaterThan(0);
    }
  });

  it("filtre par timeframe exact", () => {
    const patterns = buildPatternsLibrary(616);
    const m1 = filterPatterns(patterns, { timeframe: "M1" });
    expect(m1.every((p) => p.timeframe === "M1")).toBe(true);
    expect(m1.length).toBe(countByTimeframe(patterns).M1);
  });

  it("filtre par famille scalp / swing", () => {
    const patterns = buildPatternsLibrary(616);
    const scalp = filterPatterns(patterns, { tfFamily: "scalp" });
    expect(scalp.every((p) => TF_FAMILIES.scalp.includes(p.timeframe))).toBe(true);
    const swing = filterPatterns(patterns, { tfFamily: "swing" });
    expect(swing.every((p) => ["D1", "W1", "MN"].includes(p.timeframe))).toBe(true);
  });

  it("build est déterministe", () => {
    clearPatternsCache();
    const a = buildPatternsLibrary(50).map((p) => `${p.id}:${p.timeframe}:${p.assets.join("+")}`);
    clearPatternsCache();
    const b = buildPatternsLibrary(50).map((p) => `${p.id}:${p.timeframe}:${p.assets.join("+")}`);
    expect(a).toEqual(b);
  });
});
