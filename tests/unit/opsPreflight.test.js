import { describe, it, expect } from "vitest";
import {
  PREFLIGHT_STEPS,
  resolveConfig,
  missingConfig,
  buildPreflightPlan,
} from "../../scripts/ops_preflight.mjs";

describe("ops_preflight", () => {
  it("expose health · edges · anti", () => {
    expect(PREFLIGHT_STEPS.map((s) => s.id)).toEqual(["health", "edges", "anti"]);
  });

  it("detecte config manquante", () => {
    expect(missingConfig(resolveConfig({}))).toContain("QX_API_BASE_URL");
    expect(
      missingConfig(resolveConfig({ QX_API_BASE_URL: "http://x", QX_API_KEY_PM: "k" })),
    ).toEqual([]);
  });

  it("buildPreflightPlan avec auth sur edges", () => {
    const plan = buildPreflightPlan({ base: "http://api", key: "secret" });
    expect(plan[0].url).toBe("http://api/health");
    expect(plan[0].headers["X-API-Key"]).toBeUndefined();
    expect(plan[1].headers["X-API-Key"]).toBe("secret");
    expect(plan[2].path).toContain("anti-library");
  });
});
