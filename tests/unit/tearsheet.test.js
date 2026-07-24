// P1-PDF — tearsheet + pdfLite
import { describe, it, expect } from "vitest";
import { buildTextPdf } from "../../src/engine/pdfLite.js";
import {
  buildTearsheetModel,
  tearsheetLines,
  generateTearsheetPdf,
} from "../../src/engine/tearsheet.js";

const sampleDossier = {
  id: "abc123",
  name: "EMA Cross Gold",
  strategyId: 3,
  symbol: "GOLD",
  tf: 12,
  dataMode: "live",
  params: { slAtr: 2, tpAtr: 3, direction: "both" },
  toolsApplied: ["Backtest", "Full Auto Optim", "Reco Finale"],
  grade: { letter: "B", verdict: "GO", score: 78, gradedAt: 1_700_000_000_000 },
  stages: {
    backtest: {
      ranAt: 1_700_000_000_000,
      res: {
        nTrades: 42,
        winRate: 55.5,
        profitFactor: 1.8,
        sharpe: 1.4,
        sortino: 1.9,
        maxDD: 0.12,
        expectancyR: 0.35,
        totalPnL: 12345.67,
        totalPnLPct: 12.3,
      },
    },
    fao: {
      attempts: 150,
      combos: [{}, {}, {}],
      best: { expectancyR: 0.5, profitFactor: 2.1, sharpe: 1.6 },
    },
    validator: {
      verdict: "PASS",
      gates: [{ name: "Block Bootstrap", verdict: "PASS" }, { name: "GBM", verdict: "WARN" }],
    },
    reco: { verdict: "GO", finalScore: 78, nTrials: 100 },
  },
  demoSessions: [{ id: "s1" }],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
};

describe("buildTearsheetModel", () => {
  it("refuse un dossier vide", () => {
    expect(() => buildTearsheetModel(null)).toThrow(/dossier/);
  });

  it("extrait identité, grade, backtest, FAO, validator, reco", () => {
    const m = buildTearsheetModel(sampleDossier);
    expect(m.identity.name).toBe("EMA Cross Gold");
    expect(m.identity.strategyId).toBe(3);
    expect(m.grade.letter).toBe("B");
    expect(m.backtest.nTrades).toBe(42);
    expect(m.fao.retained).toBe(3);
    expect(m.validator.gates).toHaveLength(2);
    expect(m.reco.finalScore).toBe(78);
    expect(m.demoSessions).toBe(1);
    expect(m.disclaimer).toMatch(/risque/i);
  });

  it("gère un dossier minimal sans stages", () => {
    const m = buildTearsheetModel({ id: "x", name: "Empty" });
    expect(m.backtest).toBeNull();
    expect(m.grade).toBeNull();
    expect(m.toolsApplied).toEqual([]);
  });
});

describe("tearsheetLines", () => {
  it("contient les sections clés et le disclaimer", () => {
    const lines = tearsheetLines(buildTearsheetModel(sampleDossier));
    const text = lines.join("\n");
    expect(text).toContain("INVESTOR TEARSHEET");
    expect(text).toContain("EMA Cross Gold");
    expect(text).toContain("## 4. Backtest");
    expect(text).toContain("## 9. Disclaimer");
    expect(text).toMatch(/risque/i);
  });
});

describe("buildTextPdf / generateTearsheetPdf", () => {
  it("produit un PDF valide (header + EOF)", () => {
    const bytes = buildTextPdf(["Hello", "## Title", "Line 2"], { title: "Test" });
    const head = String.fromCharCode(...bytes.slice(0, 8));
    expect(head).toBe("%PDF-1.4");
    const tail = String.fromCharCode(...bytes.slice(-6));
    expect(tail).toContain("EOF");
  });

  it("generateTearsheetPdf retourne bytes + filename + model", () => {
    const { bytes, filename, model, lines } = generateTearsheetPdf(sampleDossier, { generatedAt: 1_700_000_000_000 });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(200);
    expect(filename).toMatch(/^tearsheet_.*\.pdf$/);
    expect(model.identity.name).toBe("EMA Cross Gold");
    expect(lines.some((l) => l.includes("Backtest"))).toBe(true);
    const asStr = new TextDecoder().decode(bytes);
    expect(asStr).toContain("%PDF-1.4");
    expect(asStr).toContain("%%EOF");
    expect(asStr).toContain("QuantEXPro");
  });

  it("multi-pages si beaucoup de lignes", () => {
    const many = Array.from({ length: 120 }, (_, i) => `Ligne numero ${i}`);
    const bytes = buildTextPdf(many, { title: "Long" });
    const asStr = new TextDecoder().decode(bytes);
    expect(asStr).toMatch(/Page 1\/\d+/);
    expect(asStr).toMatch(/Page 2\/\d+/);
  });
});
