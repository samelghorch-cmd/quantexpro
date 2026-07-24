// P4-FEEDS — tests statut multi-feeds
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  FEED_CATALOG,
  listFeeds,
  feedStatusTone,
  toFeedStatus,
  probeAllFeeds,
  summarizeFeeds,
  probeBinance,
  probeTimescale,
} from "../../src/engine/feedStatus.ts";

beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
});

describe("catalog", () => {
  it("expose feeds live + scoped_out", () => {
    const feeds = listFeeds();
    expect(feeds.some((f) => f.id === "binance")).toBe(true);
    expect(feeds.some((f) => f.id === "databento" && f.scopedOut)).toBe(true);
    expect(FEED_CATALOG.length).toBeGreaterThanOrEqual(6);
  });

  it("tones", () => {
    expect(feedStatusTone("ok")).toBe("green");
    expect(feedStatusTone("down")).toBe("red");
    expect(feedStatusTone("unconfigured")).toBe("yellow");
    expect(feedStatusTone("scoped_out")).toBe("dim");
  });
});

describe("toFeedStatus + summarize", () => {
  it("mappe unconfigured / ok / down", () => {
    expect(toFeedStatus("timescale", { unconfigured: true }).status).toBe("unconfigured");
    expect(toFeedStatus("binance", { ok: true, latencyMs: 12 }).status).toBe("ok");
    expect(toFeedStatus("yahoo", { ok: false }).status).toBe("down");
    expect(toFeedStatus("databento", {}).status).toBe("scoped_out");
  });

  it("summarizeFeeds", () => {
    const s = summarizeFeeds([
      toFeedStatus("binance", { ok: true }),
      toFeedStatus("timescale", { unconfigured: true }),
      toFeedStatus("databento", {}),
    ]);
    expect(s.ok).toBe(1);
    expect(s.unconfigured).toBe(1);
    expect(s.scoped_out).toBe(1);
  });
});

describe("probes (mock fetch)", () => {
  it("probeBinance ok", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }));
    const r = await probeBinance(fetchImpl);
    expect(r.ok).toBe(true);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("probeTimescale unconfigured sans clé", async () => {
    const r = await probeTimescale(vi.fn());
    expect(r.unconfigured).toBe(true);
  });

  it("probeAllFeeds avec fetch mock", async () => {
    localStorage.setItem("quantexpro:apiBaseUrl", "http://localhost:8000");
    localStorage.setItem("quantexpro:apiKey", "k");
    localStorage.setItem("collectorUrl", "http://localhost:8787");
    const fetchImpl = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("binance") || u.includes("/ping")) return { ok: true, status: 200 };
      if (u.includes("/health")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, jobs: 2 }),
        };
      }
      if (u.includes("deribit")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ result: [{ x: 1 }, { x: 2 }] }),
        };
      }
      if (u.includes("/api/yf")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ chart: { result: [{}] } }),
        };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });
    const all = await probeAllFeeds({ fetchImpl });
    expect(all.find((f) => f.id === "binance")?.status).toBe("ok");
    expect(all.find((f) => f.id === "timescale")?.status).toBe("ok");
    expect(all.find((f) => f.id === "collector")?.status).toBe("ok");
    expect(all.find((f) => f.id === "deribit")?.status).toBe("ok");
    expect(all.find((f) => f.id === "yahoo")?.status).toBe("ok");
    expect(all.find((f) => f.id === "databento")?.status).toBe("scoped_out");
  });
});
