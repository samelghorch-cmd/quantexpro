// Couche haut niveau de persistance durable (IndexedDB) — répond à deux exigences :
//   1. « Les stratégies s'enregistrent avec les paramètres mis »  → saveStrategy / listStrategies
//   2. « Le système comprend les données de chaque backtest de chaque outil » → logBacktest / listBacktests
// Tout survit au rechargement de la page (contrairement au PipelineContext, purement en mémoire).
import { idbPut, idbGet, idbAll, idbDelete, idbClear, STRATEGIES, BACKTESTS } from "./dataStore.ts";

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export type SlimMetrics = Record<string, number>;

export interface StrategyRecord {
  id: string;
  name: string;
  strategyId: number | string | null;
  symbol: string | null;
  tf: string | null;
  dataMode: string | null;
  params: Record<string, unknown>;
  metrics: SlimMetrics;
  verdict: string | null;
  note: string;
  savedAt: number;
  updatedAt: number;
}

export interface BacktestLogRecord {
  id: string;
  tool: string;
  name: string;
  strategyId: number | string | null;
  symbol: string | null;
  tf: string | null;
  dataMode: string | null;
  params: Record<string, unknown>;
  metrics: SlimMetrics;
  verdict: string | null;
  ranAt: number;
}

export interface StrategyEntry {
  id?: string;
  name?: string;
  strategyId?: number | string | null;
  symbol?: string | null;
  tf?: string | null;
  dataMode?: string | null;
  params?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  verdict?: string | null;
  note?: string;
  savedAt?: number;
}

export interface BacktestEntry {
  tool?: string;
  name?: string;
  strategyId?: number | string | null;
  symbol?: string | null;
  tf?: string | null;
  dataMode?: string | null;
  params?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  verdict?: string | null;
}

// Ne garde que les champs sérialisables des métriques (pas de courbe d'équité massive ni de trades).
function slimMetrics(m: Record<string, unknown> = {}): SlimMetrics {
  const keep = ["sharpe", "sortino", "calmar", "cagr", "profitFactor", "winRate", "maxDD",
    "totalPnL", "totalPnLPct", "expectancyR", "nTrades", "kelly", "kellyHalf", "score", "score100"];
  const out: SlimMetrics = {};
  for (const k of keep) {
    const v = m[k];
    if (v != null && typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

// ---- Stratégies sauvegardées (avec paramètres) ----
export async function saveStrategy(entry: StrategyEntry): Promise<StrategyRecord> {
  const rec: StrategyRecord = {
    id: entry.id || uid(),
    name: entry.name || "Stratégie",
    strategyId: entry.strategyId ?? null,
    symbol: entry.symbol ?? null,
    tf: entry.tf ?? null,
    dataMode: entry.dataMode ?? null,       // synthetic / live
    params: entry.params || {},             // { slAtr, tpAtr, beAtr, direction, ... }
    metrics: slimMetrics(entry.metrics),
    verdict: entry.verdict ?? null,
    note: entry.note ?? "",
    savedAt: entry.savedAt || Date.now(),
    updatedAt: Date.now(),
  };
  await idbPut(rec, STRATEGIES);
  return rec;
}
export async function listStrategies(): Promise<StrategyRecord[]> {
  const all = await idbAll(STRATEGIES) as StrategyRecord[];
  return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
export async function getStrategy(id: IDBValidKey): Promise<StrategyRecord | null> {
  return idbGet(id, STRATEGIES) as Promise<StrategyRecord | null>;
}
export async function deleteStrategy(id: IDBValidKey) { return idbDelete(id, STRATEGIES); }
export async function clearStrategies() { return idbClear(STRATEGIES); }

// ---- Journal de backtests (tous outils) ----
export async function logBacktest(entry: BacktestEntry): Promise<BacktestLogRecord> {
  const rec: BacktestLogRecord = {
    id: uid(),
    tool: entry.tool || "Backtest",         // Backtest / FAO / Usine / Validator / Live Optim…
    name: entry.name || "—",
    strategyId: entry.strategyId ?? null,
    symbol: entry.symbol ?? null,
    tf: entry.tf ?? null,
    dataMode: entry.dataMode ?? null,
    params: entry.params || {},
    metrics: slimMetrics(entry.metrics),
    verdict: entry.verdict ?? null,
    ranAt: Date.now(),
  };
  await idbPut(rec, BACKTESTS);
  await pruneBacktests();
  return rec;
}
export async function listBacktests(limit = 200): Promise<BacktestLogRecord[]> {
  const all = await idbAll(BACKTESTS) as BacktestLogRecord[];
  all.sort((a, b) => (b.ranAt || 0) - (a.ranAt || 0));
  return limit ? all.slice(0, limit) : all;
}
export async function clearBacktests() { return idbClear(BACKTESTS); }

// Garde le journal borné (500 entrées max) pour ne pas gonfler indéfiniment.
async function pruneBacktests(max = 500) {
  const all = await idbAll(BACKTESTS) as BacktestLogRecord[];
  if (all.length <= max) return;
  all.sort((a, b) => (a.ranAt || 0) - (b.ranAt || 0));
  const excess = all.length - max;
  for (let i = 0; i < excess; i++) await idbDelete(all[i].id, BACKTESTS);
}
