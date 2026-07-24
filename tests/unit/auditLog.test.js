// P4-AUDIT-UI — journal d'audit serveur
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  sortKeysDeep,
  canonicalPayloadJson,
  sha256Hex,
  verifyEventHash,
  normalizeAuditEvent,
  fetchAuditLog,
  filterAuditEvents,
  auditEventsToCsv,
  summarizeAudit,
  isAuditApiConfigured,
} from "../../src/engine/auditLog.js";

beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
});

describe("canonical hash parity", () => {
  it("trie les clés profondément", () => {
    expect(sortKeysDeep({ b: 1, a: { z: 2, y: 1 } })).toEqual({ a: { y: 1, z: 2 }, b: 1 });
  });

  it("canonicalPayloadJson est déterministe", () => {
    const a = canonicalPayloadJson({ z: 1, a: 2 });
    const b = canonicalPayloadJson({ a: 2, z: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"z":1}');
  });

  it("verifyEventHash accepte un hash correct", async () => {
    const details = { client_order_id: "x", mode: "paper" };
    const digest = await sha256Hex(canonicalPayloadJson(details));
    expect(await verifyEventHash({ payload_hash: digest, details })).toBe(true);
    expect(await verifyEventHash({ payload_hash: "deadbeef", details })).toBe(false);
  });
});

describe("normalize + filter + csv + summary", () => {
  const sample = [
    normalizeAuditEvent({
      id: 1,
      ts: "2026-07-24T10:00:00Z",
      actor: "pm-key",
      role: "pm",
      action: "mt5.create",
      resource: "orders/abc",
      payload_hash: "aaa",
      details: { x: 1 },
    }),
    normalizeAuditEvent({
      id: 2,
      ts: "2026-07-24T11:00:00Z",
      actor: "risk-key",
      role: "risk",
      action: "audit.read",
      resource: "audit",
      payload_hash: "bbb",
    }),
  ];

  it("normalize refuse id invalide", () => {
    expect(normalizeAuditEvent({ id: "x" })).toBeNull();
  });

  it("filtre par action et q", () => {
    expect(filterAuditEvents(sample, { action: "mt5.create" })).toHaveLength(1);
    expect(filterAuditEvents(sample, { q: "risk" })).toHaveLength(1);
    expect(filterAuditEvents(sample, { role: "pm" })).toHaveLength(1);
  });

  it("csv + summary", () => {
    const csv = auditEventsToCsv(sample);
    expect(csv.split("\n")[0]).toContain("payload_hash");
    expect(csv).toContain("mt5.create");
    const s = summarizeAudit(sample);
    expect(s.n).toBe(2);
    expect(s.lastId).toBe(2);
    expect(s.byRole.pm).toBe(1);
  });
});

describe("fetchAuditLog", () => {
  it("exige API configurée", async () => {
    await expect(fetchAuditLog()).rejects.toThrow(/Configure/);
  });

  it("appelle /v1/audit avec params", async () => {
    localStorage.setItem("quantexpro:apiBaseUrl", "http://localhost:8000");
    localStorage.setItem("quantexpro:apiKey", "pm-secret");
    expect(isAuditApiConfigured()).toBe(true);
    const fetchImpl = vi.fn(async () => [
      {
        id: 10,
        ts: "2026-07-24T12:00:00Z",
        actor: "a",
        role: "pm",
        action: "x",
        resource: "r",
        payload_hash: "h",
      },
    ]);
    const rows = await fetchAuditLog({ limit: 50, afterId: 5, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith("/v1/audit?limit=50&after_id=5");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(10);
  });
});
