// P4-AF — Alpha Forge Validated Edges
import { describe, it, expect, beforeEach } from "vitest";
import {
  ELIGIBLE_LETTERS,
  edgeFingerprint,
  extractMetricsFromStages,
  isEligibleDossier,
  dossierToEdge,
  promoteFromDossier,
  addValidatedEdge,
  retireEdge,
  removeEdge,
  clearValidatedEdges,
  loadValidatedEdges,
  listActiveEdges,
  edgesToCsv,
} from "../../src/engine/validatedEdges.ts";

beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  clearValidatedEdges();
});

function makeDossier(overrides = {}) {
  return {
    id: "dos-1",
    name: "ORB Gold M15",
    strategyId: 42,
    symbol: "XAUUSD",
    tf: "15m",
    params: { slAtr: 1.5, tpAtr: 2.5, beAtr: 1, direction: "both" },
    toolsApplied: ["Backtest", "FAO", "Validator", "Reco Finale"],
    stages: {
      backtest: {
        result: {
          metrics: { sharpe: 1.8, profitFactor: 1.9, maxDd: 0.12, winrate: 0.58, trades: 120 },
          trades: new Array(120).fill({ pnl: 1 }),
        },
      },
      reco: {
        components: [{ name: "Deflated Sharpe (anti-overfit)", value: 72 }],
      },
    },
    grade: { verdict: "GO", score: 78, letter: "B" },
    ...overrides,
  };
}

describe("edgeFingerprint", () => {
  it("est stable pour les mêmes params clés", () => {
    const a = edgeFingerprint({ strategyId: 1, symbol: "btc", tf: "1h", params: { slAtr: 1, tpAtr: 2 } });
    const b = edgeFingerprint({ strategyId: 1, symbol: "BTC", tf: "1H", params: { slAtr: 1, tpAtr: 2, noise: 99 } });
    expect(a).toBe(b);
  });

  it("change si slAtr change", () => {
    const a = edgeFingerprint({ strategyId: 1, symbol: "BTC", tf: "1h", params: { slAtr: 1 } });
    const b = edgeFingerprint({ strategyId: 1, symbol: "BTC", tf: "1h", params: { slAtr: 2 } });
    expect(a).not.toBe(b);
  });
});

describe("isEligibleDossier", () => {
  it("accepte GO + A/B/C", () => {
    expect(isEligibleDossier(makeDossier()).ok).toBe(true);
    expect(isEligibleDossier(makeDossier({ grade: { verdict: "GO", score: 90, letter: "A" } })).ok).toBe(true);
    expect(ELIGIBLE_LETTERS.has("C")).toBe(true);
  });

  it("refuse NO-GO / REWORK / lettre D", () => {
    expect(isEligibleDossier(makeDossier({ grade: { verdict: "NO-GO", score: 40, letter: "F" } })).ok).toBe(false);
    expect(isEligibleDossier(makeDossier({ grade: { verdict: "REWORK", score: 55, letter: "D" } })).ok).toBe(false);
    expect(isEligibleDossier(makeDossier({ grade: { verdict: "GO", score: 55, letter: "D" } })).ok).toBe(false);
    expect(isEligibleDossier({ name: "x" }).ok).toBe(false);
  });
});

describe("extractMetricsFromStages", () => {
  it("lit métriques backtest + DSR reco", () => {
    const m = extractMetricsFromStages(makeDossier().stages);
    expect(m.sharpe).toBe(1.8);
    expect(m.profitFactor).toBe(1.9);
    expect(m.dsr).toBeCloseTo(0.72, 5);
  });
});

describe("promoteFromDossier", () => {
  it("crée une entrée active", () => {
    const { entry, created } = promoteFromDossier(makeDossier());
    expect(created).toBe(true);
    expect(entry.status).toBe("active");
    expect(entry.letter).toBe("B");
    expect(entry.strategyId).toBe(42);
    expect(listActiveEdges()).toHaveLength(1);
  });

  it("upsert sur même fingerprint (pas de doublon)", () => {
    promoteFromDossier(makeDossier());
    const { created, entry } = promoteFromDossier(
      makeDossier({ name: "ORB Gold M15 v2", grade: { verdict: "GO", score: 82, letter: "A" } }),
    );
    expect(created).toBe(false);
    expect(entry.score).toBe(82);
    expect(entry.letter).toBe("A");
    expect(loadValidatedEdges()).toHaveLength(1);
  });

  it("rejette dossier non GO", () => {
    expect(() => promoteFromDossier(makeDossier({ grade: { verdict: "NO-GO", score: 20, letter: "F" } }))).toThrow(
      /GO/,
    );
  });
});

describe("add / retire / remove / csv", () => {
  it("addValidatedEdge + retire + remove", () => {
    const e = addValidatedEdge({
      name: "Manual Edge",
      strategyId: 7,
      symbol: "EURUSD",
      tf: "1h",
      letter: "A",
      verdict: "GO",
      score: 88,
    });
    expect(listActiveEdges()).toHaveLength(1);
    retireEdge(e.id);
    expect(listActiveEdges()).toHaveLength(0);
    expect(loadValidatedEdges()[0].status).toBe("retired");
    removeEdge(e.id);
    expect(loadValidatedEdges()).toHaveLength(0);
  });

  it("refuse add hors critères", () => {
    expect(() => addValidatedEdge({ name: "x", letter: "D", verdict: "GO" })).toThrow(/A, B ou C/);
    expect(() => addValidatedEdge({ name: "x", letter: "A", verdict: "REWORK" })).toThrow(/GO/);
  });

  it("edgesToCsv contient header + ligne", () => {
    promoteFromDossier(makeDossier());
    const csv = edgesToCsv();
    expect(csv.split("\n")[0]).toContain("strategyId");
    expect(csv).toContain("ORB Gold M15");
    expect(csv).toContain("XAUUSD");
  });
});

describe("dossierToEdge", () => {
  it("copie fingerprint et métriques", () => {
    const edge = dossierToEdge(makeDossier({ notes: "desk review" }));
    expect(edge.fingerprint).toBe(
      edgeFingerprint({
        strategyId: 42,
        symbol: "XAUUSD",
        tf: "15m",
        params: { slAtr: 1.5, tpAtr: 2.5, beAtr: 1, direction: "both" },
      }),
    );
    expect(edge.metrics.sharpe).toBe(1.8);
  });
});
