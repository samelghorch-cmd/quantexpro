// P4-ANT-SYNC / P6-TS-MORE — pont Anti-Library ↔ `/v1/anti-library`.
import { apiFetch, getApiBaseUrl, getApiKey } from "./apiClient.js";
import {
  ensureSeeded,
  loadAntiLibrary,
  type AntiEntry,
} from "./antiLibrary.js";

const LS_KEY = "quantexpro:antiLibrary:v1";

export interface ApiAntiPayload {
  concept_id: string;
  client_id: string | null;
  label: string;
  reason: string | null;
  name_pattern: string | null;
  strategy_ids: number[];
  seeded: boolean;
  active: boolean;
}

export interface ApiAntiRow {
  concept_id: string;
  client_id?: string | null;
  label?: string;
  reason?: string | null;
  name_pattern?: string | null;
  strategy_ids?: number[] | null;
  seeded?: boolean;
  active?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AntiMergeResult {
  merged: AntiEntry[];
  added: number;
  updated: number;
}

type ApiFetchFn = (
  path: string,
  opts?: RequestInit & { preferApiKey?: boolean; skipAuth?: boolean },
) => Promise<unknown>;

export interface AntiSyncOpts {
  entries?: AntiEntry[];
  fetchImpl?: ApiFetchFn;
  active?: boolean;
}

export function isAntiApiConfigured(): boolean {
  return Boolean(getApiBaseUrl() && getApiKey());
}

export function toApiAntiEntry(entry: AntiEntry | null | undefined): ApiAntiPayload | null {
  if (!entry?.conceptId) return null;
  return {
    concept_id: entry.conceptId,
    client_id: entry.id || null,
    label: entry.label || entry.conceptId,
    reason: entry.reason || null,
    name_pattern: entry.namePattern || null,
    strategy_ids: Array.isArray(entry.strategyIds) ? entry.strategyIds : [],
    seeded: Boolean(entry.seeded),
    active: true,
  };
}

export function fromApiAntiEntry(row: ApiAntiRow | null | undefined): AntiEntry | null {
  if (!row?.concept_id) return null;
  return {
    id: row.client_id || `al-api-${row.concept_id}`,
    conceptId: row.concept_id,
    label: row.label || row.concept_id,
    reason: row.reason || "",
    namePattern: row.name_pattern || "",
    strategyIds: Array.isArray(row.strategy_ids)
      ? row.strategy_ids.map(Number).filter((n) => Number.isFinite(n))
      : [],
    seeded: Boolean(row.seeded),
    createdAt: row.created_at ? Date.parse(row.created_at) || Date.now() : Date.now(),
    updatedAt: row.updated_at ? Date.parse(row.updated_at) || Date.now() : Date.now(),
  };
}

function persist(entries: AntiEntry[]): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  }
}

/** Merge remote → local by conceptId (remote wins if newer). */
export function mergeRemoteAntiLibrary(
  remoteRows: ApiAntiRow[] | null | undefined,
  localEntries: AntiEntry[] | null = null,
): AntiMergeResult {
  const local = [...(localEntries || ensureSeeded())];
  const byId = new Map(local.map((e) => [e.conceptId, e]));
  let added = 0;
  let updated = 0;
  for (const row of remoteRows || []) {
    const incoming = fromApiAntiEntry(row);
    if (!incoming) continue;
    if (row.active === false) {
      if (byId.has(incoming.conceptId)) {
        byId.delete(incoming.conceptId);
        updated++;
      }
      continue;
    }
    const cur = byId.get(incoming.conceptId);
    if (!cur) {
      byId.set(incoming.conceptId, incoming);
      added++;
      continue;
    }
    if ((incoming.updatedAt || 0) >= (cur.createdAt || 0)) {
      byId.set(incoming.conceptId, {
        ...cur,
        ...incoming,
        id: cur.id || incoming.id,
        seeded: cur.seeded || incoming.seeded,
      });
      updated++;
    }
  }
  const merged = [...byId.values()];
  persist(merged);
  return { merged, added, updated };
}

export async function pushAntiLibraryToApi(
  opts: AntiSyncOpts = {},
): Promise<{ received: number; written: number } | unknown> {
  if (!isAntiApiConfigured()) {
    throw new Error("Configure l'URL API + clé PM/Risk (Data Manager).");
  }
  const entries = opts.entries || ensureSeeded();
  const payload = entries.map(toApiAntiEntry).filter((x): x is ApiAntiPayload => Boolean(x));
  if (!payload.length) return { received: 0, written: 0 };
  const fetchImpl = opts.fetchImpl || apiFetch;
  return fetchImpl("/v1/anti-library", { method: "POST", body: JSON.stringify(payload) });
}

export async function pullAntiLibraryFromApi(opts: AntiSyncOpts = {}): Promise<AntiMergeResult> {
  if (!isAntiApiConfigured()) {
    throw new Error("Configure l'URL API + clé (Data Manager).");
  }
  const fetchImpl = opts.fetchImpl || apiFetch;
  const active = opts.active !== false;
  const rows = await fetchImpl(`/v1/anti-library?active=${active ? "true" : "false"}&limit=500`);
  if (!Array.isArray(rows)) throw new Error("Réponse anti-library invalide");
  return mergeRemoteAntiLibrary(rows as ApiAntiRow[]);
}

export async function deactivateAntiOnApi(
  conceptId: string,
  opts: AntiSyncOpts = {},
): Promise<unknown> {
  if (!isAntiApiConfigured()) {
    throw new Error("Configure l'URL API + clé PM/Risk.");
  }
  const fetchImpl = opts.fetchImpl || apiFetch;
  return fetchImpl("/v1/anti-library/deactivate", {
    method: "POST",
    body: JSON.stringify({ concept_id: conceptId }),
  });
}

export { loadAntiLibrary };
