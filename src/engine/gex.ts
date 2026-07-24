// P4-GEX / P7-TS-GEX — Gamma Exposure / Max Pain / PCR (Module 5).
// Chaîne d'options → profil GEX par strike. Sources : JSON import ou Deribit public.
// Convention desk (type SpotGamma) : calls → GEX > 0, puts → GEX < 0 (dealer short puts).

const SQRT_2PI = Math.sqrt(2 * Math.PI);

export type OptionRight = "C" | "P";
export type GexRegime = "LONG_GAMMA" | "SHORT_GAMMA";

export interface OptionRow {
  strike: number;
  right: OptionRight;
  oi: number;
  gamma: number;
  expiryMs: number | null;
  iv: number | null;
}

export interface StrikeGex {
  strike: number;
  gex: number;
  callOi: number;
  putOi: number;
  callGex: number;
  putGex: number;
}

export interface GexProfile {
  spot: number;
  n: number;
  netGex: number;
  callGex: number;
  putGex: number;
  callOi: number;
  putOi: number;
  pcrOi: number | null;
  zeroGamma: number | null;
  callWall: number | null;
  putWall: number | null;
  profile: StrikeGex[];
  regime: GexRegime;
}

export interface MaxPainResult {
  strike: number;
  pain: number;
}

export interface ImpliedMoveResult {
  iv: number;
  tYears: number;
  moveAbs: number;
  movePct: number;
  expiryMs: number;
}

export interface DeribitInstrument {
  strike: number;
  right: OptionRight;
  expiryMs: number;
}

/** Densité normale standard φ(x). */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

/**
 * Gamma Black-Scholes (par unité de sous-jacent).
 */
export function bsGamma(S: number, K: number, T: number, sigma: number, r = 0): number {
  if (!(S > 0) || !(K > 0) || !(T > 0) || !(sigma > 0)) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  return normPdf(d1) / (S * sigma * sqrtT);
}

/** Parse instrument Deribit `BTC-26JUL24-65000-C` → { expiryMs, strike, right }. */
export function parseDeribitInstrument(name: string | null | undefined): DeribitInstrument | null {
  const parts = String(name || "").split("-");
  if (parts.length < 4) return null;
  const right = parts[parts.length - 1].toUpperCase();
  if (right !== "C" && right !== "P") return null;
  const strike = Number(parts[parts.length - 2]);
  const dateStr = parts[parts.length - 3]; // 26JUL24
  const m = dateStr.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/i);
  if (!m || !Number.isFinite(strike)) return null;
  const months: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const mon = months[m[2].toUpperCase()];
  if (mon == null) return null;
  const year = 2000 + Number(m[3]);
  const day = Number(m[1]);
  const expiryMs = Date.UTC(year, mon, day, 8, 0, 0); // ~08:00 UTC Deribit
  return { strike, right: right as OptionRight, expiryMs };
}

type RawOption = Record<string, unknown> & {
  greeks?: { gamma?: number };
  instrument_name?: string;
  open_interest?: number;
  mark_iv?: number;
};

/** Normalise une ligne chaîne (import JSON ou Deribit). */
export function normalizeOptionRow(
  raw: RawOption | null | undefined,
  spot: number | null | undefined,
  nowMs = Date.now(),
): OptionRow | null {
  if (!raw || typeof raw !== "object") return null;
  let strike = Number(raw.strike ?? raw.K);
  let right = String(raw.right ?? raw.option_type ?? raw.type ?? "").toUpperCase();
  if (right === "CALL") right = "C";
  if (right === "PUT") right = "P";
  let oi = Number(raw.oi ?? raw.open_interest ?? raw.openInterest ?? 0);
  let gamma = Number(raw.gamma ?? raw.greeks?.gamma);
  let iv = Number(raw.iv ?? raw.mark_iv ?? raw.markIv ?? raw.implied_volatility);
  if (iv > 3) iv = iv / 100; // 55 → 0.55
  let expiryMs: number | null =
    raw.expiryMs != null
      ? Number(raw.expiryMs)
      : raw.expiry_ms != null
        ? Number(raw.expiry_ms)
        : null;
  if (raw.expiry) expiryMs = Date.parse(String(raw.expiry));
  if (raw.expiration) expiryMs = Date.parse(String(raw.expiration));

  if (raw.instrument_name) {
    const p = parseDeribitInstrument(raw.instrument_name);
    if (p) {
      strike = p.strike;
      right = p.right;
      expiryMs = p.expiryMs;
    }
    if (raw.open_interest != null) oi = Number(raw.open_interest);
    if (raw.mark_iv != null) {
      iv = Number(raw.mark_iv);
      if (iv > 3) iv = iv / 100;
    }
  }

  if (!Number.isFinite(strike) || strike <= 0) return null;
  if (right !== "C" && right !== "P") return null;
  if (!Number.isFinite(oi) || oi < 0) oi = 0;

  if (!Number.isFinite(gamma) || gamma <= 0) {
    const S = Number(spot);
    const T =
      expiryMs && expiryMs > nowMs
        ? (expiryMs - nowMs) / (365.25 * 24 * 3600 * 1000)
        : 0;
    gamma = S > 0 && iv > 0 && T > 0 ? bsGamma(S, strike, T, iv) : 0;
  }

  return {
    strike,
    right: right as OptionRight,
    oi,
    gamma: Number.isFinite(gamma) ? gamma : 0,
    expiryMs: expiryMs && Number.isFinite(expiryMs) ? expiryMs : null,
    iv: Number.isFinite(iv) ? iv : null,
  };
}

