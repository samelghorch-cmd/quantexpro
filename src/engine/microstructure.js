// Extrait de v4core.js — volume profile (POC/VAH/VAL) + order book mock L2.
import { seededRandom } from "./random.js";

export function volumeProfile(bars, nBins = 40) {
  let hi = -Infinity, lo = Infinity;
  bars.forEach(b => { if (b.h > hi) hi = b.h; if (b.l < lo) lo = b.l; });
  const step = (hi - lo) / nBins;
  const bins = Array(nBins).fill(0);
  bars.forEach(b => {
    const mid = (b.h + b.l) / 2;
    const idx = Math.min(nBins - 1, Math.max(0, Math.floor((mid - lo) / step)));
    bins[idx] += b.v;
  });
  const pocIdx = bins.indexOf(Math.max(...bins));
  const poc = lo + step * (pocIdx + 0.5);
  const totalV = bins.reduce((a, b) => a + b, 0);
  // Value Area = 70% du volume autour du POC
  let vaVol = bins[pocIdx];
  let lo_i = pocIdx, hi_i = pocIdx;
  while (vaVol < totalV * 0.7 && (lo_i > 0 || hi_i < nBins - 1)) {
    const upV = hi_i < nBins - 1 ? bins[hi_i + 1] : -1;
    const dnV = lo_i > 0 ? bins[lo_i - 1] : -1;
    if (upV >= dnV) { hi_i++; vaVol += bins[hi_i]; }
    else { lo_i--; vaVol += bins[lo_i]; }
  }
  return { bins, lo, hi, step, poc, vah: lo + step * (hi_i + 1), val: lo + step * lo_i };
}

export function generateOrderBook(mid, tick, depth = 10, seed = 1) {
  const rnd = seededRandom(seed);
  const bids = [], asks = [];
  for (let i = 1; i <= depth; i++) {
    bids.push({ price: mid - tick * i, size: Math.floor(50 + rnd() * 500) });
    asks.push({ price: mid + tick * i, size: Math.floor(50 + rnd() * 500) });
  }
  return { bids, asks, spread: tick, mid };
}
