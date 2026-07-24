// P3-ZDL-SYNC — pont IndexedDB ↔ API TimescaleDB (/v1/bars).
// Fail-soft : si l'API est absente, les fonctions lèvent une Error explicite (UI Data Manager).

import { apiFetch, getApiBaseUrl, getApiKey } from "./apiClient.ts";
import { findSymbol, importSeries } from "./marketData.ts";

/** Facteur TF dashboard → timeframe API. */
export const TF_TO_API: Record<number, string> = {
  1: "5m",
  3: "15m",
  12: "1h",
  48: "4h",
  288: "1d",
};

export const API_TO_TF: Record<string, number> = Object.fromEntries(
  Object.entries(TF_TO_API).map(([k, v]) => [v, Number(k)]),
);

export function tfToApi(tf: number): string {
  const api = TF_TO_API[tf];
  if (!api) throw new Error(`TF non synchronisable : ${tf} (attendu ${Object.keys(TF_TO_API).join("|")})`);
  return api;
}

export interface InternalBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
  vb?: number;
  volume_buy?: number;
}

/** Barre interne → payload BarIn API. */
export function toApiBar(symbol: string, b: InternalBar) {
  const ts = new Date(b.t).toISOString();
  const volume_buy = b.vb ?? b.volume_buy;
  return {
    symbol,
    ts,
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: Number.isFinite(b.v) ? Number(b.v) : 0,
    ...(volume_buy != null && Number.isFinite(volume_buy) ? { volume_buy: Number(volume_buy) } : {}),
  };
}

/** BarOut API → barre interne. */
export function fromApiBar(row: {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volume_buy?: number | null;
}): InternalBar {
  const t = Date.parse(row.ts);
  const bar: InternalBar = {
    t,
    o: row.open,
    h: row.high,
    l: row.low,
    c: row.close,
    v: row.volume || 0,
  };
  if (row.volume_buy != null) bar.vb = row.volume_buy;
  return bar;
}

export function chunkBars<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function isApiConfigured(): boolean {
  return Boolean(getApiBaseUrl() && getApiKey());
}

export async function pingApi(): Promise<{ ok: boolean; detail: string }> {
  try {
    const body = await apiFetch("/health");
    return { ok: true, detail: typeof body === "object" ? JSON.stringify(body) : String(body) };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Pousse une série IndexedDB/local vers POST /v1/bars/{tf}.
 * Découpe en lots ≤ chunkSize (backpressure API).
 */
export async function pushBarsToApi(
  symbolKey: string,
  tf: number,
  bars: InternalBar[],
  opts: { chunkSize?: number } = {},
): Promise<{ written: number; batches: number; timeframe: string }> {
  if (!isApiConfigured()) throw new Error("Configure l'URL API + clé (Data Manager / Prompt Mode).");
  const sym = findSymbol(symbolKey);
  if (!sym) throw new Error(`Symbole inconnu : ${symbolKey}`);
  const timeframe = tfToApi(tf);
  const chunkSize = opts.chunkSize ?? 5000;
  const payload = bars.map((b) => toApiBar(symbolKey, b));
  const chunks = chunkBars(payload, chunkSize);
  let written = 0;
  for (const batch of chunks) {
    const res = await apiFetch(`/v1/bars/${timeframe}`, {
      method: "POST",
      body: JSON.stringify(batch),
    }) as { written?: number };
    written += Number(res?.written ?? batch.length);
  }
  return { written, batches: chunks.length, timeframe };
}

/**
 * Tire toutes les pages GET /v1/bars/{symbol}?timeframe=… et écrit dans IndexedDB.
 */
export async function pullBarsFromApi(
  symbolKey: string,
  tf: number,
  opts: { pageLimit?: number; maxPages?: number } = {},
): Promise<{ count: number; timeframe: string }> {
  if (!isApiConfigured()) throw new Error("Configure l'URL API + clé (Data Manager / Prompt Mode).");
  const sym = findSymbol(symbolKey);
  if (!sym) throw new Error(`Symbole inconnu : ${symbolKey}`);
  const timeframe = tfToApi(tf);
  const pageLimit = opts.pageLimit ?? 1000;
  const maxPages = opts.maxPages ?? 200;
  const all: InternalBar[] = [];
  let cursor: string | null = null;
  for (let p = 0; p < maxPages; p++) {
    const q = new URLSearchParams({
      timeframe,
      limit: String(pageLimit),
    });
    if (cursor) q.set("cursor", cursor);
    const page = await apiFetch(`/v1/bars/${encodeURIComponent(symbolKey)}?${q}`) as {
      items?: unknown[];
      next_cursor?: string | null;
    };
    const items = (page.items || []) as Parameters<typeof fromApiBar>[0][];
    for (const row of items) all.push(fromApiBar(row));
    cursor = page.next_cursor || null;
    if (!cursor || items.length === 0) break;
  }
  if (!all.length) throw new Error(`Aucune barre API pour ${symbolKey} ${TF_TO_API[tf] || tf}`);
  all.sort((a, b) => a.t - b.t);
  await importSeries(symbolKey, tf, all, { provider: "timescale" });
  return { count: all.length, timeframe };
}
