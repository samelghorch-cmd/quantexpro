// P4-AUDIT-UI / P7-TS-MORE — client lecture du journal d'audit append-only (`GET /v1/audit`).
// Parité hash avec backend `app/audit.py` (JSON canonique + SHA-256).
import { apiFetch, getApiBaseUrl, getApiKey } from "./apiClient.ts";

export interface AuditEvent {
  id: number;
  ts: string;
  actor: string;
  role: string;
  action: string;
  resource: string;
  payload_hash: string;
  details: Record<string, unknown> | null;
}

export interface AuditFilter {
  q?: string;
  action?: string;
  role?: string;
}

export interface AuditSummary {
  n: number;
  lastId: number | null;
  byAction: Record<string, number>;
  byRole: Record<string, number>;
}

type ApiFetchFn = (
  path: string,
  opts?: RequestInit & { preferApiKey?: boolean; skipAuth?: boolean },
) => Promise<unknown>;

/** Tri récursif des clés — miroir de `json.dumps(..., sort_keys=True)`. */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeysDeep(obj[k]);
        return acc;
      }, {});
  }
  return value;
}

/** JSON canonique (séparateurs compacts) pour hash. */
export function canonicalPayloadJson(details: unknown): string {
  return JSON.stringify(sortKeysDeep(details ?? {}));
}

/** SHA-256 hex (Web Crypto ou node:crypto en tests). */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(String(text));
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(String(text)).digest("hex");
}

/** Vérifie `payload_hash` contre `details` (true si match). */
export async function verifyEventHash(event: AuditEvent | null | undefined): Promise<boolean> {
  if (!event || !event.payload_hash) return false;
  const digest = await sha256Hex(canonicalPayloadJson(event.details ?? {}));
  return digest === String(event.payload_hash).toLowerCase();
}

export function isAuditApiConfigured(): boolean {
  return Boolean(getApiBaseUrl() && getApiKey());
}

/** Normalise une ligne API → AuditEvent stable. */
export function normalizeAuditEvent(raw: Record<string, unknown> | null | undefined): AuditEvent | null {
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
    details:
      raw.details && typeof raw.details === "object"
        ? (raw.details as Record<string, unknown>)
        : null,
  };
}

export interface FetchAuditOpts {
  limit?: number;
  afterId?: number | null;
  fetchImpl?: ApiFetchFn;
}

/** `GET /v1/audit?limit=&after_id=` — rôles PM / Risk côté serveur. */
export async function fetchAuditLog(opts: FetchAuditOpts = {}): Promise<AuditEvent[]> {
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
  return body
    .map((row) => normalizeAuditEvent(row as Record<string, unknown>))
    .filter((e): e is AuditEvent => Boolean(e));
}

/** Filtre client (action / actor / resource contains, case-insensitive). */
export function filterAuditEvents(
  events: AuditEvent[] | null | undefined,
  { q = "", action = "", role = "" }: AuditFilter = {},
): AuditEvent[] {
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

export function auditEventsToCsv(events: AuditEvent[] | null | undefined): string {
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
export function summarizeAudit(events: AuditEvent[] | null | undefined): AuditSummary {
  const list = events || [];
  const byAction: Record<string, number> = {};
  const byRole: Record<string, number> = {};
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
