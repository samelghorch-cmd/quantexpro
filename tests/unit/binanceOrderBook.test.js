// P2-L2 — Binance order book parse / metrics
import { describe, it, expect } from "vitest";
import {
  parseDepthSnapshot,
  parseBookTicker,
  bookMetrics,
  mergeBookState,
  unwrapCombinedMessage,
  isDepthPayload,
  isBookTickerPayload,
  binanceDepthStreamUrl,
} from "../../src/engine/binanceOrderBook.ts";

const depthRaw = {
  lastUpdateId: 160,
  bids: [
    ["100.00", "1.5"],
    ["99.90", "2.0"],
    ["99.80", "0.5"],
  ],
  asks: [
    ["100.10", "1.0"],
    ["100.20", "3.0"],
    ["100.30", "0.8"],
  ],
};

describe("parseDepthSnapshot", () => {
  it("trie bids desc / asks asc et limite levels", () => {
    const b = parseDepthSnapshot(depthRaw, 2);
    expect(b.bids).toHaveLength(2);
    expect(b.asks).toHaveLength(2);
    expect(b.bids[0].price).toBe(100);
    expect(b.bids[1].price).toBe(99.9);
    expect(b.asks[0].price).toBe(100.1);
    expect(b.asks[1].price).toBe(100.2);
  });
});

describe("parseBookTicker", () => {
  it("extrait best bid/ask", () => {
    const t = parseBookTicker({ b: "100.00", B: "2", a: "100.05", A: "1.5", s: "BTCUSDT", u: 1 });
    expect(t.bid).toBe(100);
    expect(t.ask).toBe(100.05);
    expect(t.bidSize).toBe(2);
    expect(t.askSize).toBe(1.5);
  });
  it("null si invalide", () => {
    expect(parseBookTicker({ b: "0", a: "1" })).toBeNull();
  });
});

describe("bookMetrics / mergeBookState", () => {
  it("calcule mid, spread bps, imbalance", () => {
    const depth = parseDepthSnapshot(depthRaw);
    const m = bookMetrics(depth);
    expect(m.mid).toBeCloseTo(100.05, 5);
    expect(m.spread).toBeCloseTo(0.1, 5);
    expect(m.spreadBps).toBeCloseTo((0.1 / 100.05) * 1e4, 3);
    expect(m.imbalance).toBeDefined();
  });

  it("merge override top avec bookTicker", () => {
    const depth = parseDepthSnapshot(depthRaw);
    const ticker = parseBookTicker({ b: "100.01", B: "9", a: "100.02", A: "8", s: "BTCUSDT" });
    const merged = mergeBookState(depth, ticker);
    expect(merged.real).toBe(true);
    expect(merged.bids[0].price).toBe(100.01);
    expect(merged.bids[0].size).toBe(9);
    expect(merged.asks[0].price).toBe(100.02);
    expect(merged.spreadBps).toBeCloseTo((0.01 / ((100.01 + 100.02) / 2)) * 1e4, 3);
  });
});

describe("message helpers", () => {
  it("unwrap combined stream", () => {
    const u = unwrapCombinedMessage({ stream: "btcusdt@bookTicker", data: { b: "1", a: "2", B: "1", A: "1" } });
    expect(u.stream).toContain("bookTicker");
    expect(isBookTickerPayload(u.data)).toBe(true);
  });
  it("détecte depth", () => {
    expect(isDepthPayload(depthRaw)).toBe(true);
    expect(isBookTickerPayload(depthRaw)).toBe(false);
  });
  it("URL combined depth+bookTicker", () => {
    const url = binanceDepthStreamUrl("BTCUSDT", 20);
    expect(url).toContain("stream?streams=");
    expect(url).toContain("btcusdt@depth20@100ms");
    expect(url).toContain("btcusdt@bookTicker");
  });
});
