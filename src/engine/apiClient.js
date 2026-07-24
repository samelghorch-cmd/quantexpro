// Client HTTP minimal vers le backend QuantEXPro (Timescale / LLM / MT5 / SSO).
// Config locale (navigateur) — jamais de secret en repo. Fail-soft si l'API est absente.

const LS_BASE = "quantexpro:apiBaseUrl";
const LS_KEY = "quantexpro:apiKey";
const LS_TOKEN = "quantexpro:accessToken";

export function getApiBaseUrl() {
  try {
    return (localStorage.getItem(LS_BASE) || "http://localhost:8000").replace(/\/$/, "");
  } catch {
    return "http://localhost:8000";
  }
}

export function setApiBaseUrl(url) {
  try {
    localStorage.setItem(LS_BASE, String(url || "").replace(/\/$/, ""));
  } catch {
    /* noop */
  }
}

export function getApiKey() {
  try {
    return localStorage.getItem(LS_KEY) || "";
  } catch {
    return "";
  }
}

export function setApiKey(key) {
  try {
    localStorage.setItem(LS_KEY, String(key || ""));
  } catch {
    /* noop */
  }
}

function getBearer() {
  try {
    return localStorage.getItem(LS_TOKEN) || "";
  } catch {
    return "";
  }
}

/**
 * Appel JSON authentifié (Bearer SSO prioritaire, sinon X-API-Key).
 * @param {string} path  ex. "/v1/strategy/from-prompt"
 * @param {RequestInit & { preferApiKey?: boolean, skipAuth?: boolean }} [opts]
 * @returns {Promise<object>}
 */
export async function apiFetch(path, opts = {}) {
  const base = getApiBaseUrl();
  const key = getApiKey();
  const bearer = getBearer();
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (!opts.skipAuth) {
    if (opts.preferApiKey && key) headers["X-API-Key"] = key;
    else if (bearer) headers.Authorization = `Bearer ${bearer}`;
    else if (key) headers["X-API-Key"] = key;
  }
  const { preferApiKey: _p, skipAuth: _s, ...fetchOpts } = opts;
  let res;
  try {
    res = await fetch(`${base}${path}`, { ...fetchOpts, headers });
  } catch (e) {
    throw new Error(`Backend injoignable (${base}) : ${e.message}. Démarre l'API ou vérifie l'URL.`);
  }
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { detail: text };
  }
  if (!res.ok) {
    const detail =
      typeof body?.detail === "string"
        ? body.detail
        : Array.isArray(body?.detail)
          ? JSON.stringify(body.detail)
          : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return body;
}
