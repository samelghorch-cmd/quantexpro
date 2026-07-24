// P4-AF-SYNC / P5-TS-EDGES — pont Validated Edges ↔ API `/v1/edges`.
import { apiFetch, getApiBaseUrl, getApiKey } from "./apiClient.ts";
import {
  loadValidatedEdges,
  listActiveEdges,
  edgeFingerprint,
  type ValidatedEdge,
} from "./validatedEdges.ts";

const LS_KEY = "quantexpro:validatedEdges:v1";

export interface ApiEdgePayload {
  fingerprint: string;
  client_id: string | null;
  name: string;
  strategy_id: number | null;
  symbol: string | null;
  tf: string | null;
  dossier_id: string | null;
  verdict: string;
  score: number | null;
  letter: string;
  status: "active" | "retired";
  metrics: Record<string, unknown> | null;
  params: Record<string, unknown> | null;
  tools_applied: string[] | null;
  notes: string | null;
  validated_at: string | null;
}

export interface ApiEdgeRow extends Partial<ApiEdgePayload> {
  fingerprint: string;
  updated_at?: string | null;
  name?: string;
}

export interface MergeResult {
  merged: ValidatedEdge[];
  added: number;
  updated: number;
}

type ApiFetchFn = (path: string, opts?: RequestInit & { preferApiKey?: boolean; skipAuth?: boolean }) => Promise<unknown>;

export interface SyncOpts {
  entries?: ValidatedEdge[];
  fetchImpl?: ApiFetchFn;
  status?: string;
}

export function isEdgesApiConfigured(): boolean {
  return Boolean(getApiBaseUrl() && getApiKey());
}

/** Local edge → payload API. */
export function toApiEdge(entry: ValidatedEdge | null | undefined): ApiEdgePayload | null {
  if (!entry) return null;
  const fingerprint = entry.fingerprint || edgeFingerprint(entry);
  const letter = String(entry.letter || "").toUpperCase();
  const verdict = String(entry.verdict || "GO").toUpperCase();
  return {
    fingerprint,
    client_id: entry.id || null,
    name: entry.name,
    strategy_id: entry.strategyId != null ? Number(entry.strategyId) : null,
    symbol: entry.symbol || null,
    tf: entry.tf || null,
    dossier_id: entry.dossierId || null,
    verdict,
    score: entry.score != null ? Number(entry.score) : null,
    letter,
    status: entry.status === "retired" ? "retired" : "active",
    metrics: entry.metrics || null,
    params: entry.params || null,
    tools_applied: entry.toolsApplied || null,
    notes: entry.notes || null,
    validated_at: entry.validatedAt
      ? new Date(entry.validatedAt).toISOString()
      : null,
  };
}

/** Réponse API → entrée locale. */
export function fromApiEdge(row: ApiEdgeRow | null | undefined): ValidatedEdge | null {
  if (!row || !row.fingerprint) return null;
  return {
    id: row.client_id || `ve-api-${String(row.fingerprint).slice(0, 12)}`,
    name: row.name || "",
    strategyId: row.strategy_id != null ? Number(row.strategy_id) : null,
    symbol: row.symbol ?? null,
    tf: row.tf ?? null,
    dossierId: row.dossier_id ?? null,
    verdict: row.verdict ?? null,
    score: row.score ?? null,
    letter: row.letter ?? null,
    status: row.status === "retired" ? "retired" : "active",
    metrics: (row.metrics || {}) as ValidatedEdge["metrics"],
    params: (row.params || {}) as Record<string, unknown>,
    toolsApplied: Array.isArray(row.tools_applied) ? row.tools_applied : [],
    notes: row.notes || "",
    fingerprint: row.fingerprint,
    validatedAt: row.validated_at ? Date.parse(row.validated_at) || Date.now() : Date.now(),
    updatedAt: row.updated_at ? Date.parse(row.updated_at) || Date.now() : Date.now(),
  };
}

function persistAll(entries: ValidatedEdge[]): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  }
}

/**
 * Fusionne remote dans le store local (fingerprint gagne le plus récent updatedAt).
 */
export function mergeRemoteEdges(
  remoteRows: ApiEdgeRow[] | null | undefined,
  localEntries: ValidatedEdge[] | null = null,
): MergeResult {
  const local = [...(localEntries || loadValidatedEdges())];
  const byFp = new Map(local.map((e) => [e.fingerprint || edgeFingerprint(e), e]));
  let added = 0;
  let updated = 0;
  for (const row of remoteRows || []) {
    const incoming = fromApiEdge(row);
    if (!incoming) continue;
    const fp = incoming.fingerprint;
    const cur = byFp.get(fp);
    if (!cur) {
      byFp.set(fp, incoming);
      added++;
      continue;
    }
    if ((incoming.updatedAt || 0) >= (cur.updatedAt || 0)) {
      byFp.set(fp, { ...cur, ...incoming, id: cur.id || incoming.id });
      updated++;
    }
  }
  const merged = [...byFp.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  persistAll(merged);
  return { merged, added, updated };
}

/** POST /v1/edges — push actifs locaux. */
export async function pushEdgesToApi(
  opts: SyncOpts = {},
): Promise<{ received: number; written: number } | unknown> {
  if (!isEdgesApiConfigured()) {
    throw new Error("Configure l'URL API + clé PM/Risk (Data Manager).");
  }
  const entries = opts.entries || listActiveEdges();
  const payload = entries.map(toApiEdge).filter((x): x is ApiEdgePayload => Boolean(x));
  if (!payload.length) return { received: 0, written: 0 };
  const fetchImpl = opts.fetchImpl || apiFetch;
  return fetchImpl("/v1/edges", { method: "POST", body: JSON.stringify(payload) });
}

/** GET /v1/edges — pull + merge localStorage. */
export async function pullEdgesFromApi(opts: SyncOpts = {}): Promise<MergeResult> {
  if (!isEdgesApiConfigured()) {
    throw new Error("Configure l'URL API + clé (Data Manager).");
  }
  const status = opts.status || "active";
  const fetchImpl = opts.fetchImpl || apiFetch;
  const rows = await fetchImpl(`/v1/edges?status=${encodeURIComponent(status)}&limit=500`);
  if (!Array.isArray(rows)) throw new Error("Réponse edges invalide");
  return mergeRemoteEdges(rows as ApiEdgeRow[]);
}

/** POST /v1/edges/retire */
export async function retireEdgeOnApi(
  fingerprint: string,
  opts: SyncOpts = {},
): Promise<unknown> {
  if (!isEdgesApiConfigured()) {
    throw new Error("Configure l'URL API + clé PM/Risk.");
  }
  const fetchImpl = opts.fetchImpl || apiFetch;
  return fetchImpl("/v1/edges/retire", {
    method: "POST",
    body: JSON.stringify({ fingerprint }),
  });
}
