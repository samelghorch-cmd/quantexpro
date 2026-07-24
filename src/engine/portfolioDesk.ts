// P4-DESK / P8-TS-DESK — Desk PM unifié (flotte equity / réserve risque).
// Agrège dossiers (GO + démo), Validated Edges, jobs collector optionnels.
// Pas d'ordres réels : vue de gouvernance desk (capital, PnL, budget risque).

export interface DeskConfig {
  capital: number;
  /** Budget risque max en % du capital (spec « réserve 1.4 % »). */
  riskBudgetPct: number;
  /** Risque notionnel alloué par sleeve active (en % du capital). */
  riskPerSleevePct: number;
  currency: string;
}

export type SleeveKind = "validated_edge" | "dossier" | "collector_job";

export interface DeskSleeve {
  id: string;
  kind: SleeveKind;
  name: string;
  strategyId?: number | string | null;
  symbol?: string | null;
  tf?: string | null;
  letter?: string | null;
  score?: number | null;
  verdict?: string | null;
  status: string;
  realizedPnL: number;
  demoTrades: number;
  backtestPnL?: number | null;
  riskAllocated: number;
  source: string;
  dossierId?: string | number;
  jobId?: string | number;
}

export interface DeskBook {
  cfg: DeskConfig;
  sleeves: DeskSleeve[];
  edgeFingerprintCount: number;
}

export interface DeskMetrics {
  capital: number;
  currency: string;
  equity: number;
  realizedPnL: number;
  riskBudget: number;
  riskBudgetPct: number;
  riskUsed: number;
  riskRemaining: number;
  riskUsedPct: number;
  /** Réserve risque restante en % du capital (cible type 1.4 %). */
  reservePctOfCapital: number;
  overloaded: boolean;
  nSleeves: number;
  nBooked: number;
  nDemo: number;
  nJobs: number;
  nGo: number;
}

export interface PmDesk extends DeskBook {
  metrics: DeskMetrics;
}

export interface DeskBuildInput {
  dossiers?: Record<string, unknown>[];
  edges?: Record<string, unknown>[];
  jobs?: Record<string, unknown>[];
  config?: Partial<DeskConfig> | null;
}

export interface PnLSummary {
  pnl: number;
  trades: number;
  sessions: number;
}

export interface BacktestPnLSummary {
  pnl: number | null;
  trades: number | null;
}

export const DEFAULT_DESK_CONFIG: DeskConfig = {
  capital: 500_000,
  riskBudgetPct: 1.4,
  riskPerSleevePct: 0.25,
  currency: "EUR",
};

const LS_CFG = "quantexpro:pmDesk:v1";

export function loadDeskConfig(): DeskConfig {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_DESK_CONFIG };
    const raw = JSON.parse(localStorage.getItem(LS_CFG) || "null") as unknown;
    if (!raw || typeof raw !== "object") return { ...DEFAULT_DESK_CONFIG };
    return normalizeConfig(raw as Partial<DeskConfig>);
  } catch {
    return { ...DEFAULT_DESK_CONFIG };
  }
}

export function saveDeskConfig(partial: Partial<DeskConfig> = {}): DeskConfig {
  const next = normalizeConfig({ ...loadDeskConfig(), ...partial });
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(LS_CFG, JSON.stringify(next));
  } catch { /* noop */ }
  return next;
}

export function normalizeConfig(raw: Partial<DeskConfig> | Record<string, unknown> = {}): DeskConfig {
  const capital = Math.max(1_000, Number(raw.capital) || DEFAULT_DESK_CONFIG.capital);
  const riskBudgetPct = clamp(Number(raw.riskBudgetPct), 0.1, 20) || DEFAULT_DESK_CONFIG.riskBudgetPct;
  const riskPerSleevePct = clamp(Number(raw.riskPerSleevePct), 0.05, 5) || DEFAULT_DESK_CONFIG.riskPerSleevePct;
  return {
    capital,
    riskBudgetPct,
    riskPerSleevePct,
    currency: String(raw.currency || "EUR").toUpperCase().slice(0, 3),
  };
}

function clamp(n: number, lo: number, hi: number): number | null {
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}

