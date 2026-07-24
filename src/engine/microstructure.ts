// Volume profile (POC/VAH/VAL) + pPOC/pVAL session précédente + confluence OI/GEX.
// P4-VP / P8-TS-MICRO — Order book mock L2 conservé pour outils démo.
import { seededRandom } from "./random.js";

export interface VpBar {
  t?: number;
  h: number;
  l: number;
  v?: number;
}

export interface VolumeProfileResult {
  bins: number[];
  lo: number;
  hi: number;
  step: number;
  poc: number | null;
  vah: number | null;
  val: number | null;
  totalV: number;
}

export interface SessionGroup {
  key: string;
  bars: VpBar[];
}

export interface SessionVolumeProfile {
  developing: VolumeProfileResult;
  previous: VolumeProfileResult | null;
  pPoc: number | null;
  pVah: number | null;
  pVal: number | null;
  sessionCount: number;
  currentKey: string | null;
  previousKey: string | null;
}

export interface PriceLevel {
  label: string;
  price: number;
}

/** Sous-ensemble de computeGexProfile utilisé pour les niveaux OI. */
export interface GexProfileLike {
  zeroGamma?: number | null;
  callWall?: number | null;
  putWall?: number | null;
  profile?: Array<{ strike: number; callOi?: number; putOi?: number }>;
}

export interface ConfluenceHit {
  vpLabel: string;
  oiLabel: string;
  vpPrice: number;
  oiPrice: number;
  mid: number;
  distPct: number;
}

export interface BookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  bids: BookLevel[];
  asks: BookLevel[];
  spread: number;
  mid: number;
}

/** Volume profile classique sur une fenêtre de barres. */
export function volumeProfile(bars: VpBar[] | null | undefined, nBins = 40): VolumeProfileResult {
  const list = Array.isArray(bars) ? bars : [];
  if (!list.length || !(nBins > 0)) {
    return { bins: [], lo: 0, hi: 0, step: 0, poc: null, vah: null, val: null, totalV: 0 };
  }
  let hi = -Infinity;
  let lo = Infinity;
  for (const b of list) {
    if (b.h > hi) hi = b.h;
    if (b.l < lo) lo = b.l;
  }
  if (!(hi > lo)) {
    const mid = Number.isFinite(hi) ? hi : 0;
    return {
      bins: Array(nBins).fill(0),
      lo: mid,
      hi: mid,
      step: 0,
      poc: mid,
      vah: mid,
      val: mid,
      totalV: 0,
    };
  }
  const step = (hi - lo) / nBins;
  const bins = Array(nBins).fill(0) as number[];
  for (const b of list) {
    const mid = (b.h + b.l) / 2;
    const idx = Math.min(nBins - 1, Math.max(0, Math.floor((mid - lo) / step)));
    bins[idx] += b.v || 0;
  }
  const totalV = bins.reduce((a, b) => a + b, 0);
  const pocIdx = bins.indexOf(Math.max(...bins));
  const poc = lo + step * (pocIdx + 0.5);
  let vaVol = bins[pocIdx];
  let lo_i = pocIdx;
  let hi_i = pocIdx;
  while (vaVol < totalV * 0.7 && (lo_i > 0 || hi_i < nBins - 1)) {
    const upV = hi_i < nBins - 1 ? bins[hi_i + 1] : -1;
    const dnV = lo_i > 0 ? bins[lo_i - 1] : -1;
    if (upV >= dnV) {
      hi_i++;
      vaVol += bins[hi_i];
    } else {
      lo_i--;
      vaVol += bins[lo_i];
    }
  }
  return {
    bins,
    lo,
    hi,
    step,
    poc,
    vah: lo + step * (hi_i + 1),
    val: lo + step * lo_i,
    totalV,
  };
}

