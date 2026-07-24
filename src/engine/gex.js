// P4-GEX — Gamma Exposure / Max Pain / PCR (Module 5).
// Chaîne d'options → profil GEX par strike. Sources : JSON import ou Deribit public.
// Convention desk (type SpotGamma) : calls → GEX > 0, puts → GEX < 0 (dealer short puts).

const SQRT_2PI = Math.sqrt(2 * Math.PI);

/** Densité normale standard φ(x). */
export function normPdf(x) {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

/**
 * Gamma Black-Scholes (par unité de sous-jacent).
 * @param {number} S spot
 * @param {number} K strike
 * @param {number} T années jusqu'à expiry (>0)
 * @param {number} sigma IV décimale (ex. 0.55)
 * @param {number} [r=0]
 */
export function bsGamma(S, K, T, sigma, r = 0) {
  if (!(S > 0) || !(K > 0) || !(T > 0) || !(sigma > 0)) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  return normPdf(d1) / (S * sigma * sqrtT);
}

/** Parse instrument Deribit `BTC-26JUL24-65000-C` → { expiryMs, strike, right }. */
export function parseDeribitInstrument(name) {
  const parts = String(name || "").split("-");
  if (parts.length < 4) return null;
  const right = parts[parts.length - 1].toUpperCase();
  if (right !== "C" && right !== "P") return null;
  const strike = Number(parts[parts.length - 2]);
  const dateStr = parts[parts.length - 3]; // 26JUL24
  const m = dateStr.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/i);
  if (!m || !Number.isFinite(strike)) return null;
  const months = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const mon = months[m[2].toUpperCase()];
  if (mon == null) return null;
  const year = 2000 + Number(m[3]);
  const day = Number(m[1]);
  const expiryMs = Date.UTC(year, mon, day, 8, 0, 0); // ~08:00 UTC Deribit
  return { strike, right, expiryMs };
}

/**
 * Normalise une ligne chaîne (import JSON ou Deribit).
 * @returns {{ strike: number, right: 'C'|'P', oi: number, gamma: number, expiryMs: number|null, iv: number|null } | null}
 */