function num(v: unknown, d: number | null = 0): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/** PnL réalisé depuis sessions démo d'un dossier. */
export function dossierDemoPnL(dossier: Record<string, unknown> | null | undefined): PnLSummary {
  const sessions = (dossier?.demoSessions as unknown[]) || [];
  let pnl = 0;
  let trades = 0;
  for (const se of sessions) {
    const s = se as Record<string, unknown>;
    const fm = (s.finalMetrics || {}) as Record<string, unknown>;
    pnl += num(fm.sessionPnL ?? fm.totalPnL) ?? 0;
    trades += ((s.trades as unknown[]) || []).length || (num(fm.nTrades) ?? 0);
  }
  return { pnl, trades, sessions: sessions.length };
}

/** Snapshot PnL backtest si stage présent. */
export function dossierBacktestPnL(dossier: Record<string, unknown> | null | undefined): BacktestPnLSummary {
  const stages = dossier?.stages as Record<string, unknown> | undefined;
  const st = stages?.backtest as Record<string, unknown> | undefined;
  const res = (st?.res || st?.result || st) as Record<string, unknown> | undefined;
  if (!res) return { pnl: null, trades: null };
  const pnl = num(res.totalPnL ?? res.pnl, null);
  const tradesArr = res.trades as unknown[] | undefined;
  const trades = num(res.nTrades ?? tradesArr?.length, null);
  return {
    pnl: Number.isFinite(pnl as number) ? (pnl as number) : null,
    trades: Number.isFinite(trades as number) ? (trades as number) : null,
  };
}

/** Construit les sleeves (lignes de book) depuis dossiers + edges + jobs. */
export function buildDeskBook({
  dossiers = [],
  edges = [],
  jobs = [],
  config = null,
}: DeskBuildInput = {}): DeskBook {
  const cfg = normalizeConfig(config || DEFAULT_DESK_CONFIG);
  const riskPerSleeve = (cfg.capital * cfg.riskPerSleevePct) / 100;
  const sleeves: DeskSleeve[] = [];

  // 1) Validated Edges actifs = sleeves « bookés »
  for (const e of edges || []) {
    if (e.status && e.status !== "active") continue;
    sleeves.push({
      id: `edge:${e.id}`,
      kind: "validated_edge",
      name: (e.name as string) || `Edge #${e.strategyId}`,
      strategyId: e.strategyId as number | string | null | undefined,
      symbol: e.symbol as string | null | undefined,
      tf: e.tf as string | null | undefined,
      letter: e.letter as string | null | undefined,
      score: e.score as number | null | undefined,
      status: "booked",
      realizedPnL: 0,
      demoTrades: 0,
      riskAllocated: riskPerSleeve,
      source: "alpha_forge",
    });
  }

  // 2) Dossiers GO / notés — sleeves recherche + PnL démo
  const edgeFps = new Set(
    (edges || [])
      .filter((e) => !e.status || e.status === "active")
      .map((e) => e.fingerprint as string | undefined)
      .filter(Boolean) as string[],
  );

  for (const d of dossiers || []) {
    const demo = dossierDemoPnL(d);
    const bt = dossierBacktestPnL(d);
    const grade = (d.grade || null) as Record<string, unknown> | null;
    const isGo = String(grade?.verdict || "").toUpperCase() === "GO";
    const hasDemo = demo.sessions > 0;
    // Uniquement GO (validés) ou activité démo — pas les REWORK/NO-GO sans live.
    if (!isGo && !hasDemo) continue;

    // Évite double-comptage risque si déjà promu Alpha Forge (même dossier)
    const alreadyBooked = Boolean(
      d.id && (edges || []).some((e) => e.dossierId === d.id && (!e.status || e.status === "active")),
    );

    sleeves.push({
      id: `dos:${d.id}`,
      kind: "dossier",
      name: (d.name as string) || `Dossier ${d.id}`,
      strategyId: d.strategyId as number | string | null | undefined,
      symbol: d.symbol as string | null | undefined,
      tf: d.tf as string | null | undefined,
      letter: (grade?.letter as string) || null,
      score: (grade?.score as number) ?? null,
      verdict: (grade?.verdict as string) || null,
      status: isGo ? (alreadyBooked ? "promoted" : "validated") : hasDemo ? "demo" : "research",
      realizedPnL: demo.pnl,
      demoTrades: demo.trades,
      backtestPnL: bt.pnl,
      riskAllocated: alreadyBooked ? 0 : isGo ? riskPerSleeve : hasDemo ? riskPerSleeve * 0.5 : 0,
      source: "dossier",
      dossierId: d.id as string | number,
    });
  }

  // 3) Jobs collector 24/7
  for (const j of jobs || []) {
    const stats = (j.stats || {}) as Record<string, unknown>;
    sleeves.push({
      id: `job:${j.id}`,
      kind: "collector_job",
      name: (j.name as string) || (j.strategyName as string) || `Job ${j.id}`,
      strategyId: (j.strategyId ?? j.stratId ?? null) as number | string | null,
      symbol: (j.symbol || j.ticker || null) as string | null,
      tf: (j.tf || j.interval || null) as string | null,
      letter: null,
      score: null,
      status: (j.status as string) || "running",
      realizedPnL: num(j.pnl ?? j.realizedPnL ?? stats.pnl) ?? 0,
      demoTrades: num(j.nTrades ?? stats.trades) ?? 0,
      riskAllocated: riskPerSleeve * 0.75,
      source: "collector",
      jobId: j.id as string | number,
    });
  }

  return { cfg, sleeves, edgeFingerprintCount: edgeFps.size };
}

