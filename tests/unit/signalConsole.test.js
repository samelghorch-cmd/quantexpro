// P4-SIGNAL-WS — tests signalConsole
import { describe, it, expect } from "vitest";
import {
  barsWebSocketUrl,
  resolveStreamTf,
  parseBarClosedMessage,
  evaluateSlots,
  consensusFromSignals,
  pushRing,
  makeSignalSnapshotEvent,
  makeBarClosedEvent,
  filterEvents,
  eventsToCsv,
  DEFAULT_SIGNAL_SLOTS,
} from "../../src/engine/signalConsole.ts";

describe("barsWebSocketUrl", () => {
  it("passe http→ws et https→wss", () => {
    expect(barsWebSocketUrl("http://localhost:8000", "15m", "secret")).toBe(
      "ws://localhost:8000/stream/bars/15m?api_key=secret",
    );
    expect(barsWebSocketUrl("https://api.example.com/", "1h")).toBe(
      "wss://api.example.com/stream/bars/1h",
    );
  });
});

describe("resolveStreamTf", () => {
  it("mappe facteurs dashboard", () => {
    expect(resolveStreamTf(3)).toBe("15m");
    expect(resolveStreamTf(12)).toBe("1h");
    expect(resolveStreamTf(999)).toBe("15m");
  });
});

describe("parseBarClosedMessage", () => {
  it("parse enveloppe bar.closed", () => {
    const raw = JSON.stringify({
      id: "BTC:15m:2026-07-24T10:00:00Z",
      type: "bar.closed",
      ts: "2026-07-24T10:00:00Z",
      payload: { symbol: "BTC", timeframe: "15m", close: 65000, ts: "2026-07-24T10:00:00Z" },
    });
    const p = parseBarClosedMessage(raw);
    expect(p.type).toBe("bar.closed");
    expect(p.symbol).toBe("BTC");
    expect(p.bar.close).toBe(65000);
  });

  it("refuse JSON invalide", () => {
    expect(parseBarClosedMessage("not-json")).toBeNull();
  });
});

describe("evaluateSlots + consensus", () => {
  const library = [
    { id: 1, name: "A", cat: "trend", eval: () => ({ long: true, short: false }) },
    { id: 3, name: "B", cat: "trend", eval: () => ({ long: true, short: false }) },
    { id: 4, name: "C", cat: "mr", eval: () => ({ long: false, short: true }) },
  ];

  it("évalue et consensus LONG", () => {
    const sigs = evaluateSlots(library, {}, 5, [1, 3, 4]);
    expect(sigs).toHaveLength(3);
    const c = consensusFromSignals(sigs);
    expect(c.consensus).toBe("LONG");
    expect(c.nLong).toBe(2);
    expect(c.nShort).toBe(1);
  });

  it("marque missing si slot absent", () => {
    const sigs = evaluateSlots(library, {}, 5, [99]);
    expect(sigs[0].missing).toBe(true);
  });

  it("DEFAULT_SIGNAL_SLOTS non vide", () => {
    expect(DEFAULT_SIGNAL_SLOTS.length).toBeGreaterThanOrEqual(4);
  });
});

describe("ring + events", () => {
  it("pushRing borne la taille", () => {
    let r = [];
    for (let i = 0; i < 5; i++) r = pushRing(r, { i }, 3);
    expect(r).toHaveLength(3);
    expect(r[0].i).toBe(4);
  });

  it("snapshot + bar events + csv + filter", () => {
    const sigs = [
      { id: 1, name: "A", long: true, short: false },
      { id: 2, name: "B", long: false, short: false },
    ];
    const snap = makeSignalSnapshotEvent(sigs, { source: "local", symbol: "BTC" });
    expect(snap.kind).toBe("signal_snapshot");
    expect(snap.consensus).toBe("LONG");
    expect(snap.signals).toHaveLength(1);

    const bar = makeBarClosedEvent(
      parseBarClosedMessage(
        JSON.stringify({
          id: "x",
          type: "bar.closed",
          ts: "2026-07-24T10:00:00Z",
          payload: { symbol: "ETH", timeframe: "15m", close: 1 },
        }),
      ),
    );
    expect(bar.kind).toBe("bar_closed");
    const all = [snap, bar];
    expect(filterEvents(all, { kind: "bar_closed" })).toHaveLength(1);
    expect(eventsToCsv(all)).toContain("signal_snapshot");
  });
});
