import { describe, it, expect } from "vitest";
import { randomVerifier, pkceChallenge, hasAnyCredential } from "../../src/engine/ssoAuth.ts";

describe("ssoAuth PKCE", () => {
  it("randomVerifier produit une chaîne url-safe", () => {
    const v = randomVerifier(64);
    expect(v.length).toBeGreaterThan(40);
    expect(v).not.toMatch(/[+/=]/);
  });

  it("pkceChallenge est déterministe pour un verifier", async () => {
    const v = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const a = await pkceChallenge(v);
    const b = await pkceChallenge(v);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });

  it("hasAnyCredential ne crash pas", () => {
    expect(typeof hasAnyCredential()).toBe("boolean");
  });
});
