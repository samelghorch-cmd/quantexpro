// Schéma d'import Dukascopy / séries profondes (P2-DUKA).
// Partagé : Data Manager (navigateur) + tools/dukascopy (Node).

/** TF Dukascopy → facteur interne app (voir marketData.TF_MAP). */
export const DUKA_TF = { m5: 1, m15: 3, h1: 12, h4: 48, d1: 288 };

/** Clé app → instrument Dukascopy. */
export const DUKA_INSTRUMENT = {
  EURUSD: "eurusd", GBPUSD: "gbpusd", USDJPY: "usdjpy", AUDUSD: "audusd", USDCAD: "usdcad",
  GOLD: "xauusd", SILVER: "xagusd",
  SPX: "usa500idxusd", NDX: "usatechidxusd", DJI: "usa30idxusd", DAX: "deuidxeur",
  WTI: "lightcmdusd", BRENT: "brentcmdusd",
  BTC: "btcusd", ETH: "ethusd",
};

/**
 * Normalise les lignes dukascopy-node → barres {t,o,h,l,c,v}.
 * Accepte aussi des barres déjà au format interne.
 */
export function normalizeDukaRows(rows: unknown) {
  if (!Array.isArray(rows)) return [];
  const bars = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const t = Number(r.t ?? r.timestamp ?? r.time);
    const o = Number(r.o ?? r.open);
    const h = Number(r.h ?? r.high);
    const l = Number(r.l ?? r.low);
    const c = Number(r.c ?? r.close);
    const v = Number(r.v ?? r.volume ?? 0);
    if (!(t > 0) || ![o, h, l, c].every(Number.isFinite)) continue;
    if (!(h >= l) || !(h >= o) || !(h >= c) || !(l <= o) || !(l <= c)) continue;
    bars.push({ t, o, h, l, c, v: Number.isFinite(v) ? v : 0 });
  }
  bars.sort((a, b) => a.t - b.t);
  // dédoublonne timestamps
  const out = [];
  let lastT = -1;
  for (const b of bars) {
    if (b.t === lastT) { out[out.length - 1] = b; continue; }
    out.push(b);
    lastT = b.t;
  }
  return out;
}

/**
 * Valide un objet série importable.
 * @returns {{ ok: boolean, errors: string[], series?: object }}
 */
export function validateImportSeries(raw: any) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["payload non-objet"] };
  const symbolKey = String(raw.symbolKey || "").toUpperCase();
  if (!symbolKey) errors.push("symbolKey manquant");
  const tf = Number(raw.tf);
  if (!Number.isFinite(tf) || ![1, 3, 12, 48, 288].includes(tf)) {
    errors.push(`tf invalide (${raw.tf}) — attendu 1|3|12|48|288`);
  }
  const bars = normalizeDukaRows(raw.bars);
  if (bars.length < 10) errors.push(`trop peu de barres (${bars.length})`);
  if (errors.length) return { ok: false, errors };

  // sanity chronologie
  for (let i = 1; i < Math.min(bars.length, 5000); i++) {
    if (bars[i].t <= bars[i - 1].t) {
      errors.push("timestamps non strictement croissants");
      break;
    }
  }
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    series: {
      symbolKey,
      tf,
      provider: String(raw.provider || "dukascopy"),
      bars,
      meta: {
        n: bars.length,
        from: bars[0].t,
        to: bars[bars.length - 1].t,
        years: (bars[bars.length - 1].t - bars[0].t) / (365.25 * 86400000),
      },
    },
  };
}

/** Parse JSON (objet ou tableau) → séries validées + rapport. */
export function parseImportPayload(data: any) {
  const list = Array.isArray(data) ? data : [data];
  const ok = [];
  const failed = [];
  for (let i = 0; i < list.length; i++) {
    const r = validateImportSeries(list[i]);
    if (r.ok) ok.push(r.series);
    else failed.push({ index: i, symbolKey: list[i]?.symbolKey, errors: r.errors });
  }
  return { ok, failed, total: list.length };
}

/** Découpe [from, to] en fenêtres annuelles (évite timeouts sur 15-20 ans). */
export function yearChunks(from: string | number | Date, to: string | number | Date) {
  const start = new Date(from);
  const end = new Date(to);
  if (!(start < end)) return [];
  const chunks = [];
  let y = start.getUTCFullYear();
  let cursor = new Date(start);
  while (cursor < end) {
    const nextYear = new Date(Date.UTC(y + 1, 0, 1));
    const chunkEnd = nextYear < end ? nextYear : end;
    if (cursor < chunkEnd) chunks.push({ from: new Date(cursor), to: new Date(chunkEnd) });
    cursor = chunkEnd;
    y++;
  }
  return chunks;
}
