// P4-AF-SYNC — sync Validated Edges
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  toApiEdge,
  fromApiEdge,
  mergeRemoteEdges,
  pushEdgesToApi,
  pullEdgesFromApi,
  isEdgesApiConfigured,
} from "../../src/engine/edgesSync.js";
import { clearValidatedEdges, addValidatedEdge, loadValidatedEdges } from "../../src/engine/validatedEdges.js";

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

describe("toApiEdge / fromApiEdge", () => {
  it("round-trip champs clés", () => {
    const local = {
      id: "ve-1",
      name: "ORB",
      strategyId: 42,
      symbol: "XAUUSD",
      tf: "15m",
      letter: "A",
      verdict: "GO",
      score: 90,
      status: "active",
      fingerprint: "42::XAUUSD::15m::",
      metrics: { sharpe: 1.5 },
      params: { slAtr: 1 },
      toolsApplied: ["Backtest"],
      validatedAt: 1_700_000_000_000,
    };
    const api = toApiEdge(local);
    expect(api.strategy_id).toBe(42);
    expect(api.letter).toBe("A");
    const back = fromApiEdge({
      ...api,
      validated_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    });
    expect(back.strategyId).toBe(42);
    expect(back.fingerprint).toBe(local.fingerprint);
  });
});

describe("mergeRemoteEdges", () => {
  it("ajoute et met à jour", () => {
    addValidatedEdge({
      name: "Local",
      letter: "B",
      verdict: "GO",
      strategyId: 1,
      symbol: "BTC",
      tf: "1h",
      score: 70,
    });
    const local = loadValidatedEdges();
    const fp = local[0].fingerprint;
    const remote = [
      {
        fingerprint: fp,
        name: "Remote newer",
        letter: "A",
        verdict: "GO",
        status: "active",
        strategy_id: 1,
        symbol: "BTC",
        tf: "1h",
        score: 88,
        validated_at: "2026-07-24T00:00:00Z",
        updated_at: "2099-01-01T12:00:00Z",
      },
      {
        fingerprint: "new::fp",
        name: "Brand new",
        letter: "C",
        verdict: "GO",
        status: "active",
        validated_at: "2026-07-24T00:00:00Z",
        updated_at: "2099-01-01T12:00:00Z",
      },
    ];
    const { merged, added, updated } = mergeRemoteEdges(remote);
    expect(added).toBe(1);
    expect(updated).toBe(1);
    expect(merged.some((e) => e.name === "Remote newer")).toBe(true);
    expect(merged.some((e) => e.name === "Brand new")).toBe(true);
  });
});

describe("push / pull", () => {
  it("exige config", async () => {
    await expect(pushEdgesToApi()).rejects.toThrow(/Configure/);
    expect(isEdgesApiConfigured()).toBe(false);
  });

  it("push appelle POST /v1/edges", async () => {
    localStorage.setItem("quantexpro:apiBaseUrl", "http://localhost:8000");
    localStorage.setItem("quantexpro:apiKey", "pm");
    addValidatedEdge({ name: "E", letter: "A", verdict: "GO", score: 90, strategyId: 2 });
    const fetchImpl = vi.fn(async () => ({ received: 1, written: 1 }));
    const res = await pushEdgesToApi({ fetchImpl });
    expect(res.written).toBe(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("/v1/edges");
    expect(fetchImpl.mock.calls[0][1].method).toBe("POST");
  });

  it("pull merge", async () => {
    localStorage.setItem("quantexpro:apiBaseUrl", "http://localhost:8000");
    localStorage.setItem("quantexpro:apiKey", "pm");
    const fetchImpl = vi.fn(async () => [
      {
        fingerprint: "x::y::z",
        name: "FromAPI",
        letter: "A",
        verdict: "GO",
        status: "active",
        validated_at: "2026-07-24T00:00:00Z",
        updated_at: "2026-07-24T00:00:00Z",
      },
    ]);
    const { added } = await pullEdgesFromApi({ fetchImpl });
    expect(added).toBe(1);
    expect(loadValidatedEdges().some((e) => e.name === "FromAPI")).toBe(true);
  });
});
