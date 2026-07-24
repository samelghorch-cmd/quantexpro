// P4-AF-SYNC — pont Validated Edges ↔ API `/v1/edges`.
import { apiFetch, getApiBaseUrl, getApiKey } from "./apiClient.js";
import {
  loadValidatedEdges,
  listActiveEdges,
  edgeFingerprint,
} from "./validatedEdges.js";

const LS_KEY = "quantexpro:validatedEdges:v1";

export function isEdgesApiConfigured() {
  return Boolean(getApiBaseUrl() && getApiKey());
}

/** Local edge → payload API. */
export function toApiEdge(entry) {
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
export function fromApiEdge(row) {
  if (!row || !row.fingerprint) return null;
  return {
    id: row.client_id || `ve-api-${String(row.fingerprint).slice(0, 12)}`,
    name: row.name,
    strategyId: row.strategy_id != null ? Number(row.strategy_id) : null,
    symbol: row.symbol,
    tf: row.tf,
    dossierId: row.dossier_id,
    verdict: row.verdict,
    score: row.score,
    letter: row.letter,
    status: row.status === "retired" ? "retired" : "active",
    metrics: row.metrics || {},
    params: row.params || {},
    toolsApplied: Array.isArray(row.tools_applied) ? row.tools_applied : [],
    notes: row.notes || "",
    fingerprint: row.fingerprint,
    validatedAt: row.validated_at ? Date.parse(row.validated_at) || Date.now() : Date.now(),
    updatedAt: row.updated_at ? Date.parse(row.updated_at) || Date.now() : Date.now(),
  };
}

function persistAll(entries) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  }
}

/**
 * Fusionne remote dans le store local (fingerprint gagne le plus récent updatedAt).
 * @returns {{ merged: object[], added: number, updated: number }}
 */
export function mergeRemoteEdges(remoteRows, localEntries = null) {
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
export async function pushEdgesToApi(opts = {}) {
  if (!isEdgesApiConfigured()) {
    throw new Error("Configure l'URL API + clé PM/Risk (Data Manager).");
  }
  const entries = opts.entries || listActiveEdges();
  const payload = entries.map(toApiEdge).filter(Boolean);
  if (!payload.length) return { received: 0, written: 0 };
  const fetchImpl = opts.fetchImpl || apiFetch;
  return fetchImpl("/v1/edges", { method: "POST", body: JSON.stringify(payload) });
}

/** GET /v1/edges — pull + merge localStorage. */
export async function pullEdgesFromApi(opts = {}) {
  if (!isEdgesApiConfigured()) {
    throw new Error("Configure l'URL API + clé (Data Manager).");
  }
  const status = opts.status || "active";
  const fetchImpl = opts.fetchImpl || apiFetch;
  const rows = await fetchImpl(`/v1/edges?status=${encodeURIComponent(status)}&limit=500`);
  if (!Array.isArray(rows)) throw new Error("Réponse edges invalide");
  return mergeRemoteEdges(rows);
}

/** POST /v1/edges/retire */
export async function retireEdgeOnApi(fingerprint, opts = {}) {
  if (!isEdgesApiConfigured()) {
    throw new Error("Configure l'URL API + clé PM/Risk.");
  }
  const fetchImpl = opts.fetchImpl || apiFetch;
  return fetchImpl("/v1/edges/retire", {
    method: "POST",
    body: JSON.stringify({ fingerprint }),
  });
}