/**
 * GEX unitaire (convention desk) pour 1 % de move :
 * sign(call=+1, put=-1) * oi * gamma * S² * 0.01 * multiplier
 */
export function gexContribution(
  row: OptionRow | null | undefined,
  spot: number,
  multiplier = 1,
): number {
  const S = Number(spot);
  if (!(S > 0) || !row) return 0;
  const sign = row.right === "C" ? 1 : -1;
  return sign * row.oi * row.gamma * S * S * 0.01 * multiplier;
}

export interface GexOpts {
  multiplier?: number;
  nowMs?: number;
}

/** Agrège le profil GEX. */
export function computeGexProfile(
  rows: Array<OptionRow | null | undefined> | null | undefined,
  spot: number,
  opts: GexOpts = {},
): GexProfile {
  const multiplier = opts.multiplier ?? 1;
  const S = Number(spot);
  const byStrike = new Map<number, StrikeGex>();
  let netGex = 0;
  let callGex = 0;
  let putGex = 0;
  let callOi = 0;
  let putOi = 0;
  let n = 0;

  for (const r of rows || []) {
    if (!r) continue;
    const g = gexContribution(r, S, multiplier);
    netGex += g;
    if (r.right === "C") {
      callGex += g;
      callOi += r.oi;
    } else {
      putGex += g;
      putOi += r.oi;
    }
    n++;
    const cur = byStrike.get(r.strike) || {
      strike: r.strike,
      gex: 0,
      callOi: 0,
      putOi: 0,
      callGex: 0,
      putGex: 0,
    };
    cur.gex += g;
    if (r.right === "C") {
      cur.callOi += r.oi;
      cur.callGex += g;
    } else {
      cur.putOi += r.oi;
      cur.putGex += g;
    }
    byStrike.set(r.strike, cur);
  }

  const profile = [...byStrike.values()].sort((a, b) => a.strike - b.strike);

  let zeroGamma: number | null = null;
  let cum = 0;
  let best = { abs: Infinity, strike: null as number | null };
  for (const p of profile) {
    cum += p.gex;
    const abs = Math.abs(cum);
    if (abs < best.abs) {
      best = { abs, strike: p.strike };
      zeroGamma = p.strike;
    }
  }

  let callWall: number | null = null;
  let putWall: number | null = null;
  let maxCall = -Infinity;
  let maxPut = Infinity;
  for (const p of profile) {
    if (p.callGex > maxCall) {
      maxCall = p.callGex;
      callWall = p.strike;
    }
    if (p.putGex < maxPut) {
      maxPut = p.putGex;
      putWall = p.strike;
    }
  }

  const pcrOi = callOi > 0 ? putOi / callOi : null;

  return {
    spot: S,
    n,
    netGex,
    callGex,
    putGex,
    callOi,
    putOi,
    pcrOi,
    zeroGamma,
    callWall,
    putWall,
    profile,
    regime: netGex >= 0 ? "LONG_GAMMA" : "SHORT_GAMMA",
  };
}

/** Max Pain : strike qui minimise la somme des valeurs intrinsèques × OI à expiry. */
export function computeMaxPain(
  rows: Array<OptionRow | null | undefined> | null | undefined,
): MaxPainResult | null {
  const list = (rows || []).filter((r): r is OptionRow => Boolean(r && r.oi > 0));
  if (!list.length) return null;
  const strikes = [...new Set(list.map((r) => r.strike))].sort((a, b) => a - b);
  let bestK = strikes[0];
  let bestPain = Infinity;
  for (const settle of strikes) {
    let pain = 0;
    for (const r of list) {
      if (r.right === "C") pain += Math.max(0, settle - r.strike) * r.oi;
      else pain += Math.max(0, r.strike - settle) * r.oi;
    }
    if (pain < bestPain) {
      bestPain = pain;
      bestK = settle;
    }
  }
  return { strike: bestK, pain: bestPain };
}

