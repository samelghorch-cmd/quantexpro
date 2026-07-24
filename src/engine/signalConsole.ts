// P4-SIGNAL-WS / P9-TS-SIGNAL — logique console Signal Engine (slots + consensus + ring + WS bars).
// Éval stratégies = pure (même moteur que backtest). Le WS backend alimente le journal ;
// le mode local réévalue sur le ctx pipeline.

export const DEFAULT_SIGNAL_SLOTS: number[] = [1, 3, 4, 21, 31, 55];
export const MAX_SIGNAL_EVENTS = 200;

export type ConsensusSide = "LONG" | "SHORT" | "NEUTRE";

export interface StrategySlot {
  id: number;
  name: string;
  cat?: string;
  eval: (ctx: unknown, i: number) => { long?: boolean; short?: boolean } | null | undefined;
}

export interface SlotSignal {
  id: number;
  name: string;
  cat: string;
  long: boolean;
  short: boolean;
  missing?: boolean;
}

export interface ConsensusResult {
  consensus: ConsensusSide;
  nLong: number;
  nShort: number;
  nFlat: number;
  nSlots: number;
}

export interface ParsedBarMessage {
  id: string;
  type: string;
  ts: string | null;
  symbol: string | null;
  timeframe: string | null;
  bar: Record<string, unknown> | null;
  raw: Record<string, unknown>;
}

export interface SignalSnapshotEvent {
  id: string;
  kind: "signal_snapshot";
  ts: number;
  source: string;
  symbol: string | null;
  consensus: ConsensusSide;
  nLong: number;
  nShort: number;
  signals: Array<{ id: number; name: string; side: "LONG" | "SHORT" }>;
}

export interface BarClosedEvent {
  id: string;
  kind: "bar_closed";
  ts: number;
  source: string;
  symbol: string | null;
  timeframe: string | null;
  eventId: string;
  close: number | string | null;
}

/** Journal unifié (snapshot slots + bar.closed + futurs kinds). */
export interface ConsoleEvent {
  id?: string;
  kind?: string;
  ts?: number;
  source?: string;
  symbol?: string | null;
  consensus?: string;
  nLong?: number;
  nShort?: number;
  close?: number | string | null;
  eventId?: string;
  timeframe?: string | null;
  signals?: Array<{ id: number; name: string; side: "LONG" | "SHORT" }>;
}

export interface EventFilter {
  kind?: string;
  q?: string;
}

/**
 * URL WebSocket `/stream/bars/{tf}?api_key=`
 */
export function barsWebSocketUrl(baseUrl: string, timeframe: string, apiKey = ""): string {
  const base = String(baseUrl || "").replace(/\/$/, "");
  if (!base) throw new Error("URL API manquante");
  const u = new URL(base);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = `/stream/bars/${encodeURIComponent(timeframe)}`;
  u.search = "";
  if (apiKey) u.searchParams.set("api_key", apiKey);
  return u.toString();
}

/** Map TF dashboard (facteur barres) → timeframe API stream. */
export const TF_FACTOR_TO_API: Record<number, string> = {
  1: "5m",
  3: "15m",
  12: "1h",
  48: "4h",
  288: "1d",
};

export function resolveStreamTf(tfFactor: number | string, fallback = "15m"): string {
  return TF_FACTOR_TO_API[Number(tfFactor)] || fallback;
}

