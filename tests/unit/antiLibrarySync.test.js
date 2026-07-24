// P4-ANT-SYNC
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  toApiAntiEntry,
  fromApiAntiEntry,
  mergeRemoteAntiLibrary,
  pushAntiLibraryToApi,
  pullAntiLibraryFromApi,
  isAntiApiConfigured,
} from "../../src/engine/antiLibrarySync.js";
import { clearAntiLibrary, ensureSeeded, loadAntiLibrary } from "../../src/engine/antiLibrary.js";

beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  clearAntiLibrary({ keepSeeded: false });
});

describe("map", () => {
  it("to/from api", () => {
    const api = toApiAntiEntry({
      id: "al-1",
      conceptId: "zscore_mr",
      label: "Z",
      reason: "r",
      namePattern: "z",
      strategyIds: [21],
      seeded: true,
    });
    expect(api.concept_id).toBe("zscore_mr");
    const back = fromApiAntiEntry({
      ...api,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });
    expect(back.conceptId).toBe("zscore_mr");
    expect(back.strategyIds).toEqual([21]);
  });
});

describe("merge + push/pull", () => {
  it("merge ajoute remote", () => {
    ensureSeeded();
    const { added } = mergeRemoteAntiLibrary([
      {
        concept_id: "custom_x",
        label: "Custom",
        active: true,
        seeded: false,
        strategy_ids: [1],
        updated_at: "2026-07-24T00:00:00Z",
      },
    ]);
    expect(added).toBe(1);
    expect(loadAntiLibrary().some((e) => e.conceptId === "custom_x")).toBe(true);
  });

  it("push/pull", async () => {
    expect(isAntiApiConfigured()).toBe(false);
    await expect(pushAntiLibraryToApi()).rejects.toThrow(/Configure/);
    localStorage.setItem("quantexpro:apiBaseUrl", "http://localhost:8000");
    localStorage.setItem("quantexpro:apiKey", "pm");
    ensureSeeded();
    const fetchImpl = vi.fn(async (path) => {
      if (path.startsWith("/v1/anti-library?")) {
        return [
          {
            concept_id: "from_api",
            label: "From API",
            active: true,
            seeded: false,
            strategy_ids: [],
            updated_at: "2026-07-24T00:00:00Z",
          },
        ];
      }
      return { received: 5, written: 5 };
    });
    const push = await pushAntiLibraryToApi({ fetchImpl });
    expect(push.written).toBe(5);
    const pull = await pullAntiLibraryFromApi({ fetchImpl });
    expect(pull.added).toBe(1);
  });
});
