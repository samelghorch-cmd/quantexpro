// @ts-nocheck — migration bulk P10-TS-ENGINE; typage strict à reprendre fichier par fichier.
// Extrait de v4core.js — génération OHLCV synthétique + agrégation multi-timeframe.
import { seededRandom } from "./random.ts";

export function generateSyntheticCandles(nBars, seed = 42, startPrice = 4500) {
  const rnd = seededRandom(seed);
  const bars = [];
  let price = startPrice;
  let trend = 0;
  let volatility = 4;
  const dayLen = 78; // 6.5h / 5min
  for (let i = 0; i < nBars; i++) {
    // régime : bascule tendance / range
    if (i % 200 === 0) trend = (rnd() - 0.5) * 0.3;
    if (i % 150 === 0) volatility = 2 + rnd() * 6;
    // spike de volatilité (nouvelles)
    let vShock = 1;
    if (rnd() < 0.008) vShock = 3 + rnd() * 4;
    // gap d'ouverture
    let gap = 0;
    if (i % dayLen === 0 && i > 0) gap = (rnd() - 0.5) * 8;
    const open = price + gap;
    const change = (rnd() - 0.5) * volatility * vShock + trend;
    const close = open + change;
    const wickHi = rnd() * volatility * 0.7 * vShock;
    const wickLo = rnd() * volatility * 0.7 * vShock;
    const high = Math.max(open, close) + wickHi;
    const low = Math.min(open, close) - wickLo;
    const volBase = 800 + rnd() * 400;
    const volume = Math.floor(volBase * (1 + Math.abs(change) / volatility) * vShock);
    // horodatage synthétique : 5 min bars, ouvre 13:30 UTC (NY open)
    const startTs = Date.UTC(2026, 0, 1, 13, 30, 0);
    const ts = startTs + i * 5 * 60 * 1000;
    bars.push({ t: ts, o: open, h: high, l: low, c: close, v: volume });
    price = close;
  }
  return bars;
}

export function aggregateBars(bars, factor) {
  if (factor <= 1) return bars;
  const out = [];
  for (let i = 0; i < bars.length; i += factor) {
    const chunk = bars.slice(i, i + factor);
    if (chunk.length === 0) continue;
    out.push({
      t: chunk[0].t, o: chunk[0].o,
      h: Math.max(...chunk.map(b => b.h)),
      l: Math.min(...chunk.map(b => b.l)),
      c: chunk[chunk.length - 1].c,
      v: chunk.reduce((s, b) => s + b.v, 0),
      // Préserve le volume acheteur agressif (classification réelle) s'il est présent.
      ...(chunk[0].vBuy !== undefined ? { vBuy: chunk.reduce((s, b) => s + (b.vBuy || 0), 0) } : {}),
    });
  }
  return out;
}