/** Implied move approx 1σ : spot * IV_ATM * sqrt(T). */
export function impliedMove(
  rows: Array<OptionRow | null | undefined> | null | undefined,
  spot: number,
  nowMs = Date.now(),
): ImpliedMoveResult | null {
  const S = Number(spot);
  if (!(S > 0)) return null;
  const withIv = (rows || []).filter(
    (r): r is OptionRow =>
      Boolean(r && r.iv != null && r.iv > 0 && r.expiryMs != null && r.expiryMs > nowMs),
  );
  if (!withIv.length) return null;
  const minExp = Math.min(...withIv.map((r) => r.expiryMs as number));
  const near = withIv.filter((r) => r.expiryMs === minExp);
  near.sort((a, b) => Math.abs(a.strike - S) - Math.abs(b.strike - S));
  const atm = near.slice(0, 4);
  const iv = atm.reduce((s, r) => s + (r.iv as number), 0) / atm.length;
  const T = (minExp - nowMs) / (365.25 * 24 * 3600 * 1000);
  if (!(T > 0) || !(iv > 0)) return null;
  const move = S * iv * Math.sqrt(T);
  return { iv, tYears: T, moveAbs: move, movePct: (move / S) * 100, expiryMs: minExp };
}

/** Convertit payload Deribit `result[]` → rows + spot. */
export function fromDeribitBookSummary(
  result: unknown,
  nowMs = Date.now(),
): { rows: OptionRow[]; spot: number | null } {
  const list = Array.isArray(result) ? (result as RawOption[]) : [];
  let spot: number | null = null;
  for (const row of list) {
    if (row.underlying_price != null && Number.isFinite(Number(row.underlying_price))) {
      spot = Number(row.underlying_price);
      break;
    }
  }
  const rows = list
    .map((raw) => normalizeOptionRow(raw, spot, nowMs))
    .filter((r): r is OptionRow => Boolean(r));
  return { rows, spot };
}

export function deribitSummaryUrl(currency = "BTC"): string {
  const c = String(currency || "BTC").toUpperCase();
  return `/api/deribit/public/get_book_summary_by_currency?currency=${encodeURIComponent(c)}&kind=option`;
}

export interface FetchDeribitOpts {
  fetchImpl?: typeof fetch;
  nowMs?: number;
}

export interface DeribitFetchResult {
  rows: OptionRow[];
  spot: number | null;
  currency: string;
  fetchedAt: number;
}

/** Fetch Deribit via proxy allowlisté. */
export async function fetchDeribitOptions(
  currency = "BTC",
  opts: FetchDeribitOpts = {},
): Promise<DeribitFetchResult> {
  const fetchImpl = opts.fetchImpl || fetch;
  const url = deribitSummaryUrl(currency);
  const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Deribit HTTP ${res.status}`);
  const body = (await res.json()) as {
    error?: { message?: string };
    result?: unknown;
  };
  if (body.error) throw new Error(body.error.message || JSON.stringify(body.error));
  const { rows, spot } = fromDeribitBookSummary(body.result || [], opts.nowMs);
  if (!rows.length) throw new Error("Aucune option dans la réponse Deribit");
  return { rows, spot, currency: String(currency).toUpperCase(), fetchedAt: Date.now() };
}

/** Parse import JSON utilisateur (array ou { options, spot }). */
export function parseOptionsImport(payload: unknown): { rows: OptionRow[]; spot: number | null } {
  let data: unknown = payload;
  if (typeof payload === "string") {
    data = JSON.parse(payload);
  }
  let spot: number | null = null;
  let list: RawOption[] = [];
  if (Array.isArray(data)) {
    list = data as RawOption[];
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    spot = obj.spot != null ? Number(obj.spot) : null;
    const maybe =
      (obj.options as RawOption[] | undefined) ||
      (obj.chain as RawOption[] | undefined) ||
      (obj.result as RawOption[] | undefined) ||
      [];
    list = Array.isArray(maybe) ? maybe : [];
  }
  if (!Array.isArray(list)) throw new Error("JSON options invalide");
  if (spot == null) {
    for (const r of list) {
      if (r.underlying_price != null) {
        spot = Number(r.underlying_price);
        break;
      }
      if (r.spot != null) {
        spot = Number(r.spot);
        break;
      }
    }
  }
  const rows = list.map((r) => normalizeOptionRow(r, spot)).filter((r): r is OptionRow => Boolean(r));
  return { rows, spot };
}
