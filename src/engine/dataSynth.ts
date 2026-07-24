// @ts-nocheck — migration bulk P10-TS-ENGINE; typage strict à reprendre fichier par fichier.
// Générateur de chemins synthétiques par Block Bootstrap (Données Synth).
import { seededRandom } from "./random.ts";

export function dataSynthPreview(pnls, bars, { nPaths = 300, initial = 100000, seed = 42 } = {}) {
  if (!pnls || pnls.length < 5) return { error: "Lance un backtest avec au moins 5 trades pour générer des chemins synthétiques." };
  const rnd = seededRandom(seed);
  const n = pnls.length;
  const blockSize = Math.max(2, Math.floor(Math.sqrt(n)));
  const curves = [];
  const finals = [];
  for (let p = 0; p < nPaths; p++) {
    const curve = [initial];
    let eq = initial, count = 0;
    while (count < n) {
      const start = Math.floor(rnd() * n);
      for (let b = 0; b < blockSize && count < n; b++) {
        eq += pnls[(start + b) % n];
        curve.push(eq);
        count++;
      }
    }
    curves.push(curve);
    finals.push(eq);
  }
  finals.sort((a, b) => a - b);
  const pct = (q) => finals[Math.floor(finals.length * q)];
  return { curves, initial, blockSize, p05: pct(0.05), p50: pct(0.5), p95: pct(0.95) };
}
