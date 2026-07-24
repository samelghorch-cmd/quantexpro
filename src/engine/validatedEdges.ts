// Alpha Forge — registre des Validated Edges (P4-AF / P5-TS-EDGES).
// Promote un dossier noté GO (Reco Finale) vers un registre consultable ;
// complément de l'Anti-Library (involutifs) côté edges validés.

const LS_KEY = "quantexpro:validatedEdges:v1";

const hasLS = (): boolean => typeof localStorage !== "undefined";
const uid = (): string =>
  `ve-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Lettres acceptées pour promotion (A–C = GO crédible). */
export const ELIGIBLE_LETTERS: ReadonlySet<string> = new Set(["A", "B", "C"]);

export type EdgeStatus = "active" | "retired";

export interface EdgeMetrics {
  sharpe: number | null;
  profitFactor: number | null;
  maxDd: number | null;
  winrate: number | null;
  trades: number | null;
  dsr: number | null;
  [key: string]: number | null | undefined;
}

export interface ValidatedEdge {
  id: string;
  name: string;
  strategyId: number | null;
  symbol: string | null;
  tf: string | null;
  dossierId: string | null;
  verdict: string | null;
  score: number | null;
  letter: string | null;
  metrics: EdgeMetrics;
  params: Record<string, unknown>;
  toolsApplied: string[];
  notes: string;
  status: EdgeStatus;
  fingerprint: string;
  validatedAt: number;
  updatedAt: number;
}

export interface EdgeFingerprintInput {
  strategyId?: unknown;
  symbol?: unknown;
  tf?: unknown;
  params?: Record<string, unknown>;
}

export interface DossierGrade {
  verdict?: string;
  score?: number;
  letter?: string;
}

export interface DossierLike {
  id?: string;
  name?: string;
  strategyId?: unknown;
  symbol?: unknown;
  tf?: unknown;
  params?: Record<string, unknown>;
  toolsApplied?: string[];
  stages?: Record<string, unknown>;
  grade?: DossierGrade;
}

export interface EligibilityResult {
  ok: boolean;
  reason: string | null;
}

/**
 * Empreinte stable pour dédupliquer (stratégie × symbole × TF × params clés).
 */
export function edgeFingerprint(edge: EdgeFingerprintInput | null | undefined): string {
  const sid = edge?.strategyId != null ? String(edge.strategyId) : "";
  const sym = String(edge?.symbol || "").toUpperCase();
  const tf = String(edge?.tf || "").toLowerCase();
  const p = edge?.params && typeof edge.params === "object" ? edge.params : {};
  const keys = ["slAtr", "tpAtr", "beAtr", "direction", "regime", "contract"];
  const paramPart = keys
    .map((k) => `${k}=${p[k] != null ? String(p[k]) : ""}`)
    .join("|");
  return `${sid}::${sym}::${tf}::${paramPart}`;
}

/** Extraire un snapshot métriques depuis les stages dossier (best-effort). */
export function extractMetricsFromStages(stages: Record<string, unknown> = {}): EdgeMetrics {
  const bt = (stages.backtest || stages.bt || null) as Record<string, unknown> | null;
  const result = (bt?.result || bt) as Record<string, unknown> | null;
  const m = ((result?.metrics || result?.summary || {}) as Record<string, unknown>);
  const reco = (stages.reco || stages.recoFinale || null) as {
    components?: Array<{ name?: string; value?: number }>;
  } | null;
  const dsrComp = (reco?.components || []).find((c) =>
    String(c?.name || "").toLowerCase().includes("deflated"),
  );
  return {
    sharpe: numOrNull(m.sharpe ?? m.Sharpe),
    profitFactor: numOrNull(m.profitFactor ?? m.pf ?? m.PF),
    maxDd: numOrNull(m.maxDd ?? m.maxDD ?? m.dd),
    winrate: numOrNull(m.winrate ?? m.winRate ?? m.wr),
    trades: numOrNull(
      m.trades ?? m.nTrades ?? (Array.isArray(result?.trades) ? result.trades.length : null),
    ),
    dsr: numOrNull(dsrComp?.value != null ? dsrComp.value / 100 : m.dsr),
  };
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeEntry(raw: Partial<ValidatedEdge> & Record<string, unknown>): ValidatedEdge | null {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim();
  if (!name) return null;
  const status: EdgeStatus = raw.status === "retired" ? "retired" : "active";
  const letter = String(raw.letter || "").toUpperCase() || null;
  const verdict = String(raw.verdict || "").toUpperCase() || null;
  const params =
    raw.params && typeof raw.params === "object" ? { ...(raw.params as Record<string, unknown>) } : {};
  const metrics: EdgeMetrics =
    raw.metrics && typeof raw.metrics === "object"
      ? { ...(raw.metrics as EdgeMetrics) }
      : { sharpe: null, profitFactor: null, maxDd: null, winrate: null, trades: null, dsr: null };
  return {
    id: (raw.id as string) || uid(),
    name,
    strategyId: raw.strategyId != null ? Number(raw.strategyId) : null,
    symbol: raw.symbol != null ? String(raw.symbol) : null,
    tf: raw.tf != null ? String(raw.tf) : null,
    dossierId: raw.dossierId != null ? String(raw.dossierId) : null,
    verdict,
    score: numOrNull(raw.score),
    letter,
    metrics,
    params,
    toolsApplied: Array.isArray(raw.toolsApplied) ? [...(raw.toolsApplied as string[])] : [],
    notes: String(raw.notes || "").trim(),
    status,
    fingerprint:
      (raw.fingerprint as string) ||
      edgeFingerprint({
        strategyId: raw.strategyId,
        symbol: raw.symbol,
        tf: raw.tf,
        params,
      }),
    validatedAt: (raw.validatedAt as number) || Date.now(),
    updatedAt: (raw.updatedAt as number) || Date.now(),
  };
}

export function loadValidatedEdges(): ValidatedEdge[] {
  if (!hasLS()) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.map((e) => normalizeEntry(e as Partial<ValidatedEdge> & Record<string, unknown>)).filter(
      (e): e is ValidatedEdge => Boolean(e),
    );
  } catch {
    return [];
  }
}

function persist(entries: ValidatedEdge[]): void {
  if (hasLS()) localStorage.setItem(LS_KEY, JSON.stringify(entries));
}

/** Dossier éligible à la promotion Alpha Forge (GO + lettre A–C). */
export function isEligibleDossier(dossier: DossierLike | null | undefined): EligibilityResult {
  if (!dossier?.grade) return { ok: false, reason: "Dossier non noté — lance la Reco Finale" };
  const verdict = String(dossier.grade.verdict || "").toUpperCase();
  if (verdict !== "GO") {
    return { ok: false, reason: `Verdict ${verdict || "?"} — seul GO est promouvable` };
  }
  const letter = String(dossier.grade.letter || "").toUpperCase();
  if (!ELIGIBLE_LETTERS.has(letter)) {
    return { ok: false, reason: `Lettre ${letter || "?"} — seules A/B/C sont acceptées` };
  }
  return { ok: true, reason: null };
}

/** Construit une entrée Validated Edge depuis un dossier (sans persister). */
export function dossierToEdge(
  dossier: DossierLike,
  { notes = "" }: { notes?: string } = {},
): ValidatedEdge {
  const elig = isEligibleDossier(dossier);
  if (!elig.ok) throw new Error(elig.reason || "Non éligible");
  const params =
    dossier.params && typeof dossier.params === "object" ? { ...dossier.params } : {};
  const metrics = extractMetricsFromStages(dossier.stages || {});
  const entry = normalizeEntry({
    name: dossier.name || `Edge #${dossier.strategyId ?? "?"}`,
    strategyId: dossier.strategyId as number | null | undefined,
    symbol: dossier.symbol as string | null | undefined,
    tf: dossier.tf as string | null | undefined,
    dossierId: dossier.id,
    verdict: dossier.grade?.verdict,
    score: dossier.grade?.score,
    letter: dossier.grade?.letter,
    metrics,
    params,
    toolsApplied: dossier.toolsApplied || [],
    notes,
    status: "active",
    validatedAt: Date.now(),
  });
  if (!entry) throw new Error("name requis");
  return entry;
}

