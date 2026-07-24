// P4-AUDIT-UI — client lecture du journal d'audit append-only (`GET /v1/audit`).
// Parité hash avec backend `app/audit.py` (JSON canonique + SHA-256).
import { apiFetch, getApiBaseUrl, getApiKey } from "./apiClient.js";

/** @typedef {{
 *   id: number,
 *   ts: string,
 *   actor: string,
 *   role: string,
 *   action: string,
 *   resource: string,
 *   payload_hash: string,
 *   details: Record<string, unknown> | null,
 * }} AuditEvent */

/** Tri récursif des clés — miroir de `json.dumps(..., sort_keys=True)`. */
export function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.keys(value)
      .sort()
      .reduce((acc, k) => {
        acc[k] = sortKeysDeep(value[k]);
        return acc;
      }, {});
  }
  return value;
}

/** JSON canonique (séparateurs compacts) pour hash. */
export function canonicalPayloadJson(details) {
  return JSON.stringify(sortKeysDeep(details ?? {}));
}

/** SHA-256 hex (Web Crypto ou node:crypto en tests). */
export async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text));
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(String(text)).digest("hex");
}

/** Vérifie `payload_hash` contre `details` (true si match). */
export async function verifyEventHash(event) {
  if (!event || !event.payload_hash) return false;
  const digest = await sha256Hex(canonicalPayloadJson(event.details ?? {}));
  return digest === String(event.payload_hash).toLowerCase();
}

export function isAuditApiConfigured() {
  return Boolean(getApiBaseUrl() && getApiKey());
}

/**
 * Normalise une ligne API → AuditEvent stable.
 * @param {Record<string, unknown>} raw
 * @returns {AuditEvent | null}
 */
export function normalizeAuditEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = Number(raw.id);
  if (!Number.isFinite(id)) return null;
  const ts = raw.ts != null ? String(raw.ts) : "";
  return {
    id,
    ts,
    actor: String(raw.actor || ""),
    role: String(raw.role || ""),
    action: String(raw.action || ""),
    resource: String(raw.resource || ""),
    payload_hash: String(raw.payload_hash || ""),
    details: raw.details && typeof raw.details === "object" ? raw.details : null,
  };
}

/**
 * `GET /v1/audit?limit=&after_id=` — rôles PM / Risk côté serveur.
 * @param {{ limit?: number, afterId?: number|null, fetchImpl?: typeof apiFetch }} [opts]
 * @returns {Promise<AuditEvent[]>}
 */
export async function fetchAuditLog(opts = {}) {
  if (!isAuditApiConfigured()) {
    throw new Error("Configure l'URL API + clé PM/Risk (Data Manager / Prompt Mode).");
  }
  const limit = Math.min(1000, Math.max(1, Number(opts.limit) || 100));
  const params = new URLSearchParams({ limit: String(limit) });
  if (opts.afterId != null && Number.isFinite(Number(opts.afterId))) {
    params.set("after_id", String(opts.afterId));
  }
  const fetchImpl = opts.fetchImpl || apiFetch;
  const body = await fetchImpl(`/v1/audit?${params.toString()}`);
  if (!Array.isArray(body)) throw new Error("Réponse audit invalide (attendu tableau)");
  return body.map(normalizeAuditEvent).filter(Boolean);
}

/** Filtre client (action / actor / resource contains, case-insensitive). */
export function filterAuditEvents(events, { q = "", action = "", role = "" } = {}) {
  const qq = String(q || "").trim().toLowerCase();
  const aa = String(action || "").trim().toLowerCase();
  const rr = String(role || "").trim().toLowerCase();
  return (events || []).filter((e) => {
    if (aa && e.action.toLowerCase() !== aa) return false;
    if (rr && e.role.toLowerCase() !== rr) return false;
    if (!qq) return true;
    const hay = `${e.actor} ${e.action} ${e.resource} ${e.payload_hash}`.toLowerCase();
    return hay.includes(qq);
  });
}

export function auditEventsToCsv(events) {
  const header = ["id", "ts", "actor", "role", "action", "resource", "payload_hash"];
  const lines = [header.join(",")];
  for (const e of events || []) {
    const cells = [e.id, e.ts, e.actor, e.role, e.action, e.resource, e.payload_hash].map((v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

/** Résumé pour MetricCards. */
export function summarizeAudit(events) {
  const list = events || [];
  const byAction = {};
  const byRole = {};
  for (const e of list) {
    byAction[e.action] = (byAction[e.action] || 0) + 1;
    byRole[e.role] = (byRole[e.role] || 0) + 1;
  }
  return {
    n: list.length,
    lastId: list.length ? list[list.length - 1].id : null,
    byAction,
    byRole,
  };
}