export function normalizeOptionRow(raw, spot, nowMs = Date.now()) {
  if (!raw || typeof raw !== "object") return null;
  let strike = Number(raw.strike ?? raw.K);
  let right = String(raw.right ?? raw.option_type ?? raw.type ?? "").toUpperCase();
  if (right === "CALL") right = "C";
  if (right === "PUT") right = "P";
  let oi = Number(raw.oi ?? raw.open_interest ?? raw.openInterest ?? 0);
  let gamma = Number(raw.gamma ?? raw.greeks?.gamma);
  let iv = Number(raw.iv ?? raw.mark_iv ?? raw.markIv ?? raw.implied_volatility);
  if (iv > 3) iv = iv / 100; // 55 → 0.55
  let expiryMs = raw.expiryMs ?? raw.expiry_ms ?? null;
  if (raw.expiry) expiryMs = Date.parse(raw.expiry);
  if (raw.expiration) expiryMs = Date.parse(raw.expiration);

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
    const T = expiryMs && expiryMs > nowMs ? (expiryMs - nowMs) / (365.25 * 24 * 3600 * 1000) : 0;
    gamma = S > 0 && iv > 0 && T > 0 ? bsGamma(S, strike, T, iv) : 0;
  }

  return {
    strike,
    right,
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
export function gexContribution(row, spot, multiplier = 1) {
  const S = Number(spot);
  if (!(S > 0) || !row) return 0;
  const sign = row.right === "C" ? 1 : -1;
  return sign * row.oi * row.gamma * S * S * 0.01 * multiplier;
}

/**
 * Agrège le profil GEX.
 * @param {object[]} rows normalizeOptionRow[]
 * @param {number} spot
 * @param {{ multiplier?: number, nowMs?: number }} [opts]
 */
export function computeGexProfile(rows, spot, opts = {}) {
  const multiplier = opts.multiplier ?? 1;
  const S = Number(spot);
  const byStrike = new Map();
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
    const cur = byStrike.get(r.strike) || { strike: r.strike, gex: 0, callOi: 0, putOi: 0, callGex: 0, putGex: 0 };
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

  // Zero-gamma : croisement net cumulé le plus proche de 0 en balayant les strikes
  let zeroGamma = null;
  let cum = 0;
  let best = { abs: Infinity, strike: null };
  for (const p of profile) {
    cum += p.gex;
    const abs = Math.abs(cum);
    if (abs < best.abs) {
      best = { abs, strike: p.strike };
      zeroGamma = p.strike;
    }
  }

  // Call wall / put wall = strike |GEX| max du côté call / put
  let callWall = null;
  let putWall = null;
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

/**
 * Max Pain : strike qui minimise la somme des valeurs intrinsèques × OI à expiry.
 */
export function computeMaxPain(rows) {
  const list = (rows || []).filter((r) => r && r.oi > 0);
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

/** Implied move approx 1σ : spot * IV_ATM * sqrt(T) — IV_ATM = moyenne IV nearest strikes. */
export function impliedMove(rows, spot, nowMs = Date.now()) {
  const S = Number(spot);
  if (!(S > 0)) return null;
  const withIv = (rows || []).filter((r) => r.iv > 0 && r.expiryMs > nowMs);
  if (!withIv.length) return null;
  // Nearest expiry
  const minExp = Math.min(...withIv.map((r) => r.expiryMs));
  const near = withIv.filter((r) => r.expiryMs === minExp);
  near.sort((a, b) => Math.abs(a.strike - S) - Math.abs(b.strike - S));
  const atm = near.slice(0, 4);
  const iv = atm.reduce((s, r) => s + r.iv, 0) / atm.length;
  const T = (minExp - nowMs) / (365.25 * 24 * 3600 * 1000);
  if (!(T > 0) || !(iv > 0)) return null;
  const move = S * iv * Math.sqrt(T);
  return { iv, tYears: T, moveAbs: move, movePct: (move / S) * 100, expiryMs: minExp };
}

/** Convertit payload Deribit `result[]` → rows + spot. */
export function fromDeribitBookSummary(result, nowMs = Date.now()) {
  const list = Array.isArray(result) ? result : [];
  let spot = null;
  for (const row of list) {
    if (row.underlying_price != null && Number.isFinite(Number(row.underlying_price))) {
      spot = Number(row.underlying_price);
      break;
    }
  }
  const rows = list
    .map((raw) => normalizeOptionRow(raw, spot, nowMs))
    .filter(Boolean);
  return { rows, spot };
}

export function deribitSummaryUrl(currency = "BTC") {
  const c = String(currency || "BTC").toUpperCase();
  return `/api/deribit/public/get_book_summary_by_currency?currency=${encodeURIComponent(c)}&kind=option`;
}

/**
 * Fetch Deribit via proxy allowlisté.
 * @returns {Promise<{ rows: object[], spot: number|null, currency: string, fetchedAt: number }>}
 */
export async function fetchDeribitOptions(currency = "BTC", opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const url = deribitSummaryUrl(currency);
  const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Deribit HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || JSON.stringify(body.error));
  const { rows, spot } = fromDeribitBookSummary(body.result || [], opts.nowMs);
  if (!rows.length) throw new Error("Aucune option dans la réponse Deribit");
  return { rows, spot, currency: String(currency).toUpperCase(), fetchedAt: Date.now() };
}

/** Parse import JSON utilisateur (array ou { options, spot }). */
export function parseOptionsImport(payload) {
  let data = payload;
  if (typeof payload === "string") {
    data = JSON.parse(payload);
  }
  let spot = null;
  let list = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === "object") {
    spot = data.spot != null ? Number(data.spot) : null;
    list = data.options || data.chain || data.result || [];
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
  const rows = list.map((r) => normalizeOptionRow(r, spot)).filter(Boolean);
  return { rows, spot };
}
