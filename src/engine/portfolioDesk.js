// P4-DESK — Desk PM unifié (flotte equity / réserve risque).
// Agrège dossiers (GO + démo), Validated Edges, jobs collector optionnels.
// Pas d'ordres réels : vue de gouvernance desk (capital, PnL, budget risque).

export const DEFAULT_DESK_CONFIG = {
  capital: 500_000,
  /** Budget risque max en % du capital (spec « réserve 1.4 % »). */
  riskBudgetPct: 1.4,
  /** Risque notionnel alloué par sleeve active (en % du capital). */
  riskPerSleevePct: 0.25,
  currency: "EUR",
};

const LS_CFG = "quantexpro:pmDesk:v1";

export function loadDeskConfig() {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_DESK_CONFIG };
    const raw = JSON.parse(localStorage.getItem(LS_CFG) || "null");
    if (!raw || typeof raw !== "object") return { ...DEFAULT_DESK_CONFIG };
    return normalizeConfig(raw);
  } catch {
    return { ...DEFAULT_DESK_CONFIG };
  }
}

export function saveDeskConfig(partial = {}) {
  const next = normalizeConfig({ ...loadDeskConfig(), ...partial });
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(LS_CFG, JSON.stringify(next));
  } catch { /* noop */ }
  return next;
}

export function normalizeConfig(raw = {}) {
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

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/** PnL réalisé depuis sessions démo d'un dossier. */
export function dossierDemoPnL(dossier) {
  const sessions = dossier?.demoSessions || [];
  let pnl = 0;
  let trades = 0;
  for (const se of sessions) {
    pnl += num(se.finalMetrics?.sessionPnL ?? se.finalMetrics?.totalPnL);
    trades += (se.trades || []).length || num(se.finalMetrics?.nTrades);
  }
  return { pnl, trades, sessions: sessions.length };
}

/** Snapshot PnL backtest si stage présent. */
export function dossierBacktestPnL(dossier) {
  const st = dossier?.stages?.backtest;
  const res = st?.res || st?.result || st;
  if (!res) return { pnl: null, trades: null };
  const pnl = num(res.totalPnL ?? res.pnl, null);
  const trades = num(res.nTrades ?? res.trades?.length, null);
  return {
    pnl: Number.isFinite(pnl) ? pnl : null,
    trades: Number.isFinite(trades) ? trades : null,
  };
}

/**
 * Construit les sleeves (lignes de book) depuis dossiers + edges + jobs.
 * @param {{ dossiers?: object[], edges?: object[], jobs?: object[], config?: object }} input
 */
export function buildDeskBook({ dossiers = [], edges = [], jobs = [], config = null } = {}) {
  const cfg = normalizeConfig(config || DEFAULT_DESK_CONFIG);
  const riskPerSleeve = (cfg.capital * cfg.riskPerSleevePct) / 100;
  const sleeves = [];

  // 1) Validated Edges actifs = sleeves « bookés »
  for (const e of edges || []) {
    if (e.status && e.status !== "active") continue;
    sleeves.push({
      id: `edge:${e.id}`,
      kind: "validated_edge",
      name: e.name || `Edge #${e.strategyId}`,
      strategyId: e.strategyId,
      symbol: e.symbol,
      tf: e.tf,
      letter: e.letter,
      score: e.score,
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
      .map((e) => e.fingerprint)
      .filter(Boolean),
  );

  for (const d of dossiers || []) {
    const demo = dossierDemoPnL(d);
    const bt = dossierBacktestPnL(d);
    const grade = d.grade || null;
    const isGo = String(grade?.verdict || "").toUpperCase() === "GO";
    const hasDemo = demo.sessions > 0;
    // Uniquement GO (validés) ou activité démo — pas les REWORK/NO-GO sans live.
    if (!isGo && !hasDemo) continue;

    // Évite double-comptage risque si déjà promu Alpha Forge (même dossier)
    const alreadyBooked = d.id && (edges || []).some((e) => e.dossierId === d.id && (!e.status || e.status === "active"));

    sleeves.push({
      id: `dos:${d.id}`,
      kind: "dossier",
      name: d.name || `Dossier ${d.id}`,
      strategyId: d.strategyId,
      symbol: d.symbol,
      tf: d.tf,
      letter: grade?.letter || null,
      score: grade?.score ?? null,
      verdict: grade?.verdict || null,
      status: isGo ? (alreadyBooked ? "promoted" : "validated") : hasDemo ? "demo" : "research",
      realizedPnL: demo.pnl,
      demoTrades: demo.trades,
      backtestPnL: bt.pnl,
      riskAllocated: alreadyBooked ? 0 : isGo ? riskPerSleeve : hasDemo ? riskPerSleeve * 0.5 : 0,
      source: "dossier",
      dossierId: d.id,
    });
  }

  // 3) Jobs collector 24/7
  for (const j of jobs || []) {
    sleeves.push({
      id: `job:${j.id}`,
      kind: "collector_job",
      name: j.name || j.strategyName || `Job ${j.id}`,
      strategyId: j.strategyId ?? j.stratId ?? null,
      symbol: j.symbol || j.ticker || null,
      tf: j.tf || j.interval || null,
      letter: null,
      score: null,
      status: j.status || "running",
      realizedPnL: num(j.pnl ?? j.realizedPnL ?? j.stats?.pnl),
      demoTrades: num(j.nTrades ?? j.stats?.trades),
      riskAllocated: riskPerSleeve * 0.75,
      source: "collector",
      jobId: j.id,
    });
  }

  return { cfg, sleeves, edgeFingerprintCount: edgeFps.size };
}

/**
 * Agrégats desk : equity, réserve risque, utilisation.
 * @param {{ sleeves: object[], cfg: object }} book
 */
export function computeDeskMetrics(book) {
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
    realizedPnL += num(s.realizedPnL);
    riskUsed += num(s.riskAllocated);
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
    /** Réserve risque restante en % du capital (cible type 1.4 %). */
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
export function buildPmDesk(input = {}) {
  const book = buildDeskBook(input);
  const metrics = computeDeskMetrics(book);
  return { ...book, metrics };
}

export function deskToCsv(book) {
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
