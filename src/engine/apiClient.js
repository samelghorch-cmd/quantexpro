// Client HTTP minimal vers le backend QuantEXPro (Timescale / LLM / MT5).
// Config locale (navigateur) — jamais de secret en repo. Fail-soft si l'API est absente.

const LS_BASE = "quantexpro:apiBaseUrl";
const LS_KEY = "quantexpro:apiKey";

export function getApiBaseUrl() {
  try {
    return (localStorage.getItem(LS_BASE) || "http://localhost:8000").replace(/\/$/, "");
  } catch {
    return "http://localhost:8000";
  }
}

export function setApiBaseUrl(url) {
  try { localStorage.setItem(LS_BASE, String(url || "").replace(/\/$/, "")); } catch { /* noop */ }
}

export function getApiKey() {
  try { return localStorage.getItem(LS_KEY) || ""; } catch { return ""; }
}

export function setApiKey(key) {
  try { localStorage.setItem(LS_KEY, String(key || "")); } catch { /* noop */ }
}

/**
 * Appel JSON authentifié (header X-API-Key).
 * @param {string} path  ex. "/v1/strategy/from-prompt"
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
export async function apiFetch(path, opts = {}) {
  const base = getApiBaseUrl();
  const key = getApiKey();
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (key) headers["X-API-Key"] = key;
  let res;
  try {
    res = await fetch(`${base}${path}`, { ...opts, headers });
  } catch (e) {
    throw new Error(`Backend injoignable (${base}) : ${e.message}. Démarre l'API ou vérifie l'URL.`);
  }
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { detail: text }; }
  if (!res.ok) {
    const detail = typeof body?.detail === "string" ? body.detail
      : Array.isArray(body?.detail) ? JSON.stringify(body.detail)
      : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return body;
}
