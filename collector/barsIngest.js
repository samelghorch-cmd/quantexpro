// Ingestion collector → backend TimescaleDB /v1/bars (P3-COLLECTOR-INGEST).
// Opt-in via QX_API_BASE_URL + QX_API_KEY. Aucune dépendance npm.

/** BTCUSDT → BTC (symbole catalogue QuantEXPro). */
export function tickerToSymbol(ticker) {
  const t = String(ticker || "").toUpperCase();
  if (t.endsWith("USDT")) return t.slice(0, -4);
  return t;
}

export function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Barre collector {t,o,h,l,c,v,vBuy?} → BarIn API. */
export function toApiBar(symbol, b) {
  const row = {
    symbol,
    ts: new Date(b.t).toISOString(),
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: Number.isFinite(b.v) ? b.v : 0,
  };
  if (b.vBuy != null && Number.isFinite(b.vBuy)) row.volume_buy = b.vBuy;
  return row;
}

/**
 * Ne pousse que les barres strictement plus récentes que `afterTs` (ms).
 * Si afterTs null → backfill des `backfillMax` dernières.
 */
export function selectBarsForIngest(series, afterTs, backfillMax = 500) {
  const all = Array.isArray(series) ? series : [];
  if (afterTs == null) return all.slice(-backfillMax);
  return all.filter((b) => b.t > afterTs);
}

/**
 * POST /v1/bars/{timeframe} par lots.
 * @returns {{ written: number, batches: number, lastTs: number|null }}
 */
export async function pushBarsToBackend({
  baseUrl,
  apiKey,
  timeframe,
  symbol,
  bars,
  chunkSize = 5000,
  fetchImpl = fetch,
}) {
  if (!baseUrl || !apiKey) throw new Error("QX_API_BASE_URL / QX_API_KEY manquants");
  if (!bars.length) return { written: 0, batches: 0, lastTs: null };
  const base = String(baseUrl).replace(/\/$/, "");
  const payload = bars.map((b) => toApiBar(symbol, b));
  const chunks = chunkArray(payload, chunkSize);
  let written = 0;
  for (const batch of chunks) {
    const res = await fetchImpl(`${base}/v1/bars/${timeframe}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(batch),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try { detail = JSON.parse(text)?.detail || text; } catch { /* keep */ }
      throw new Error(`ingest HTTP ${res.status}: ${detail}`);
    }
    try {
      const body = JSON.parse(text);
      written += Number(body.written ?? batch.length);
    } catch {
      written += batch.length;
    }
  }
  const lastTs = bars[bars.length - 1]?.t ?? null;
  return { written, batches: chunks.length, lastTs };
}

export function ingestConfigFromEnv(env = process.env) {
  const baseUrl = (env.QX_API_BASE_URL || env.QX_API_URL || "").replace(/\/$/, "");
  const apiKey = env.QX_API_KEY || "";
  // Opt-in explicite : QX_BARS_INGEST=1 (+ URL + clé)
  const enabled = env.QX_BARS_INGEST === "1" && Boolean(baseUrl && apiKey);
  return {
    enabled,
    baseUrl,
    apiKey,
    backfillMax: Number(env.QX_BARS_BACKFILL || 500),
    chunkSize: Number(env.QX_BARS_CHUNK || 5000),
  };
}
