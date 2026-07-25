// Client du collecteur 24/7 (service Node déployé en cloud gratuit — cf. collector/).
// L'URL est configurée par l'utilisateur (collée depuis Railway/Fly/Render) et stockée en localStorage.
const KEY = "collectorUrl";

export function getCollectorUrl() { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } }
export function setCollectorUrl(u: string | null | undefined) {
  try { u ? localStorage.setItem(KEY, String(u).trim().replace(/\/+$/, "")) : localStorage.removeItem(KEY); } catch { /* noop */ }
}

async function api(pathname: string, opts: RequestInit = {}) {
  const base = getCollectorUrl();
  if (!base) throw new Error("URL du collecteur non configurée");
  const r = await fetch(base + pathname, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) { let e; try { e = (await r.json()).error; } catch { /* noop */ } throw new Error(e || `HTTP ${r.status}`); }
  return r.json();
}

export const collectorHealth = () => api("/health");
export const listJobs = () => api("/jobs").then((d) => d.jobs || []);
export const createJob = (body: unknown) => api("/jobs", { method: "POST", body: JSON.stringify(body) }).then((d) => d.job);
export const getJob = (id: string | number) => api(`/jobs/${id}`).then((d) => d.job);
export const deleteJob = (id: string | number) => api(`/jobs/${id}`, { method: "DELETE" });
