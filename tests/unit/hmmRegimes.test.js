import { describe, it, expect } from "vitest";
import {
  hmmFeatures,
  hmmRegimes,
  mapClustersToRegimes,
  HMM_REGIME_LABELS,
} from "../../src/engine/quantToolbox/index.js";
import { seededRandom } from "../../src/engine/random.js";

function synthReturns({ n, drift, vol, seed }) {
  const rnd = seededRandom(seed);
  const r = [];
  for (let i = 0; i < n; i++) r.push(drift + (rnd() * 2 - 1) * vol);
  return r;
}

describe("hmmFeatures", () => {
  it("warmup NaN puis valeurs finies", () => {
    const r = synthReturns({ n: 50, drift: 0.001, vol: 0.01, seed: 1 });
    const f = hmmFeatures(r, 20);
    expect(Number.isNaN(f[10].vol)).toBe(true);
    expect(Number.isFinite(f[25].vol)).toBe(true);
    expect(f[25].efficiency).toBeGreaterThanOrEqual(0);
  });
});

describe("mapClustersToRegimes", () => {
  it("mappe centroïdes distincts vers 0..3 uniques", () => {
    const centroids = [
      { vol: 0.02, efficiency: 0.9 }, // trend
      { vol: 0.005, efficiency: 0.1 }, // range
      { vol: 0.05, efficiency: 0.3 }, // vol
      { vol: 0.02, efficiency: 0.05 }, // choppy
    ];
    const remap = mapClustersToRegimes(centroids);
    const vals = Object.values(remap).sort();
    expect(vals).toEqual([0, 1, 2, 3]);
    expect(remap[0]).toBe(0); // highest eff → Trend
  });
});

describe("hmmRegimes", () => {
  it("retourne 4 labels institutionnels", () => {
    const r = synthReturns({ n: 200, drift: 0.0005, vol: 0.012, seed: 9 });
    const h = hmmRegimes(r);
    expect(h).not.toBeNull();
    expect(h.labels).toEqual(HMM_REGIME_LABELS);
    expect(h.counts).toHaveLength(4);
    expect(h.states).toHaveLength(r.length);
    expect(h.currentLabel).toBe(h.labels[h.current]);
    expect(h.heuristic).toBe(true);
  });

  it("sur série très tendancielle, Trend apparaît", () => {
    const r = synthReturns({ n: 250, drift: 0.008, vol: 0.004, seed: 3 });
    const h = hmmRegimes(r);
    expect(h.counts[0]).toBeGreaterThan(0); // Trend
  });

  it("null si trop court", () => {
    expect(hmmRegimes([0.1, -0.1, 0.05])).toBeNull();
  });
});