/** Promote un dossier → registre. Upsert par fingerprint (active). */
export function promoteFromDossier(
  dossier: DossierLike,
  opts: { notes?: string } = {},
): { entry: ValidatedEdge; created: boolean } {
  const edge = dossierToEdge(dossier, opts);
  const list = loadValidatedEdges();
  const idx = list.findIndex(
    (e) => e.status === "active" && e.fingerprint === edge.fingerprint,
  );
  if (idx >= 0) {
    const updated: ValidatedEdge = {
      ...list[idx],
      ...edge,
      id: list[idx].id,
      validatedAt: list[idx].validatedAt,
      updatedAt: Date.now(),
    };
    list[idx] = updated;
    persist(list);
    return { entry: updated, created: false };
  }
  const next = [edge, ...list];
  persist(next);
  return { entry: edge, created: true };
}

/** Ajout manuel (tests / import) — exige verdict GO + lettre A–C. */
export function addValidatedEdge(
  partial: Partial<ValidatedEdge> & Record<string, unknown> = {},
): ValidatedEdge {
  const letter = String(partial.letter || "").toUpperCase();
  const verdict = String(partial.verdict || "GO").toUpperCase();
  if (verdict !== "GO") throw new Error("Seul un edge GO peut entrer dans Validated Edges");
  if (!ELIGIBLE_LETTERS.has(letter)) throw new Error("Lettre A, B ou C requise");
  const entry = normalizeEntry({
    ...partial,
    verdict,
    letter,
    status: "active",
    validatedAt: Date.now(),
  });
  if (!entry) throw new Error("name requis");
  const list = loadValidatedEdges();
  if (list.some((e) => e.status === "active" && e.fingerprint === entry.fingerprint)) {
    throw new Error("Edge déjà présent (même fingerprint)");
  }
  persist([entry, ...list]);
  return entry;
}

