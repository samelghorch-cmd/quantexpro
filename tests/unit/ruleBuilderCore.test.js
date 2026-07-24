import { describe, it, expect } from "vitest";
import { IND } from "../../src/engine/indicators.js";
import { buildContext } from "../../src/engine/context.js";
import { RULE_SOURCES, compileRules } from "../../src/engine/ruleBuilder.ts";
import { validateRules } from "../../src/engine/customStrategies.js";
import { makeBars, DAY_MS } from "../helpers/fixtures.js";

describe("IND.kama / linreg", () => {
  it("KAMA produit des valeurs après warmup", () => {
    const arr = Array.from({ length: 80 }, (_, i) => 100 + i * 0.2 + Math.sin(i / 3));
    const k = IND.kama(arr, 10);
    expect(Number.isFinite(k[30])).toBe(true);
    expect(Number.isNaN(k[0])).toBe(true);
  });

  it("LinReg causal : troncature stable", () => {
    const arr = Array.from({ length: 60 }, (_, i) => 50 + i * 0.5);
    const full = IND.linreg(arr, 20);
    const trunc = IND.linreg(arr.slice(0, 40), 20);
    for (let i = 19; i < 40; i++) {
      expect(trunc[i]).toBeCloseTo(full[i], 8);
    }
  });
});

describe("P4-CORE Rule Builder sources", () => {
  const ids = RULE_SOURCES.map((s) => s.id);

  it("expose kama / linreg / ichimoku", () => {
    for (const id of ["kama10", "kama21", "linreg20", "linreg50", "ichTenkan", "ichKijun", "ichSpanA", "ichSpanB"]) {
      expect(ids).toContain(id);
    }
  });

  it("validateRules accepte close > kama21", () => {
    const rules = validateRules({
      long: [{ left: "close", op: "gt", right: "kama21" }],
      short: [{ left: "close", op: "lt", right: "ichKijun" }],
    });
    expect(rules.long[0].right).toBe("kama21");
  });

  it("compileRules évalue sur contexte réel", () => {
    const bars = makeBars({ n: 120, dtMs: DAY_MS, seed: 5, vol: 10 });
    const ctx = buildContext(bars);
    expect(ctx.kama[21].some(Number.isFinite)).toBe(true);
    expect(ctx.linreg[20].some(Number.isFinite)).toBe(true);
    expect(ctx.ich["9_26"].tk.some(Number.isFinite)).toBe(true);
    const fn = compileRules({
      long: [{ left: "close", op: "gt", right: "linreg20" }],
      short: [{ left: "ichTenkan", op: "crossDn", right: "ichKijun" }],
    });
    const sig = fn(ctx, 80);
    expect(typeof sig.long).toBe("boolean");
    expect(typeof sig.short).toBe("boolean");
  });
});