/** Agrégats desk : equity, réserve risque, utilisation. */
export function computeDeskMetrics(book: Partial<DeskBook> | null | undefined): DeskMetrics {
  const cfg = book?.cfg || DEFAULT_DESK_CONFIG;
  const sleeves = book?.sleeves || [];
  const riskBudget = (cfg.capital * cfg.riskBudgetPct) / 100;

  let realizedPnL = 0;
  let riskUsed = 0;
  let nBooked = 0;
  let nDemo = 0;
  let nJobs = 0;
  let nGo = 0;

  for (const s of sleeves) {
    realizedPnL += num(s.realizedPnL) ?? 0;
    riskUsed += num(s.riskAllocated) ?? 0;
    if (s.kind === "validated_edge" || s.status === "booked" || s.status === "promoted") nBooked++;
    if (s.kind === "dossier" && (s.status === "demo" || s.demoTrades > 0)) nDemo++;
    if (s.kind === "collector_job") nJobs++;
    if (s.verdict === "GO" || s.kind === "validated_edge") nGo++;
  }

  const equity = cfg.capital + realizedPnL;
  const riskRemaining = Math.max(0, riskBudget - riskUsed);
  const riskUsedPct = riskBudget > 0 ? (riskUsed / riskBudget) * 100 : 0;
  const reservePctOfCapital = cfg.capital > 0 ? (riskRemaining / cfg.capital) * 100 : 0;
  const overloaded = riskUsed > riskBudget + 1e-9;

  return {
    capital: cfg.capital,
    currency: cfg.currency,
    equity,
    realizedPnL,
    riskBudget,
    riskBudgetPct: cfg.riskBudgetPct,
    riskUsed,
    riskRemaining,
    riskUsedPct,
    reservePctOfCapital,
    overloaded,
    nSleeves: sleeves.length,
    nBooked,
    nDemo,
    nJobs,
    nGo,
  };
}

/** Build + metrics en un appel. */
export function buildPmDesk(input: DeskBuildInput = {}): PmDesk {
  const book = buildDeskBook(input);
  const metrics = computeDeskMetrics(book);
  return { ...book, metrics };
}

export function deskToCsv(book: Partial<DeskBook> | null | undefined): string {
  const header = [
    "id", "kind", "name", "strategyId", "symbol", "tf", "status", "letter", "score",
    "realizedPnL", "riskAllocated", "source",
  ];
  const lines = [header.join(",")];
  for (const s of book?.sleeves || []) {
    const cells = [
      s.id, s.kind, s.name, s.strategyId, s.symbol, s.tf, s.status, s.letter, s.score,
      s.realizedPnL, s.riskAllocated, s.source,
    ].map((v) => {
      const str = v == null ? "" : String(v);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    });
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}