export function retireEdge(id: string): ValidatedEdge[] {
  const list = loadValidatedEdges().map((e) =>
    e.id === id ? { ...e, status: "retired" as const, updatedAt: Date.now() } : e,
  );
  persist(list);
  return list;
}

export function removeEdge(id: string): ValidatedEdge[] {
  const next = loadValidatedEdges().filter((e) => e.id !== id);
  persist(next);
  return next;
}

export function clearValidatedEdges(): ValidatedEdge[] {
  persist([]);
  return [];
}

export function listActiveEdges(entries: ValidatedEdge[] | null = null): ValidatedEdge[] {
  return (entries || loadValidatedEdges()).filter((e) => e.status === "active");
}

export function listRetiredEdges(entries: ValidatedEdge[] | null = null): ValidatedEdge[] {
  return (entries || loadValidatedEdges()).filter((e) => e.status === "retired");
}

/** CSV pour export desk. */
export function edgesToCsv(entries: ValidatedEdge[] | null = null): string {
  const rows = listActiveEdges(entries);
  const header = [
    "id", "name", "strategyId", "symbol", "tf", "letter", "score", "verdict",
    "sharpe", "profitFactor", "maxDd", "winrate", "trades", "dsr",
    "dossierId", "validatedAt",
  ];
  const lines = [header.join(",")];
  for (const e of rows) {
    const m = e.metrics || {};
    const cells = [
      e.id, e.name, e.strategyId, e.symbol, e.tf, e.letter, e.score, e.verdict,
      m.sharpe, m.profitFactor, m.maxDd, m.winrate, m.trades, m.dsr,
      e.dossierId, e.validatedAt ? new Date(e.validatedAt).toISOString() : "",
    ].map((v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}
