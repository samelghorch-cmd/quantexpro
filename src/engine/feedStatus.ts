// P4-FEEDS / P5-TS — statut multi-feeds (bandeau). Uniquement des sources réellement
// branchées ou explicitement « hors scope ». Aucune cotation inventée présentée comme live.
import { getApiBaseUrl, getApiKey } from "./apiClient.js";
import { getCollectorUrl } from "./collectorClient.js";

export type FeedHealth = "ok" | "down" | "unconfigured" | "scoped_out" | "unknown";
export type FeedTone = "green" | "red" | "yellow" | "dim";
export type FeedKind = "market" | "zdl" | "options" | "institutional";

export interface FeedCatalogEntry {
  id: string;
  label: string;
  kind: FeedKind;
  description: string;
  scopedOut?: boolean;
}

export interface FeedListItem {
  id: string;
  label: string;
  kind: FeedKind;
  description: string;
  scopedOut: boolean;
}

export interface ProbeRaw {
  ok?: boolean;
  unconfigured?: boolean;
  detail?: string;
  latencyMs?: number;
}

export interface FeedStatus {
  id: string;
  label: string;
  kind: string;
  status: FeedHealth;
  detail: string;
  latencyMs: number | null;
  checkedAt: number;
}

export interface FeedSummary {
  n: number;
  ok: number;
  down: number;
  unconfigured: number;
  scoped_out: number;
  unknown: number;
  liveOk: number;
  needsConfig: number;
}

type FetchLike = typeof fetch;
type ProbeFn = (fetchImpl?: FetchLike) => Promise<ProbeRaw>;

/**
 * Catalogue feeds — `probe` optionnel (async → { ok, detail?, latencyMs? }).
 * Les feeds `scoped_out` n'ont pas de probe (Databento/LSE/… hors contrat gratuit).
 */
export const FEED_CATALOG: readonly FeedCatalogEntry[] = [
  {
    id: "binance",
    label: "Binance",
    kind: "market",
    description: "Crypto spot REST/WS (public)",
  },
  {
    id: "yahoo",
    label: "Yahoo",
    kind: "market",
    description: "Proxy /api/yf (équités / FX)",
  },
  {
    id: "timescale",
    label: "Timescale",
    kind: "zdl",
    description: "API QuantEXPro /health",
  },
  {
    id: "collector",
    label: "Collector",
    kind: "zdl",
    description: "Jobs 24/7 paper Binance",
  },
  {
    id: "deribit",
    label: "Deribit",
    kind: "options",
    description: "Options GEX (public)",
  },
  {
    id: "databento",
    label: "Databento",
    kind: "institutional",
    scopedOut: true,
    description: "Hors scope — clé institutionnelle requise",
  },
  {
    id: "cboe",
    label: "CBOE",
    kind: "institutional",
    scopedOut: true,
    description: "Hors scope — options equity payantes",
  },
];

export function listFeeds(): FeedListItem[] {
  return FEED_CATALOG.map(({ id, label, kind, description, scopedOut }) => ({
    id,
    label,
    kind,
    description,
    scopedOut: Boolean(scopedOut),
  }));
}

export function feedStatusTone(status: FeedHealth): FeedTone {
  if (status === "ok") return "green";
  if (status === "down") return "red";
  if (status === "unconfigured") return "yellow";
  if (status === "scoped_out") return "dim";
  return "dim";
}

async function timed(fn: () => Promise<ProbeRaw>): Promise<ProbeRaw> {
  const t0 = Date.now();
  try {
    const r = await fn();
    return { ...r, latencyMs: Date.now() - t0 };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - t0,
    };
  }
}

/** Probe Binance public ping (via proxy Vite/Pages — CORS). */
export async function probeBinance(fetchImpl: FetchLike = fetch): Promise<ProbeRaw> {
  return timed(async () => {
    const res = await fetchImpl("/api/binance/ping");
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    return { ok: true, detail: "pong" };
  });
}

