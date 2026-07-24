// P3-COLLECTOR-INGEST — helpers d'ingestion bars
import { describe, it, expect, vi } from "vitest";
import {
  tickerToSymbol,
  chunkArray,
  toApiBar,
  selectBarsForIngest,
  pushBarsToBackend,
  ingestConfigFromEnv,
} from "../../collector/barsIngest.js";

describe("tickerToSymbol", () => {
  it("strip USDT", () => {
    expect(tickerToSymbol("BTCUSDT")).toBe("BTC");
    expect(tickerToSymbol("ethusdt")).toBe("ETH");
    expect(tickerToSymbol("SOLUSDT")).toBe("SOL");
  });
});

describe("toApiBar / select / chunk", () => {
  it("mappe vBuy → volume_buy", () => {
    const row = toApiBar("BTC", { t: Date.UTC(2024, 0, 1), o: 1, h: 2, l: 1, c: 1.5, v: 10, vBuy: 4 });
    expect(row.symbol).toBe("BTC");
    expect(row.volume_buy).toBe(4);
    expect(row.ts).toMatch(/2024-01-01/);
  });

  it("selectBarsForIngest backfill puis delta", () => {
    const series = [1, 2, 3, 4, 5].map((i) => ({ t: i * 1000, o: 1, h: 1, l: 1, c: 1, v: 1 }));
    expect(selectBarsForIngest(series, null, 3)).toHaveLength(3);
    expect(selectBarsForIngest(series, 3000).map((b) => b.t)).toEqual([4000, 5000]);
  });

  it("chunkArray", () => {
    expect(chunkArray([1, 2, 3, 4], 3)).toEqual([[1, 2, 3], [4]]);
  });
});

describe("ingestConfigFromEnv", () => {
  it("opt-in QX_BARS_INGEST=1", () => {
    expect(ingestConfigFromEnv({}).enabled).toBe(false);
    expect(ingestConfigFromEnv({
      QX_API_BASE_URL: "http://localhost:8000",
      QX_API_KEY: "k",
    }).enabled).toBe(false);
    expect(ingestConfigFromEnv({
      QX_API_BASE_URL: "http://localhost:8000/",
      QX_API_KEY: "k",
      QX_BARS_INGEST: "1",
    })).toMatchObject({ enabled: true, baseUrl: "http://localhost:8000" });
  });
});

describe("pushBarsToBackend", () => {
  it("POST par lots", async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body), key: opts.headers["X-API-Key"] });
      return { ok: true, text: async () => JSON.stringify({ written: JSON.parse(opts.body).length }) };
    };
    const bars = [
      { t: 1000, o: 1, h: 1, l: 1, c: 1, v: 1 },
      { t: 2000, o: 1, h: 1, l: 1, c: 1, v: 1 },
      { t: 3000, o: 1, h: 1, l: 1, c: 1, v: 1 },
    ];
    const res = await pushBarsToBackend({
      baseUrl: "http://api.test",
      apiKey: "secret",
      timeframe: "1h",
      symbol: "BTC",
      bars,
      chunkSize: 2,
      fetchImpl,
    });
    expect(res.batches).toBe(2);
    expect(res.written).toBe(3);
    expect(res.lastTs).toBe(3000);
    expect(calls[0].url).toBe("http://api.test/v1/bars/1h");
    expect(calls[0].key).toBe("secret");
    expect(calls[0].body[0].symbol).toBe("BTC");
  });
});
