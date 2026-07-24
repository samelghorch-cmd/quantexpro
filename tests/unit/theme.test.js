import { describe, it, expect } from "vitest";
import { T, sideColor, pnlColor, verdictColor } from "../../src/components/shared/theme.js";

describe("P6-THEME tokens", () => {
  it("expose long/short audit + card", () => {
    expect(T.long.toLowerCase()).toBe("#00e676");
    expect(T.short.toLowerCase()).toBe("#ff1744");
    expect(T.card.toLowerCase()).toBe("#161920");
    expect(T.bg1.toLowerCase()).toBe("#0d0f12");
  });

  it("sideColor mappe directions", () => {
    expect(sideColor(1)).toBe(T.long);
    expect(sideColor(-1)).toBe(T.short);
    expect(sideColor("buy")).toBe(T.long);
    expect(sideColor("SELL")).toBe(T.short);
    expect(sideColor("flat")).toBe(T.textDim);
  });

  it("pnlColor reste green/red statut", () => {
    expect(pnlColor(1.2)).toBe(T.green);
    expect(pnlColor(-0.5)).toBe(T.red);
    expect(verdictColor("GO")).toBe(T.green);
  });
});
