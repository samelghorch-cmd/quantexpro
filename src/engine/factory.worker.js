// Web Worker de l'Usine à Stratégies. Chaque worker traite un lot de paires (actif × timeframe) :
// 1) SCREENING de toutes les stratégies (params baseline), 2) REFINE des meilleures (sweep SL/TP/BE/direction).
// Tout le calcul lourd est ici → l'UI reste fluide.
import { buildStrategyLibrary } from "./strategyLibrary.js";
import { buildContext } from "./context.js";
import { runFactoryBacktest, factoryScore, pickMetrics, COST_MODELS } from "./costModel.js";
import { evaluateFactoryDsr, passesFactoryDsr, trialsForFactoryPair } from "./factoryDsr.js";

const LIB = buildStrategyLibrary();

// Grille de paramètres pour le raffinage (sweep déterministe).
function refineGrid() {
  const grid = [];
  const SL = [1.5, 2, 3];
  const TP = [0, 2, 4];
  const BE = [0, 1.5];
  const DIR = ["both", "long", "short"];
  for (const slAtr of SL) for (const tpAtr of TP) for (const beAtr of BE) for (const direction of DIR) {
    grid.push({ slAtr, tpAtr, beAtr, direction });
  }
  return grid; // 3×3×2×3 = 54 combinaisons
}
const GRID = refineGrid();

// Agrège les PnL par jour (pour la corrélation inter-stratégies côté main).
function dailyReturns(trades) {
  const byDay = new Map();
  for (const t of trades) {
    const day = Math.floor(t.exitTime / 86400000);
    byDay.set(day, (byDay.get(day) || 0) + t.pnl);
  }
  return [...byDay.entries()].map(([day, pnl]) => ({ day, pnl })).sort((a, b) => a.day - b.day);
}

function processPair(pair, topK, blockedIds = new Set()) {
  const { key, bars, classId, assetLabel, tfLabel } = pair;
  const cost = COST_MODELS[classId] || COST_MODELS.synthetic;
  const ctx = buildContext(bars);
  const n = bars.length;

  // Découpe train (70%) / test (30%). Le test n'est JAMAIS vu pendant l'optimisation → out-of-sample honnête.
  const split = Math.floor(n * 0.7);
  const oosOk = split - 50 >= 60 && n - split >= 40;
  const trainWin = oosOk ? { start: 50, end: split } : { start: 50, end: n };
  const testWin = oosOk ? { start: split, end: n } : { start: 50, end: n };

  // --- SCREENING sur le TRAIN uniquement (Anti-Library : skip les involutifs) ---
  const screened = [];
  let rejectedByAnti = 0;
  for (const s of LIB) {
    if (blockedIds.has(s.id)) { rejectedByAnti++; continue; }
    const m = runFactoryBacktest(bars, ctx, s.eval, { slAtr: 2 }, cost, 100000, trainWin);
    const sc = factoryScore(m);
    if (sc > 0) screened.push({ stratId: s.id, name: s.name, cat: s.cat, score: sc });
  }
  screened.sort((a, b) => b.score - a.score);
  const survivors = screened.slice(0, topK);
  self.postMessage({ type: "progress", key, phase: "screen", screened: screened.length });

  // --- REFINE sur le TRAIN, puis VALIDATION sur le TEST (OOS) ---
  // nTrials = essais de sélection sur cette paire (screening + grille de refine).
  // Sert à déflater le Sharpe (DSR) : plus on a testé, plus le seuil de significativité monte.
  const nTrials = trialsForFactoryPair(screened.length, GRID.length);
  const refined = [];
  let rejectedByDsr = 0;
  for (const surv of survivors) {
    const strat = LIB.find((x) => x.id === surv.stratId);
    let best = null;
    for (const p of GRID) {
      const m = runFactoryBacktest(bars, ctx, strat.eval, p, cost, 100000, trainWin);
      const sc = factoryScore(m);
      if (sc > 0 && (!best || sc > best.score)) best = { trainScore: sc, params: p, trainMetrics: m };
    }
    if (!best) continue;

    // Évaluation out-of-sample avec les MEILLEURS paramètres trouvés sur le train
    const oosM = oosOk ? runFactoryBacktest(bars, ctx, strat.eval, best.params, cost, 100000, testWin) : best.trainMetrics;
    const oosScore = factoryScore(oosM, 5);
    const robustness = Math.round(Math.max(0, Math.min(120, (oosScore / Math.max(best.trainScore, 1)) * 100)));

    // Garde uniquement ce qui tient hors-échantillon
    if (oosOk && (oosScore <= 0 || oosM.nTrades < 5)) continue;

    // Filtre DSR (P1) : même seuil que Reco Finale — un DSR < 50 % = overfit probable.
    const dsrRes = evaluateFactoryDsr(oosM.trades, nTrials);
    if (!passesFactoryDsr(dsrRes, { oos: oosOk })) {
      rejectedByDsr++;
      continue;
    }

    refined.push({
      stratId: surv.stratId, name: surv.name, cat: surv.cat,
      asset: assetLabel, tf: tfLabel, classId, key,
      params: best.params,
      score: oosOk ? oosScore : best.trainScore,   // classement par performance OUT-OF-SAMPLE
      trainScore: Math.round(best.trainScore),
      oosScore: Math.round(oosScore),
      robustness, oos: oosOk,
      nTrials,
      dsr: Number.isFinite(dsrRes.dsr) ? dsrRes.dsr : null,
      srStar: Number.isFinite(dsrRes.srStar) ? dsrRes.srStar : null,
      metrics: pickMetrics(oosM),                  // métriques affichées = hors-échantillon
      isMetrics: pickMetrics(best.trainMetrics),   // référence in-sample
      daily: dailyReturns(oosM.trades),            // corrélation portefeuille sur période OOS
    });
  }
  refined.sort((a, b) => b.score - a.score);
  return { key, assetLabel, tfLabel, screenedCount: screened.length, refined, oos: oosOk, nTrials, rejectedByDsr, rejectedByAnti };
}

self.onmessage = (e) => {
  const { pairs, topK = 6, blockedIds = [] } = e.data;
  const blocked = new Set(blockedIds);
  for (const pair of pairs) {
    try {
      const res = processPair(pair, topK, blocked);
      self.postMessage({ type: "pair-done", ...res });
    } catch (err) {
      self.postMessage({ type: "pair-error", key: pair.key, error: String(err && err.message || err) });
    }
  }
  self.postMessage({ type: "batch-done" });
};
