// Client HTTP minimal vers le backend QuantEXPro (Timescale / LLM / MT5 / SSO).
// Config locale (navigateur) — jamais de secret en repo. Fail-soft si l'API est absente.
// P9-TS-API

const LS_BASE = "quantexpro:apiBaseUrl";
const LS_KEY = "quantexpro:apiKey";
const LS_TOKEN = "quantexpro:accessToken";

export interface ApiFetchOpts extends RequestInit {
  /** Force X-API-Key même si un Bearer SSO est présent. */
  preferApiKey?: boolean;
  /** Pas d'auth (endpoints publics). */
  skipAuth?: boolean;
}

export function getApiBaseUrl(): string {
  try {
    return (localStorage.getItem(LS_BASE) || "http://localhost:8000").replace(/\/$/, "");
  } catch {
    return "http://localhost:8000";
  }
}

export function setApiBaseUrl(url: string | null | undefined): void {
  try {
    localStorage.setItem(LS_BASE, String(url || "").replace(/\/$/, ""));
  } catch {
    /* noop */
  }
}

export function getApiKey(): string {
  try {
    return localStorage.getItem(LS_KEY) || "";
  } catch {
    return "";
  }
}

export function setApiKey(key: string | null | undefined): void {
  try {
    localStorage.setItem(LS_KEY, String(key || ""));
  } catch {
    /* noop */
  }
}

function getBearer(): string {
  try {
    return localStorage.getItem(LS_TOKEN) || "";
  } catch {
    return "";
  }
}

/**
 * Appel JSON authentifié (Bearer SSO prioritaire, sinon X-API-Key).
 * @param path  ex. "/v1/strategy/from-prompt"
 */
export async function apiFetch(path: string, opts: ApiFetchOpts = {}): Promise<unknown> {
  const base = getApiBaseUrl();
  const key = getApiKey();
  const bearer = getBearer();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (!opts.skipAuth) {
    if (opts.preferApiKey && key) headers["X-API-Key"] = key;
    else if (bearer) headers.Authorization = `Bearer ${bearer}`;
    else if (key) headers["X-API-Key"] = key;
  }
  const { preferApiKey: _p, skipAuth: _s, ...fetchOpts } = opts;
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...fetchOpts, headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Backend injoignable (${base}) : ${msg}. Démarre l'API ou vérifie l'URL.`);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { detail: text };
  }
  if (!res.ok) {
    const detailObj = body && typeof body === "object" ? (body as { detail?: unknown }).detail : undefined;
    const detail =
      typeof detailObj === "string"
        ? detailObj
        : Array.isArray(detailObj)
          ? JSON.stringify(detailObj)
          : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return body;
}
