// P3-ZDL-SYNC — mapping TF + conversion barres + chunking
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TF_TO_API,
  tfToApi,
  toApiBar,
  fromApiBar,
  chunkBars,
  pushBarsToApi,
  pullBarsFromApi,
} from "../../src/engine/barsSync.ts";

function installLocalStorage() {
  const store = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  });
}

describe("TF mapping", () => {
  it("mappe les TF dashboard vers API", () => {
    expect(TF_TO_API[1]).toBe("5m");
    expect(TF_TO_API[12]).toBe("1h");
    expect(tfToApi(288)).toBe("1d");
    expect(() => tfToApi(99)).toThrow(/non synchronisable/);
  });
});

describe("bar conversion", () => {
  it("toApiBar / fromApiBar round-trip timestamps ISO", () => {
    const t = Date.UTC(2024, 0, 15, 12, 0, 0);
    const api = toApiBar("BTC", { t, o: 1, h: 2, l: 0.5, c: 1.5, v: 10, vb: 4 });
    expect(api.symbol).toBe("BTC");
    expect(api.ts).toMatch(/2024-01-15/);
    expect(api.volume_buy).toBe(4);
    const back = fromApiBar({ ...api, ts: api.ts });
    expect(back.t).toBe(t);
    expect(back.o).toBe(1);
    expect(back.vb).toBe(4);
  });
});

describe("chunkBars", () => {
  it("découpe", () => {
    expect(chunkBars([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("push/pull with mock apiFetch", () => {
  beforeEach(() => {
    installLocalStorage();
    localStorage.setItem("quantexpro:apiBaseUrl", "http://localhost:8000");
    localStorage.setItem("quantexpro:apiKey", "test-key");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pushBarsToApi envoie des lots POST", async () => {
    const calls = [];
    vi.stubGlobal("fetch", async (url, opts) => {
      calls.push({ url: String(url), method: opts?.method, body: opts?.body });
      return {
        ok: true,
        text: async () => JSON.stringify({ written: JSON.parse(opts.body).length, received: JSON.parse(opts.body).length }),
      };
    });
    const bars = Array.from({ length: 3 }, (_, i) => ({
      t: Date.UTC(2024, 0, 1) + i * 3600_000, o: 1, h: 2, l: 1, c: 1.5, v: 1,
    }));
    const res = await pushBarsToApi("BTC", 12, bars, { chunkSize: 2 });
    expect(res.batches).toBe(2);
    expect(res.timeframe).toBe("1h");
    expect(calls[0].url).toContain("/v1/bars/1h");
    expect(calls[0].method).toBe("POST");
  });

  it("pullBarsFromApi pagine puis importe", async () => {
    vi.stubGlobal("fetch", async (url) => {
      const u = String(url);
      if (u.includes("/v1/bars/ETH")) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            items: [{
              symbol: "ETH", ts: "2024-01-01T00:00:00.000Z",
              open: 1, high: 2, low: 1, close: 1.5, volume: 3,
            }],
            count: 1,
            next_cursor: null,
          }),
        };
      }
      return { ok: false, text: async () => "no" };
    });
    const res = await pullBarsFromApi("ETH", 12, { pageLimit: 10 });
    expect(res.count).toBe(1);
    expect(res.timeframe).toBe("1h");
  });
});
