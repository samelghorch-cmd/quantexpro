// @ts-nocheck — migration bulk P10-TS-ENGINE; typage strict à reprendre fichier par fichier.
// COT (Commitments of Traders) réel — CFTC, dataset public Socrata, sans clé et CORS ouvert (fetch direct).
// Positionnement net des gros spéculateurs (non-commercial) vs hedgers (commercial) par marché.
import { idbGet, idbPut } from "./dataStore.ts";

const TTL = 24 * 3600 * 1000; // COT publié 1×/semaine → cache 24 h
const BASE = "https://publicreporting.cftc.gov/resource/6dca-aqww.json";

// Marchés suivis (terme de filtre distinctif → label).
export const COT_MARKETS = [
  { key: "gold", term: "GOLD - COMMODITY EXCHANGE", label: "Or" },
  { key: "silver", term: "SILVER - COMMODITY EXCHANGE", label: "Argent" },
  { key: "wti", term: "CRUDE OIL, LIGHT SWEET", label: "Pétrole WTI" },
  { key: "spx", term: "E-MINI S&P 500 STOCK INDEX", label: "S&P 500 (e-mini)" },
  { key: "nasdaq", term: "NASDAQ-100 STOCK INDEX (MINI)", label: "Nasdaq 100 (mini)" },
  { key: "eur", term: "EURO FX - CHICAGO MERCANTILE", label: "Euro FX" },
  { key: "ust10", term: "10-YEAR U.S. TREASURY NOTES", label: "10Y Treasury" },
];

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

export async function fetchCot(market, { force = false } = {}) {
  const cacheId = `macro:cot:${market.key}`;
  if (!force) {
    try { const rec = await idbGet(cacheId); if (rec && Date.now() - rec.ts < TTL) return rec.series; } catch { /* noop */ }
  }
  const where = encodeURIComponent(`market_and_exchange_names like '%${market.term}%'`);
  const select = encodeURIComponent("market_and_exchange_names,report_date_as_yyyy_mm_dd,open_interest_all,noncomm_positions_long_all,noncomm_positions_short_all,comm_positions_long_all,comm_positions_short_all");
  const order = encodeURIComponent("report_date_as_yyyy_mm_dd DESC");
  const url = `${BASE}?$where=${where}&$select=${select}&$order=${order}&$limit=520`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`CFTC ${r.status}`);
  const rows = await r.json();
  if (!rows.length) throw new Error("Aucune donnée COT");

  // Regroupe par nom de marché exact et garde le contrat principal (plus gros open interest récent)
  const byName = {};
  rows.forEach((row) => { (byName[row.market_and_exchange_names] ||= []).push(row); });
  const primary = Object.entries(byName).sort((a, b) => num(b[1][0].open_interest_all) - num(a[1][0].open_interest_all))[0][1];

  const series = primary
    .map((row) => {
      const ncL = num(row.noncomm_positions_long_all), ncS = num(row.noncomm_positions_short_all);
      const cL = num(row.comm_positions_long_all), cS = num(row.comm_positions_short_all);
      return {
        t: new Date(row.report_date_as_yyyy_mm_dd).getTime(),
        oi: num(row.open_interest_all),
        ncNet: ncL - ncS, cNet: cL - cS,
        pctLongNC: (ncL + ncS) ? (ncL / (ncL + ncS)) * 100 : 0,
      };
    })
    .sort((a, b) => a.t - b.t);

  if (series.length) { try { await idbPut({ id: cacheId, series, ts: Date.now() }); } catch { /* noop */ } }
  return series;
}
