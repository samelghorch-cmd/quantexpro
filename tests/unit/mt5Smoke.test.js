// P3-MT5-VPS — smoke payloads + cycle mock
import { describe, it, expect } from "vitest";
import {
  buildPaperSignal,
  buildFilledAck,
  buildRejectedAck,
  assertSignalShape,
  assertExecutionShape,
  runMt5SmokeCycle,
} from "../../mt5/smoke.mjs";

describe("payloads", () => {
  it("signal paper valide", () => {
    const s = buildPaperSignal({ client_order_id: "t1" });
    expect(assertSignalShape(s)).toEqual([]);
    expect(s.mode).toBe("paper");
  });

  it("rejette volume invalide", () => {
    expect(assertSignalShape(buildPaperSignal({ volume: 0 }))).toContain("volume");
  });

  it("execution filled / rejected", () => {
    expect(assertExecutionShape(buildFilledAck("t1"))).toEqual([]);
    expect(assertExecutionShape(buildRejectedAck("t1"))).toEqual([]);
    expect(assertExecutionShape({ client_order_id: "t1", status: "wat" })).toContain("status");
  });
});

describe("runMt5SmokeCycle", () => {
  it("enchaîne create → pending → execution (mock fetch)", async () => {
    let createdId = "";
    const fetchImpl = async (url, opts) => {
      const u = String(url);
      const method = opts?.method || "GET";
      if (u.endsWith("/v1/mt5/signals") && method === "POST") {
        const body = JSON.parse(opts.body);
        createdId = body.client_order_id;
        return {
          ok: true,
          text: async () => JSON.stringify({
            client_order_id: createdId,
            status: "pending",
            mode: "paper",
          }),
        };
      }
      if (u.includes("/signals/pending")) {
        return {
          ok: true,
          text: async () => JSON.stringify([
            { client_order_id: createdId, status: "pending", symbol: "EURUSD" },
          ]),
        };
      }
      if (u.endsWith("/v1/mt5/executions") && method === "POST") {
        const body = JSON.parse(opts.body);
        return {
          ok: true,
          text: async () => JSON.stringify({
            client_order_id: body.client_order_id,
            status: "filled",
          }),
        };
      }
      return { ok: false, text: async () => "unexpected" };
    };

    const out = await runMt5SmokeCycle({
      baseUrl: "http://api.test",
      pmKey: "pm",
      eaKey: "ea",
      fetchImpl,
    });
    expect(out.ok).toBe(true);
    expect(out.client_order_id).toBe(createdId);
    expect(out.steps.map((s) => s.step)).toEqual(["create_signal", "pending", "execution"]);
  });

  it("échoue sans clés", async () => {
    const out = await runMt5SmokeCycle({ baseUrl: "http://x", pmKey: "", eaKey: "" });
    expect(out.ok).toBe(false);
  });
});
