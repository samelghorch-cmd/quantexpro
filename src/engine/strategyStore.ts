// @ts-nocheck — migration bulk P10-TS-ENGINE; typage strict à reprendre fichier par fichier.
// Couche haut niveau de persistance durable (IndexedDB) — répond à deux exigences :
//   1. « Les stratégies s'enregistrent avec les paramètres mis »  → saveStrategy / listStrategies
//   2. « Le système comprend les données de chaque backtest de chaque outil » → logBacktest / listBacktests
// Tout survit au rechargement de la page (contrairement au PipelineContext, purement en mémoire).
import { idbPut, idbGet, idbAll, idbDelete, idbClear, STRATEGIES, BACKTESTS } from "./dataStore.ts";

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Ne garde que les champs sérialisables des métriques (pas de courbe d'équité massive ni de trades).
function slimMetrics(m = {}) {
  const keep = ["sharpe", "sortino", "calmar", "cagr", "profitFactor", "winRate", "maxDD",
    "totalPnL", "totalPnLPct", "expectancyR", "nTrades", "kelly", "kellyHalf", "score", "score100"];
  const out = {};
  for (const k of keep) if (m[k] != null && Number.isFinite(m[k])) out[k] = m[k];
  return out;
}

// ---- Stratégies sauvegardées (avec paramètres) ----
export async function saveStrategy(entry) {
  const rec = {
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
export async function listStrategies() {
  const all = await idbAll(STRATEGIES);
  return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
export async function getStrategy(id) { return idbGet(id, STRATEGIES); }
export async function deleteStrategy(id) { return idbDelete(id, STRATEGIES); }
export async function clearStrategies() { return idbClear(STRATEGIES); }

// ---- Journal de backtests (tous outils) ----
export async function logBacktest(entry) {
  const rec = {
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
export async function listBacktests(limit = 200) {
  const all = await idbAll(BACKTESTS);
  all.sort((a, b) => (b.ranAt || 0) - (a.ranAt || 0));
  return limit ? all.slice(0, limit) : all;
}
export async function clearBacktests() { return idbClear(BACKTESTS); }

// Garde le journal borné (500 entrées max) pour ne pas gonfler indéfiniment.
async function pruneBacktests(max = 500) {
  const all = await idbAll(BACKTESTS);
  if (all.length <= max) return;
  all.sort((a, b) => (a.ranAt || 0) - (b.ranAt || 0));
  const excess = all.length - max;
  for (let i = 0; i < excess; i++) await idbDelete(all[i].id, BACKTESTS);
}
