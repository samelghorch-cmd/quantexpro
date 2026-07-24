// P4-GEX — tests gamma exposure / max pain / Deribit parse
import { describe, it, expect } from "vitest";
import {
  normPdf,
  bsGamma,
  parseDeribitInstrument,
  normalizeOptionRow,
  gexContribution,
  computeGexProfile,
  computeMaxPain,
  impliedMove,
  fromDeribitBookSummary,
  parseOptionsImport,
} from "../../src/engine/gex.js";

describe("bsGamma", () => {
  it("est positif ATM et 0 si T=0", () => {
    expect(bsGamma(100, 100, 0.25, 0.2)).toBeGreaterThan(0);
    expect(bsGamma(100, 100, 0, 0.2)).toBe(0);
    expect(normPdf(0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 6);
  });
});

describe("parseDeribitInstrument", () => {
  it("parse BTC-26JUL24-65000-C", () => {
    const p = parseDeribitInstrument("BTC-26JUL24-65000-C");
    expect(p.strike).toBe(65000);
    expect(p.right).toBe("C");
    expect(p.expiryMs).toBe(Date.UTC(2024, 6, 26, 8, 0, 0));
  });
});

describe("GEX profile", () => {
  const now = Date.UTC(2026, 6, 1);
  const expiry = Date.UTC(2026, 6, 24, 8);
  const rows = [
    normalizeOptionRow({ strike: 100, right: "C", oi: 100, iv: 0.3, expiryMs: expiry }, 100, now),
    normalizeOptionRow({ strike: 100, right: "P", oi: 80, iv: 0.3, expiryMs: expiry }, 100, now),
    normalizeOptionRow({ strike: 110, right: "C", oi: 50, iv: 0.3, expiryMs: expiry }, 100, now),
    normalizeOptionRow({ strike: 90, right: "P", oi: 120, iv: 0.3, expiryMs: expiry }, 100, now),
  ];

  it("calcule net GEX et PCR", () => {
    const g = computeGexProfile(rows, 100);
    expect(g.n).toBe(4);
    expect(g.callOi).toBe(150);
    expect(g.putOi).toBe(200);
    expect(g.pcrOi).toBeCloseTo(200 / 150, 5);
    expect(g.profile.length).toBe(3);
    expect(["LONG_GAMMA", "SHORT_GAMMA"]).toContain(g.regime);
  });

  it("call GEX > 0 et put GEX < 0", () => {
    const call = rows[0];
    const put = rows[1];
    expect(gexContribution(call, 100)).toBeGreaterThan(0);
    expect(gexContribution(put, 100)).toBeLessThan(0);
  });

  it("max pain entre les strikes", () => {
    const mp = computeMaxPain(rows);
    expect(mp.strike).toBeGreaterThanOrEqual(90);
    expect(mp.strike).toBeLessThanOrEqual(110);
  });

  it("implied move > 0", () => {
    const im = impliedMove(rows, 100, now);
    expect(im.moveAbs).toBeGreaterThan(0);
    expect(im.movePct).toBeGreaterThan(0);
  });
});

describe("Deribit + import", () => {
  it("fromDeribitBookSummary", () => {
    const { rows, spot } = fromDeribitBookSummary(
      [
        {
          instrument_name: "BTC-26JUL26-60000-C",
          open_interest: 10,
          mark_iv: 55,
          underlying_price: 65000,
        },
        {
          instrument_name: "BTC-26JUL26-70000-P",
          open_interest: 5,
          mark_iv: 50,
          underlying_price: 65000,
        },
      ],
      Date.UTC(2026, 6, 1),
    );
    expect(spot).toBe(65000);
    expect(rows).toHaveLength(2);
    expect(rows[0].gamma).toBeGreaterThan(0);
  });

  it("parseOptionsImport", () => {
    const { rows, spot } = parseOptionsImport({
      spot: 100,
      options: [
        { strike: 100, right: "C", oi: 1, gamma: 0.02 },
        { strike: 100, right: "P", oi: 1, gamma: 0.02 },
      ],
    });
    expect(spot).toBe(100);
    expect(rows).toHaveLength(2);
  });
});
