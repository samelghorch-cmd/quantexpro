// Extrait de v4core.js — PRNG déterministe (LCG).
// P10-TS-ENGINE
/** Seeded RNG in [0, 1). */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