/** Probe Yahoo via proxy Vite/Pages. */
export async function probeYahoo(fetchImpl: FetchLike = fetch): Promise<ProbeRaw> {
  return timed(async () => {
    const res = await fetchImpl("/api/yf/v8/finance/chart/EURUSD=X?interval=1d&range=5d", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const body = (await res.json().catch(() => null)) as {
      chart?: { result?: unknown[] };
    } | null;
    const ok = Boolean(body?.chart?.result?.[0]);
    return { ok, detail: ok ? "chart ok" : "payload inattendu" };
  });
}

/** Probe Timescale API /health. */
export async function probeTimescale(fetchImpl: FetchLike = fetch): Promise<ProbeRaw> {
  const base = getApiBaseUrl() as string;
  const key = getApiKey() as string;
  if (!base || !key) {
    return { ok: false, unconfigured: true, detail: "URL/clé absente", latencyMs: 0 };
  }
  return timed(async () => {
    const res = await fetchImpl(`${base}/health`, {
      headers: { "X-API-Key": key, Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    return { ok: true, detail: "healthy" };
  });
}

/** Probe collector /health. */
export async function probeCollector(fetchImpl: FetchLike = fetch): Promise<ProbeRaw> {
  const base = getCollectorUrl() as string;
  if (!base) {
    return { ok: false, unconfigured: true, detail: "URL collecteur absente", latencyMs: 0 };
  }
  return timed(async () => {
    const res = await fetchImpl(`${base}/health`, { headers: { Accept: "application/json" } });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; jobs?: number | string };
    return { ok: Boolean(body.ok ?? true), detail: `jobs=${body.jobs ?? "?"}` };
  });
}

/** Probe Deribit via proxy allowlisté. */
export async function probeDeribit(fetchImpl: FetchLike = fetch): Promise<ProbeRaw> {
  return timed(async () => {
    const res = await fetchImpl(
      "/api/deribit/public/get_book_summary_by_currency?currency=BTC&kind=option",
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const body = (await res.json().catch(() => null)) as { result?: unknown[] } | null;
    const n = Array.isArray(body?.result) ? body.result.length : 0;
    return { ok: n > 0, detail: n ? `${n} options` : "vide" };
  });
}

/** Normalise un résultat probe → entrée UI. */
export function toFeedStatus(id: string, raw: ProbeRaw = {}): FeedStatus {
  const meta = FEED_CATALOG.find((f) => f.id === id) || {
    id,
    label: id,
    kind: "market" as FeedKind,
    description: "",
  };
  if (meta.scopedOut) {
    return {
      id,
      label: meta.label,
      kind: meta.kind,
      status: "scoped_out",
      detail: meta.description,
      latencyMs: null,
      checkedAt: Date.now(),
    };
  }
  let status: FeedHealth = "unknown";
  if (raw.unconfigured) status = "unconfigured";
  else if (raw.ok === true) status = "ok";
  else if (raw.ok === false) status = "down";
  return {
    id,
    label: meta.label,
    kind: meta.kind,
    status,
    detail: raw.detail || "",
    latencyMs: raw.latencyMs ?? null,
    checkedAt: Date.now(),
  };
}

const PROBES: Record<string, ProbeFn> = {
  binance: probeBinance,
  yahoo: probeYahoo,
  timescale: probeTimescale,
  collector: probeCollector,
  deribit: probeDeribit,
};

export interface ProbeAllOpts {
  fetchImpl?: FetchLike;
  ids?: string[];
}

/** Probe tous les feeds (scoped_out inclus sans réseau). */
export async function probeAllFeeds(opts: ProbeAllOpts = {}): Promise<FeedStatus[]> {
  const fetchImpl = opts.fetchImpl || fetch;
  const ids = opts.ids || FEED_CATALOG.map((f) => f.id);
  const out: FeedStatus[] = [];
  for (const id of ids) {
    const meta = FEED_CATALOG.find((f) => f.id === id);
    if (!meta) continue;
    if (meta.scopedOut) {
      out.push(toFeedStatus(id, {}));
      continue;
    }
    const probe = PROBES[id];
    if (!probe) {
      out.push(toFeedStatus(id, { ok: false, detail: "pas de probe" }));
      continue;
    }
    const raw = await probe(fetchImpl);
    out.push(toFeedStatus(id, raw));
  }
  return out;
}

/** Résumé pour MetricCards. */
export function summarizeFeeds(statuses: FeedStatus[] | null | undefined): FeedSummary {
  const list = statuses || [];
  const counts = { ok: 0, down: 0, unconfigured: 0, scoped_out: 0, unknown: 0 };
  for (const s of list) {
    const key = s.status in counts ? s.status : "unknown";
    counts[key as keyof typeof counts] += 1;
  }
  return {
    n: list.length,
    ...counts,
    liveOk: counts.ok,
    needsConfig: counts.unconfigured,
  };
}