/** Clé session UTC (jour calendaire). */
export function utcDayKey(tMs: number | string | null | undefined): string | null {
  const d = new Date(Number(tMs));
  if (Number.isNaN(d.getTime())) return null;
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${d.getUTCFullYear()}-${m < 10 ? `0${m}` : m}-${day < 10 ? `0${day}` : day}`;
}

/** Groupe les barres par session UTC day (ordre chronologique des clés). */
export function groupBarsBySession(bars: VpBar[] | null | undefined): SessionGroup[] {
  const map = new Map<string, VpBar[]>();
  for (const b of bars || []) {
    if (b?.t == null) continue;
    const key = utcDayKey(b.t);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b);
  }
  return [...map.entries()].map(([key, sessionBars]) => ({ key, bars: sessionBars }));
}

/**
 * VP session courante (developing) + pPOC / pVAH / pVAL de la session précédente.
 */
export function volumeProfileSessions(
  bars: VpBar[] | null | undefined,
  nBins = 40,
): SessionVolumeProfile {
  const sessions = groupBarsBySession(bars);
  if (!sessions.length) {
    const developing = volumeProfile(bars, nBins);
    return {
      developing,
      previous: null,
      pPoc: null,
      pVah: null,
      pVal: null,
      sessionCount: 0,
      currentKey: null,
      previousKey: null,
    };
  }
  const developing = volumeProfile(sessions[sessions.length - 1].bars, nBins);
  let previous: VolumeProfileResult | null = null;
  let pPoc: number | null = null;
  let pVah: number | null = null;
  let pVal: number | null = null;
  let previousKey: string | null = null;
  if (sessions.length >= 2) {
    previous = volumeProfile(sessions[sessions.length - 2].bars, nBins);
    pPoc = previous.poc;
    pVah = previous.vah;
    pVal = previous.val;
    previousKey = sessions[sessions.length - 2].key;
  }
  return {
    developing,
    previous,
    pPoc,
    pVah,
    pVal,
    sessionCount: sessions.length,
    currentKey: sessions[sessions.length - 1].key,
    previousKey,
  };
}

/** Niveaux VP + previous pour confluence. */
export function vpLevelsFromSession(sess: SessionVolumeProfile | null | undefined): PriceLevel[] {
  const levels: PriceLevel[] = [];
  if (!sess) return levels;
  const d = sess.developing;
  if (d?.poc != null) levels.push({ label: "POC", price: d.poc });
  if (d?.vah != null) levels.push({ label: "VAH", price: d.vah });
  if (d?.val != null) levels.push({ label: "VAL", price: d.val });
  if (sess.pPoc != null) levels.push({ label: "pPOC", price: sess.pPoc });
  if (sess.pVah != null) levels.push({ label: "pVAH", price: sess.pVah });
  if (sess.pVal != null) levels.push({ label: "pVAL", price: sess.pVal });
  return levels;
}

/** Niveaux OI / GEX (zero-gamma, walls, max pain, high OI). */
export function oiLevelsFromGex(
  profile: GexProfileLike | null | undefined,
  maxPain: { strike: number } | null = null,
): PriceLevel[] {
  const levels: PriceLevel[] = [];
  if (!profile) return levels;
  if (profile.zeroGamma != null) levels.push({ label: "Zeroγ", price: profile.zeroGamma });
  if (profile.callWall != null) levels.push({ label: "CallWall", price: profile.callWall });
  if (profile.putWall != null) levels.push({ label: "PutWall", price: profile.putWall });
  if (maxPain?.strike != null) levels.push({ label: "MaxPain", price: maxPain.strike });
  if (profile.profile?.length) {
    let best: { strike: number } | null = null;
    let bestOi = 0;
    for (const p of profile.profile) {
      const oi = (p.callOi || 0) + (p.putOi || 0);
      if (oi > bestOi) {
        bestOi = oi;
        best = p;
      }
    }
    if (best && bestOi > 0) levels.push({ label: "HighOI", price: best.strike });
  }
  return levels;
}

/** Confluence VP ↔ OI/GEX dans une tolérance relative (%). */
export function findConfluence(
  vpLevels: PriceLevel[] | null | undefined,
  oiLevels: PriceLevel[] | null | undefined,
  tolPct = 0.35,
): ConfluenceHit[] {
  const hits: ConfluenceHit[] = [];
  for (const vp of vpLevels || []) {
    if (!(vp.price > 0)) continue;
    for (const oi of oiLevels || []) {
      if (!(oi.price > 0)) continue;
      const distPct = (Math.abs(vp.price - oi.price) / vp.price) * 100;
      if (distPct <= tolPct) {
        hits.push({
          vpLabel: vp.label,
          oiLabel: oi.label,
          vpPrice: vp.price,
          oiPrice: oi.price,
          mid: (vp.price + oi.price) / 2,
          distPct,
        });
      }
    }
  }
  hits.sort((a, b) => a.distPct - b.distPct);
  return hits;
}

export function generateOrderBook(
  mid: number,
  tick: number,
  depth = 10,
  seed = 1,
): OrderBook {
  const rnd = seededRandom(seed) as () => number;
  const bids: BookLevel[] = [];
  const asks: BookLevel[] = [];
  for (let i = 1; i <= depth; i++) {
    bids.push({ price: mid - tick * i, size: Math.floor(50 + rnd() * 500) });
    asks.push({ price: mid + tick * i, size: Math.floor(50 + rnd() * 500) });
  }
  return { bids, asks, spread: tick, mid };
}
