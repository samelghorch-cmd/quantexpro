import { describe, it, expect } from "vitest";
import {
  volumeProfile,
  utcDayKey,
  groupBarsBySession,
  volumeProfileSessions,
  vpLevelsFromSession,
  oiLevelsFromGex,
  findConfluence,
} from "../../src/engine/microstructure.js";
import { makeBars, DAY_MS, HOUR_MS, T0 } from "../helpers/fixtures.js";

describe("volumeProfile", () => {
  it("retourne structure vide si pas de barres", () => {
    const vp = volumeProfile([]);
    expect(vp.poc).toBeNull();
    expect(vp.bins).toEqual([]);
  });

  it("POC dans la value area", () => {
    const bars = makeBars({ n: 80, seed: 9 });
    const vp = volumeProfile(bars, 40);
    expect(vp.poc).toBeGreaterThanOrEqual(vp.val);
    expect(vp.poc).toBeLessThanOrEqual(vp.vah);
    expect(vp.totalV).toBeGreaterThan(0);
  });
});

describe("sessions UTC", () => {
  it("utcDayKey format YYYY-MM-DD", () => {
    expect(utcDayKey(T0)).toBe("2024-01-01");
  });

  it("groupBarsBySession agrège par jour", () => {
    const bars = makeBars({ n: 48, dtMs: HOUR_MS, seed: 1 }); // 2 jours
    const sessions = groupBarsBySession(bars);
    expect(sessions.length).toBe(2);
    expect(sessions[0].bars.length).toBe(24);
    expect(sessions[1].bars.length).toBe(24);
  });
});

describe("volumeProfileSessions — pPOC / pVAL", () => {
  it("expose pPOC/pVAL de la session précédente", () => {
    // 3 jours daily → previous = jour 2, current = jour 3
    const bars = makeBars({ n: 3, dtMs: DAY_MS, seed: 11, vol: 20 });
    const sess = volumeProfileSessions(bars, 20);
    expect(sess.sessionCount).toBe(3);
    expect(sess.pPoc).not.toBeNull();
    expect(sess.pVal).not.toBeNull();
    expect(sess.pVah).not.toBeNull();
    expect(sess.previousKey).toBe("2024-01-02");
    expect(sess.currentKey).toBe("2024-01-03");
    // pPOC = POC calculé sur le jour précédent seul
    const prevVp = volumeProfile([bars[1]], 20);
    expect(sess.pPoc).toBeCloseTo(prevVp.poc, 8);
  });

  it("sans timestamps → pas de previous", () => {
    const bars = [{ h: 110, l: 90, v: 100 }, { h: 105, l: 95, v: 80 }];
    const sess = volumeProfileSessions(bars, 10);
    expect(sess.sessionCount).toBe(0);
    expect(sess.pPoc).toBeNull();
    expect(sess.developing.poc).not.toBeNull();
  });
});

describe("confluence VP ↔ OI", () => {
  it("oiLevelsFromGex extrait walls / zero / max pain / high OI", () => {
    const profile = {
      zeroGamma: 100,
      callWall: 110,
      putWall: 90,
      profile: [
        { strike: 100, callOi: 10, putOi: 5 },
        { strike: 105, callOi: 50, putOi: 40 },
      ],
    };
    const levels = oiLevelsFromGex(profile, { strike: 102 });
    const labels = levels.map((l) => l.label);
    expect(labels).toContain("Zeroγ");
    expect(labels).toContain("CallWall");
    expect(labels).toContain("PutWall");
    expect(labels).toContain("MaxPain");
    expect(labels).toContain("HighOI");
    expect(levels.find((l) => l.label === "HighOI").price).toBe(105);
  });

  it("findConfluence détecte pPOC ≈ MaxPain", () => {
    const vp = [
      { label: "pPOC", price: 100 },
      { label: "VAL", price: 95 },
    ];
    const oi = [
      { label: "MaxPain", price: 100.2 },
      { label: "CallWall", price: 120 },
    ];
    const hits = findConfluence(vp, oi, 0.5);
    expect(hits.length).toBe(1);
    expect(hits[0].vpLabel).toBe("pPOC");
    expect(hits[0].oiLabel).toBe("MaxPain");
    expect(hits[0].distPct).toBeLessThan(0.5);
  });

  it("vpLevelsFromSession inclut pPOC", () => {
    const bars = makeBars({ n: 5, dtMs: DAY_MS, seed: 3 });
    const levels = vpLevelsFromSession(volumeProfileSessions(bars, 15));
    expect(levels.some((l) => l.label === "pPOC")).toBe(true);
    expect(levels.some((l) => l.label === "POC")).toBe(true);
  });
});