/** Parse message texte WS (JSON EventEnvelope). */
export function parseBarClosedMessage(raw: unknown): ParsedBarMessage | null {
  let obj: unknown;
  try {
    obj = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const type = String(o.type || "");
  const payload = o.payload && typeof o.payload === "object" ? (o.payload as Record<string, unknown>) : {};
  return {
    id: String(o.id || `${payload.symbol || "?"}:${payload.ts || Date.now()}`),
    type: type || "unknown",
    ts: o.ts != null ? String(o.ts) : payload.ts != null ? String(payload.ts) : null,
    symbol: payload.symbol != null ? String(payload.symbol) : null,
    timeframe: payload.timeframe != null ? String(payload.timeframe) : null,
    bar: payload,
    raw: o,
  };
}

/** Évalue une liste de slots stratégie sur l'index de barre `i`. */
export function evaluateSlots(
  library: StrategySlot[] | null | undefined,
  ctx: unknown,
  i: number,
  slotIds: number[] = DEFAULT_SIGNAL_SLOTS,
): SlotSignal[] {
  const lib = library || [];
  const byId = new Map(lib.map((s) => [s.id, s]));
  return (slotIds || []).map((id) => {
    const s = byId.get(id);
    if (!s) {
      return { id, name: `#${id} ?`, cat: "?", long: false, short: false, missing: true };
    }
    let sig: { long?: boolean; short?: boolean } = { long: false, short: false };
    try {
      if (ctx && i >= 1) sig = s.eval(ctx, i) || sig;
    } catch {
      /* stratégie cassée → flat */
    }
    return {
      id,
      name: s.name,
      cat: s.cat || "?",
      long: Boolean(sig.long),
      short: Boolean(sig.short),
      missing: false,
    };
  });
}

export function consensusFromSignals(signals: SlotSignal[] | null | undefined): ConsensusResult {
  const list = signals || [];
  const nLong = list.filter((s) => s.long).length;
  const nShort = list.filter((s) => s.short).length;
  const consensus: ConsensusSide = nLong > nShort ? "LONG" : nShort > nLong ? "SHORT" : "NEUTRE";
  return { consensus, nLong, nShort, nFlat: list.length - nLong - nShort, nSlots: list.length };
}

/** Ajoute un événement en tête (ring borné). */
export function pushRing<T>(ring: T[] | null | undefined, event: T, max = MAX_SIGNAL_EVENTS): T[] {
  const next = [event, ...(ring || [])];
  if (next.length > max) next.length = max;
  return next;
}

/** Événement console à partir d'un snapshot slots. */
export function makeSignalSnapshotEvent(
  signals: SlotSignal[] | null | undefined,
  meta: { ts?: number; source?: string; symbol?: string | null } = {},
): SignalSnapshotEvent {
  const c = consensusFromSignals(signals);
  return {
    id: `sig-${meta.ts || Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: "signal_snapshot",
    ts: meta.ts || Date.now(),
    source: meta.source || "local",
    symbol: meta.symbol || null,
    consensus: c.consensus,
    nLong: c.nLong,
    nShort: c.nShort,
    signals: (signals || []).filter((s) => s.long || s.short).map((s) => ({
      id: s.id,
      name: s.name,
      side: s.long ? "LONG" : "SHORT",
    })),
  };
}

/** Événement console à partir d'un bar.closed WS. */
export function makeBarClosedEvent(
  parsed: ParsedBarMessage,
  meta: { source?: string } = {},
): BarClosedEvent {
  const bar = parsed.bar || {};
  return {
    id: `bar-${parsed.id}`,
    kind: "bar_closed",
    ts: parsed.ts ? Date.parse(parsed.ts) || Date.now() : Date.now(),
    source: meta.source || "ws",
    symbol: parsed.symbol,
    timeframe: parsed.timeframe,
    eventId: parsed.id,
    close: (bar.close ?? bar.c ?? null) as number | string | null,
  };
}

export function filterEvents(
  events: ConsoleEvent[] | null | undefined,
  { kind = "", q = "" }: EventFilter = {},
): ConsoleEvent[] {
  const kk = String(kind || "").trim();
  const qq = String(q || "").trim().toLowerCase();
  return (events || []).filter((e) => {
    if (kk && e.kind !== kk) return false;
    if (!qq) return true;
    const hay = `${e.kind || ""} ${e.symbol || ""} ${e.consensus || ""} ${e.eventId || ""}`.toLowerCase();
    return hay.includes(qq);
  });
}

export function eventsToCsv(events: ConsoleEvent[] | null | undefined): string {
  const header = ["ts", "kind", "source", "symbol", "consensus", "nLong", "nShort", "close", "eventId"];
  const lines = [header.join(",")];
  for (const e of events || []) {
    const cells = [
      e.ts ? new Date(e.ts).toISOString() : "",
      e.kind,
      e.source,
      e.symbol,
      e.consensus,
      e.nLong,
      e.nShort,
      e.close,
      e.eventId,
    ].map((v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}
