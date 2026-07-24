// P4-DESK — Desk PM unifié
import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_DESK_CONFIG,
  normalizeConfig,
  loadDeskConfig,
  saveDeskConfig,
  dossierDemoPnL,
  buildDeskBook,
  computeDeskMetrics,
  buildPmDesk,
  deskToCsv,
} from "../../src/engine/portfolioDesk.ts";

beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
});

describe("config", () => {
  it("normalise et persiste", () => {
    const c = saveDeskConfig({ capital: 486_000, riskBudgetPct: 1.4 });
    expect(c.capital).toBe(486_000);
    expect(c.riskBudgetPct).toBe(1.4);
    expect(loadDeskConfig().capital).toBe(486_000);
    expect(normalizeConfig({ capital: -1 }).capital).toBeGreaterThanOrEqual(1000);
  });
});

describe("dossierDemoPnL", () => {
  it("somme les sessions", () => {
    const d = {
      demoSessions: [
        { finalMetrics: { sessionPnL: 100 }, trades: [{}, {}] },
        { finalMetrics: { sessionPnL: -30 }, trades: [{}] },
      ],
    };
    expect(dossierDemoPnL(d)).toEqual({ pnl: 70, trades: 3, sessions: 2 });
  });
});

describe("buildPmDesk", () => {
  const dossiers = [
    {
      id: "d1",
      name: "ORB Gold",
      strategyId: 10,
      symbol: "XAUUSD",
      tf: "15m",
      grade: { verdict: "GO", score: 80, letter: "B" },
      demoSessions: [{ finalMetrics: { sessionPnL: 1200 }, trades: [{}, {}, {}] }],
      stages: { backtest: { res: { totalPnL: 5000, nTrades: 40 } } },
    },
    {
      id: "d2",
      name: "Research only",
      strategyId: 11,
      grade: { verdict: "REWORK", score: 55, letter: "D" },
    },
  ];
  const edges = [
    {
      id: "e1",
      name: "ORB Gold Edge",
      strategyId: 10,
      symbol: "XAUUSD",
      tf: "15m",
      letter: "B",
      score: 80,
      status: "active",
      dossierId: "d1",
      fingerprint: "fp1",
    },
  ];
  const jobs = [{ id: "j1", name: "BTC 24/7", strategyId: 3, symbol: "BTCUSDT", status: "running", pnl: 50, nTrades: 5 }];

  it("agrège equity 486k + réserve type 1.4%", () => {
    const desk = buildPmDesk({
      dossiers,
      edges,
      jobs,
      config: { capital: 486_000, riskBudgetPct: 1.4, riskPerSleevePct: 0.25 },
    });
    expect(desk.metrics.capital).toBe(486_000);
    expect(desk.metrics.riskBudget).toBeCloseTo(486_000 * 0.014, 5);
    expect(desk.metrics.realizedPnL).toBe(1250); // 1200 demo + 50 job
    expect(desk.metrics.equity).toBe(486_000 + 1250);
    expect(desk.metrics.nGo).toBeGreaterThanOrEqual(1);
    expect(desk.sleeves.some((s) => s.kind === "validated_edge")).toBe(true);
    expect(desk.sleeves.some((s) => s.kind === "collector_job")).toBe(true);
    // d2 REWORK sans démo → exclu
    expect(desk.sleeves.some((s) => s.id === "dos:d2")).toBe(false);
  });

  it("détecte overload si trop de sleeves", () => {
    const manyEdges = Array.from({ length: 20 }, (_, i) => ({
      id: `e${i}`,
      name: `E${i}`,
      status: "active",
      strategyId: i,
    }));
    const book = buildDeskBook({
      edges: manyEdges,
      config: { capital: 100_000, riskBudgetPct: 1.4, riskPerSleevePct: 0.25 },
    });
    const m = computeDeskMetrics(book);
    expect(m.overloaded).toBe(true);
    expect(m.riskUsedPct).toBeGreaterThan(100);
  });

  it("csv non vide", () => {
    const desk = buildPmDesk({ dossiers, edges, config: DEFAULT_DESK_CONFIG });
    const csv = deskToCsv(desk);
    expect(csv).toContain("validated_edge");
    expect(csv.split("\n").length).toBeGreaterThan(1);
  });

  it("évite double riskAllocated si edge promu du même dossier", () => {
    const desk = buildPmDesk({
      dossiers,
      edges,
      config: { capital: 100_000, riskBudgetPct: 1.4, riskPerSleevePct: 0.25 },
    });
    const dos = desk.sleeves.find((s) => s.id === "dos:d1");
    expect(dos.riskAllocated).toBe(0);
    expect(dos.status).toBe("promoted");
  });
});
