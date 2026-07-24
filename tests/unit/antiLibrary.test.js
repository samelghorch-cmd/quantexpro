// P1-ANT — Anti-Library (concepts involutifs)
import { describe, it, expect, beforeEach } from "vitest";
import {
  SEED_CONCEPTS,
  ensureSeeded,
  addAntiEntry,
  removeAntiEntry,
  clearAntiLibrary,
  isStrategyBlocked,
  findBlockingEntry,
  filterLibrary,
  blockedStrategyIds,
  loadAntiLibrary,
} from "../../src/engine/antiLibrary.js";

beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
});

describe("ensureSeeded", () => {
  it("insère les 5 concepts seedés une seule fois", () => {
    const a = ensureSeeded();
    expect(a).toHaveLength(SEED_CONCEPTS.length);
    expect(a.every((e) => e.seeded)).toBe(true);
    const b = ensureSeeded();
    expect(b).toHaveLength(SEED_CONCEPTS.length);
  });
});

describe("matching", () => {
  it("bloque par strategyId explicite (Z-Score #21)", () => {
    ensureSeeded();
    expect(isStrategyBlocked({ id: 21, name: "Autre nom" })).toBe(true);
    expect(findBlockingEntry({ id: 21, name: "x" })?.conceptId).toBe("zscore_mr");
  });

  it("bloque par regex sur le nom (TRIX paramétré)", () => {
    ensureSeeded();
    expect(isStrategyBlocked({ id: 9999, name: "TRIX(14) Zero Cross" })).toBe(true);
    expect(isStrategyBlocked({ id: 9999, name: "EMA Cross Classic" })).toBe(false);
  });

  it("bloque Bollinger Bounce via pattern, pas Breakout", () => {
    ensureSeeded();
    expect(isStrategyBlocked({ id: 1, name: "Bollinger 20/2 Bounce" })).toBe(true);
    expect(isStrategyBlocked({ id: 1, name: "Bollinger 20/2 Breakout" })).toBe(false);
  });
});

describe("CRUD", () => {
  it("ajoute / retire une entrée manuelle", () => {
    ensureSeeded();
    const e = addAntiEntry({
      conceptId: "custom_macd",
      label: "MACD junk",
      reason: "test",
      namePattern: "\\bmacd\\b",
      strategyIds: [3],
    });
    expect(loadAntiLibrary().some((x) => x.conceptId === "custom_macd")).toBe(true);
    expect(isStrategyBlocked({ id: 3, name: "x" })).toBe(true);
    expect(isStrategyBlocked({ id: 99, name: "MACD Signal" })).toBe(true);

    removeAntiEntry(e.id);
    expect(loadAntiLibrary().some((x) => x.conceptId === "custom_macd")).toBe(false);
  });

  it("refuse un conceptId en double", () => {
    ensureSeeded();
    expect(() => addAntiEntry({ conceptId: "zscore_mr" })).toThrow(/déjà présent/);
  });

  it("clearAntiLibrary keepSeeded restaure les seeds", () => {
    ensureSeeded();
    addAntiEntry({ conceptId: "tmp", label: "tmp" });
    const next = clearAntiLibrary({ keepSeeded: true });
    expect(next).toHaveLength(SEED_CONCEPTS.length);
    expect(next.every((e) => e.seeded)).toBe(true);
  });
});

describe("filterLibrary / blockedStrategyIds", () => {
  it("filtre la lib et expose les IDs bloqués", () => {
    const entries = ensureSeeded();
    const lib = [
      { id: 21, name: "Z-Score ±2σ Reversion" },
      { id: 3, name: "EMA Cross" },
      { id: 50, name: "TRIX Zero Cross" },
    ];
    const kept = filterLibrary(lib, entries);
    expect(kept.map((s) => s.id)).toEqual([3]);
    expect(blockedStrategyIds(lib, entries).sort()).toEqual([21, 50]);
  });
});
