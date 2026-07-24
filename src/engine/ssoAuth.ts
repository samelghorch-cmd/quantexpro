// P4-SSO / P7-TS-MORE — session Bearer JWT + OIDC PKCE (SPA).
import { apiFetch, getApiBaseUrl, getApiKey } from "./apiClient.ts";

const LS_TOKEN = "quantexpro:accessToken";
const LS_TOKEN_META = "quantexpro:accessTokenMeta";
const LS_PKCE = "quantexpro:oidcPkce";

export interface TokenMeta {
  role?: string;
  sub?: string;
  auth_method?: string;
  expires_in?: number;
  at?: number;
  [key: string]: unknown;
}

export interface AuthConfig {
  oidc_enabled?: boolean;
  oidc_issuer?: string;
  oidc_client_id?: string;
  scopes?: string;
  [key: string]: unknown;
}

export interface SessionBody {
  access_token: string;
  role?: string;
  sub?: string;
  auth_method?: string;
  expires_in?: number;
  [key: string]: unknown;
}

export interface PkceStore {
  verifier: string;
  state: string;
  redirectUri: string;
}

export function getAccessToken(): string {
  try {
    return localStorage.getItem(LS_TOKEN) || "";
  } catch {
    return "";
  }
}

export function setAccessToken(token: string, meta: TokenMeta | null = null): void {
  try {
    if (token) localStorage.setItem(LS_TOKEN, String(token));
    else localStorage.removeItem(LS_TOKEN);
    if (meta) localStorage.setItem(LS_TOKEN_META, JSON.stringify(meta));
    else localStorage.removeItem(LS_TOKEN_META);
  } catch {
    /* noop */
  }
}

export function getAccessTokenMeta(): TokenMeta | null {
  try {
    const raw = localStorage.getItem(LS_TOKEN_META);
    return raw ? (JSON.parse(raw) as TokenMeta) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  setAccessToken("", null);
}

export function isSsoConfigured(): boolean {
  return Boolean(getApiBaseUrl());
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  const base = getApiBaseUrl() as string;
  const res = await fetch(`${base}/v1/auth/config`);
  if (!res.ok) throw new Error(`auth/config HTTP ${res.status}`);
  return res.json() as Promise<AuthConfig>;
}

/** Échange X-API-Key → JWT session. */
export async function createSessionFromApiKey(): Promise<SessionBody> {
  const body = (await apiFetch("/v1/auth/session", {
    method: "POST",
    preferApiKey: true,
  })) as SessionBody;
  setAccessToken(body.access_token, {
    role: body.role,
    sub: body.sub,
    auth_method: body.auth_method,
    expires_in: body.expires_in,
    at: Date.now(),
  });
  return body;
}

export async function fetchAuthMe(): Promise<unknown> {
  return apiFetch("/v1/auth/me");
}

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomVerifier(len = 64): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return b64url(arr);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const dig = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(dig);
}

/**
 * Lance le flow OIDC authorize (redirect). redirectUri = location.origin + pathname + ?sso=1
 */
export async function startOidcLogin(cfg: AuthConfig, redirectUri: string): Promise<void> {
  if (!cfg?.oidc_enabled) throw new Error("OIDC non activé côté API");
  const verifier = randomVerifier();
  const challenge = await pkceChallenge(verifier);
  const state = randomVerifier(24);
  try {
    sessionStorage.setItem(LS_PKCE, JSON.stringify({ verifier, state, redirectUri }));
  } catch {
    /* noop */
  }
  const authBase = `${String(cfg.oidc_issuer).replace(/\/$/, "")}/oauth2/v1/authorize`;
  let authorize = authBase;
  try {
    const disc = await fetch(
      `${String(cfg.oidc_issuer).replace(/\/$/, "")}/.well-known/openid-configuration`,
    );
    if (disc.ok) {
      const j = (await disc.json()) as { authorization_endpoint?: string };
      if (j.authorization_endpoint) authorize = j.authorization_endpoint;
    }
  } catch {
    authorize = `${String(cfg.oidc_issuer).replace(/\/$/, "")}/authorize`;
  }
  const u = new URL(authorize);
  u.searchParams.set("client_id", String(cfg.oidc_client_id || ""));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", cfg.scopes || "openid email profile");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  window.location.assign(u.toString());
}

/** Si URL contient ?sso=1&code=… — finalise l'échange. */
export async function completeOidcCallbackFromUrl(
  search = typeof window !== "undefined" ? window.location.search : "",
): Promise<SessionBody | null> {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  if (params.get("sso") !== "1" && !params.get("code")) return null;
  const code = params.get("code");
  const state = params.get("state");
  if (!code) return null;
  let stored: PkceStore | null;
  try {
    stored = JSON.parse(sessionStorage.getItem(LS_PKCE) || "null") as PkceStore | null;
  } catch {
    stored = null;
  }
  if (!stored?.verifier) throw new Error("PKCE manquant (sessionStorage)");
  if (stored.state && state && stored.state !== state) throw new Error("state OIDC mismatch");
  const body = (await apiFetch("/v1/auth/oidc/exchange", {
    method: "POST",
    body: JSON.stringify({
      code,
      code_verifier: stored.verifier,
      redirect_uri: stored.redirectUri,
    }),
    skipAuth: true,
  })) as SessionBody;
  setAccessToken(body.access_token, {
    role: body.role,
    sub: body.sub,
    auth_method: body.auth_method,
    expires_in: body.expires_in,
    at: Date.now(),
  });
  try {
    sessionStorage.removeItem(LS_PKCE);
  } catch {
    /* noop */
  }
  if (typeof window !== "undefined" && window.history?.replaceState) {
    const url = new URL(window.location.href);
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    url.searchParams.delete("sso");
    url.searchParams.delete("session_state");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }
  return body;
}

export function ssoRedirectUri(): string {
  const u = new URL(window.location.href);
  u.search = "";
  u.hash = "";
  u.searchParams.set("sso", "1");
  return u.toString();
}

/** Utilitaire tests : présence clé ou token. */
export function hasAnyCredential(): boolean {
  return Boolean(getAccessToken() || getApiKey());
}
