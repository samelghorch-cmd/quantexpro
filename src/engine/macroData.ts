// @ts-nocheck — migration bulk P10-TS-ENGINE; typage strict à reprendre fichier par fichier.
// Couche macro réelle — FRED (Federal Reserve Economic Data), sans clé API via fredgraph.csv.
// Séries : taux du Trésor, spreads, inflation, bilan de la Fed, VIX, spreads high yield…
// Cache IndexedDB (mêmes helpers que les données de marché) pour éviter de re-télécharger.
import { idbGet, idbPut } from "./dataStore.ts";

const TTL = 12 * 3600 * 1000; // 12 h

// Catalogue des séries FRED utilisées.
export const FRED = {
  // Courbe des taux du Trésor US
  DGS1MO: { label: "1M", years: 1 / 12 }, DGS3MO: { label: "3M", years: 0.25 }, DGS6MO: { label: "6M", years: 0.5 },
  DGS1: { label: "1A", years: 1 }, DGS2: { label: "2A", years: 2 }, DGS5: { label: "5A", years: 5 },
  DGS10: { label: "10A", years: 10 }, DGS30: { label: "30A", years: 30 },
  T10Y2Y: { label: "Spread 10A-2A" }, T10Y3M: { label: "Spread 10A-3M" },
  // Inflation
  CPIAUCSL: { label: "CPI (indice)" }, T10YIE: { label: "Point mort inflation 10A" }, T5YIFR: { label: "Inflation 5A dans 5A" },
  // Politique monétaire & liquidité
  FEDFUNDS: { label: "Taux directeur Fed" }, DFF: { label: "Fed Funds (j)" },
  WALCL: { label: "Bilan de la Fed" }, RRPONTSYD: { label: "Reverse Repo" }, WTREGEN: { label: "Compte du Trésor (TGA)" },
  // Risque
  VIXCLS: { label: "VIX" }, BAMLH0A0HYM2: { label: "Spread High Yield" }, UNRATE: { label: "Chômage US" },
  DTWEXBGS: { label: "Dollar (indice large)" },
};

function parseFredCsv(text) {
  const lines = text.trim().split("\n");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, val] = lines[i].split(",");
    const v = parseFloat(val);
    if (date && Number.isFinite(v)) out.push({ t: new Date(date).getTime(), v });
  }
  return out;
}

// Récupère une série FRED (avec cache IndexedDB).
export async function fetchFred(id, { force = false } = {}) {
  const cacheId = `macro:fred:${id}`;
  if (!force) {
    try { const rec = await idbGet(cacheId); if (rec && Date.now() - rec.ts < TTL) return rec.series; } catch { /* noop */ }
  }
  const r = await fetch(`/api/fred/graph/fredgraph.csv?id=${id}`);
  if (!r.ok) throw new Error(`FRED ${id} : ${r.status}`);
  const series = parseFredCsv(await r.text());
  if (series.length) { try { await idbPut({ id: cacheId, series, ts: Date.now() }); } catch { /* noop */ } }
  return series;
}

// Récupère plusieurs séries avec concurrence limitée + retry (évite le rate-limit du proxy) → { id: series }.
export async function fetchFredMany(ids, opts) {
  const out = {};
  const queue = [...ids];
  const CONC = 4;
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      let series = [];
      for (let attempt = 0; attempt < 2; attempt++) {
        try { series = await fetchFred(id, opts); break; }
        catch { await new Promise((r) => setTimeout(r, 400)); }
      }
      out[id] = series;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONC, ids.length) }, worker));
  return out;
}

export const lastVal = (series) => (series && series.length ? series[series.length - 1].v : null);
export const lastDate = (series) => (series && series.length ? series[series.length - 1].t : null);

// Variation en % sur ~1 an (pour l'inflation CPI en glissement annuel).
export function yoy(series) {
  if (!series || series.length < 13) return null;
  const last = series[series.length - 1];
  // cherche le point ~12 mois avant
  const target = last.t - 365 * 864e5;
  let prev = series[0];
  for (const p of series) { if (p.t <= target) prev = p; else break; }
  return prev.v ? ((last.v - prev.v) / prev.v) * 100 : null;
}
