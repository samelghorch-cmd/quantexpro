// Orchestrateur de l'Usine à Stratégies (thread principal).
// Récupère les données réelles, distribue le travail sur un pool de Web Workers,
// agrège les variantes, construit la corrélation inter-stratégies et un portefeuille diversifié.
import { fetchCandles, TF_MAP } from "./marketData.ts";
import { buildStrategyLibrary } from "./strategyLibrary.ts";
import { blockedStrategyIds, ensureSeeded } from "./antiLibrary.ts";
import { stressPortfolio } from "./portfolioStress.ts";
import type { OHLCVBar } from "./context.ts";

// Espace de recherche par défaut (respecte « tous les actifs connectés » avec un actif fort par classe).
export const FACTORY_DEFAULT_ASSETS = ["BTC", "SPX", "NDX", "EURUSD", "GOLD", "WTI"];
export const FACTORY_DEFAULT_TFS = [12, 48, 288]; // 1h, 4h, 1j

export interface FactoryDailyBar {
  day: number;
  pnl: number;
}

/** Variante raffinée renvoyée par le worker Usine. */
export interface FactoryVariant {
  stratId: number | string;
  name: string;
  cat: string;
  asset: string;
  tf: string;
  classId: string;
  key: string;
  params: Record<string, unknown>;
  score: number;
  trainScore: number;
  oosScore: number;
  robustness: number;
  oos: boolean;
  nTrials: number;
  dsr: number | null;
  srStar: number | null;
  metrics: Record<string, unknown>;
  isMetrics: Record<string, unknown>;
  daily: FactoryDailyBar[];
}

export interface FactoryPortfolio {
  picks: FactoryVariant[];
  curve: number[];
  sharpe: number;
  maxDD: number;
  avgCorr: number;
  totalPnL: number;
  days: number;
  corrMatrix: number[][];
  corrLabels: string[];
}

export interface FactoryProgress {
  phase: string;
  label: string;
  pct: number;
  pairsDone?: number;
  totalPairs?: number;
}

export interface FactoryOptions {
  assets?: string[];
  tfs?: number[];
  topK?: number;
}

export type FactoryProgressCb = (patch: FactoryProgress) => void;

interface FactoryPair {
  key: string;
  bars: OHLCVBar[];
  classId: string;
  assetLabel: string;
  tfLabel: string;
}

interface FactoryPerPair {
  key: string;
  asset: string;
  tf: string;
  screened: number;
  refinedCount: number;
  nTrials: number;
  rejectedByDsr: number;
  rejectedByAnti: number;
}

type WorkerPairDone = {
  type: "pair-done";
  key: string;
  assetLabel: string;
  tfLabel: string;
  screenedCount: number;
  refined: FactoryVariant[];
  nTrials: number;
  rejectedByDsr?: number;
  rejectedByAnti?: number;
};

type WorkerBatchDone = { type: "batch-done" };
type WorkerPairError = { type: "pair-error"; key?: string; error?: string };
type WorkerMsg = WorkerPairDone | WorkerBatchDone | WorkerPairError | { type: string };

// Taille de l'espace couvert (pour l'affichage « des millions de configurations »).
export function coveredSpace(nAssets: number, nTfs: number, nStrats = 700, paramCombos = 54) {
  const stratAssetTf = nStrats * nAssets * nTfs;
  return { stratAssetTf, total: stratAssetTf * paramCombos };
}

// ---- Corrélation & portefeuille ----
function corr(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / (Math.sqrt(da * db) || 1e-10);
}

// Aligne les rendements journaliers de chaque variante sur un axe de jours commun.
function alignDaily(variants: FactoryVariant[]) {
  const days = new Set<number>();
  variants.forEach((v) => v.daily.forEach((d) => days.add(d.day)));
  const axis = [...days].sort((a, b) => a - b);
  const idx = new Map(axis.map((d, i) => [d, i]));
  const vectors = variants.map((v) => {
    const vec = new Array(axis.length).fill(0) as number[];
    v.daily.forEach((d) => { vec[idx.get(d.day)!] = d.pnl; });
    return vec;
  });
  return { axis, vectors };
}

// Sélection gloutonne d'un panier diversifié (faible corrélation, score élevé).
export function buildPortfolio(
  variants: FactoryVariant[],
  { maxN = 8, maxCorr = 0.5 }: { maxN?: number; maxCorr?: number } = {},
): FactoryPortfolio | null {
  if (variants.length === 0) return null;
  const pool = [...variants].sort((a, b) => b.score - a.score).slice(0, 40);
  const { axis, vectors } = alignDaily(pool);
  const n = pool.length;
  const cmat = Array.from({ length: n }, () => Array(n).fill(0) as number[]);
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { const c = i === j ? 1 : corr(vectors[i], vectors[j]); cmat[i][j] = c; cmat[j][i] = c; }

  const selected = [0]; // meilleur score en premier
  for (let i = 1; i < n && selected.length < maxN; i++) {
    const maxWithSel = Math.max(...selected.map((s) => Math.abs(cmat[i][s])));
    if (maxWithSel < maxCorr) selected.push(i);
  }
  // si trop peu sélectionnés, relâche le seuil
  if (selected.length < Math.min(4, n)) {
    for (let i = 1; i < n && selected.length < Math.min(maxN, n); i++) if (!selected.includes(i)) selected.push(i);
  }

  const picks = selected.map((i) => pool[i]);
  // portefeuille équipondéré
  const combined = new Array(axis.length).fill(0) as number[];
  selected.forEach((i) => vectors[i].forEach((v, k) => (combined[k] += v / selected.length)));
  // équité + métriques du portefeuille
  let eq = 100000, peak = 100000, maxDD = 0;
  const curve = [eq];
  combined.forEach((p) => { eq += p; curve.push(eq); if (eq > peak) peak = eq; const dd = (peak - eq) / peak; if (dd > maxDD) maxDD = dd; });
  const mean = combined.reduce((a, b) => a + b, 0) / (combined.length || 1);
  const sd = Math.sqrt(combined.reduce((a, b) => a + (b - mean) ** 2, 0) / (combined.length || 1)) || 1e-9;
  const sharpe = (mean / sd) * Math.sqrt(252);

  // corrélation moyenne du panier (la « corrélation de corrélation » : à quel point le panier est décorrélé)
  let sum = 0, cnt = 0;
  for (let a = 0; a < selected.length; a++) for (let b = a + 1; b < selected.length; b++) { sum += Math.abs(cmat[selected[a]][selected[b]]); cnt++; }
  const avgCorr = cnt ? sum / cnt : 0;

  return {
    picks, curve, sharpe, maxDD, avgCorr,
    totalPnL: eq - 100000, days: axis.length,
    corrMatrix: cmat, corrLabels: pool.map((p) => `#${p.stratId}·${p.asset}·${p.tf}`),
  };
}

// ---- Récupération des données ----
async function fetchAllPairs(
  assets: string[],
  tfs: number[],
  onData?: (done: number, total: number) => void,
): Promise<FactoryPair[]> {
  const pairs: FactoryPair[] = [];
  const jobs: { a: string; tf: number }[] = [];
  for (const a of assets) for (const tf of tfs) jobs.push({ a, tf });
  // concurrence limitée pour ne pas saturer Yahoo
  let done = 0;
  const CONC = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const { a, tf } = jobs[cursor++];
      try {
        const { bars, symbol } = await fetchCandles(a, tf);
        if (bars && bars.length >= 120) {
          const tfMeta = (TF_MAP as Record<number, { label: string }>)[tf];
          pairs.push({
            key: `${a}:${tf}`,
            bars: bars as OHLCVBar[],
            classId: symbol.classId as string,
            assetLabel: symbol.label as string,
            tfLabel: tfMeta.label,
          });
        }
      } catch { /* actif indisponible sur ce TF → ignoré */ }
      done++; onData && onData(done, jobs.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, jobs.length) }, worker));
  return pairs;
}

// ---- Point d'entrée : lance l'usine ----
export async function runFactory(
  { assets = FACTORY_DEFAULT_ASSETS, tfs = FACTORY_DEFAULT_TFS, topK = 6 }: FactoryOptions = {},
  onProgress?: FactoryProgressCb,
) {
  const emit = (patch: FactoryProgress) => onProgress && onProgress(patch);

  emit({ phase: "fetch", label: "Récupération des données réelles…", pct: 0 });
  const pairs = await fetchAllPairs(assets, tfs, (d, t) => emit({ phase: "fetch", label: `Données ${d}/${t}`, pct: (d / t) * 100 }));
  if (pairs.length === 0) throw new Error("Aucune donnée récupérée (réseau ?).");

  // Pool de workers
  const nWorkers = Math.max(1, Math.min(navigator.hardwareConcurrency || 4, pairs.length, 8));
  const buckets: FactoryPair[][] = Array.from({ length: nWorkers }, () => []);
  pairs.forEach((p, i) => buckets[i % nWorkers].push(p));

  const allRefined: FactoryVariant[] = [];
  const perPair: FactoryPerPair[] = [];
  let pairsDone = 0;
  let rejectedByDsr = 0;
  let rejectedByAnti = 0;
  const totalPairs = pairs.length;

  // Snapshot Anti-Library pour les workers (pas de localStorage dans le worker).
  ensureSeeded();
  const blockedIds = blockedStrategyIds(buildStrategyLibrary());

  emit({ phase: "compute", label: `Analyse en cours sur ${nWorkers} cœurs…`, pct: 0, pairsDone, totalPairs });

  await new Promise<void>((resolve) => {
    let active = nWorkers;
    const workers: Worker[] = [];
    for (let w = 0; w < nWorkers; w++) {
      if (buckets[w].length === 0) { active--; continue; }
      const worker = new Worker(new URL("./factory.worker.js", import.meta.url), { type: "module" });
      workers.push(worker);
      worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
        const msg = e.data;
        if (msg.type === "pair-done") {
          const done = msg as WorkerPairDone;
          allRefined.push(...done.refined);
          rejectedByDsr += done.rejectedByDsr || 0;
          rejectedByAnti += done.rejectedByAnti || 0;
          perPair.push({
            key: done.key,
            asset: done.assetLabel,
            tf: done.tfLabel,
            screened: done.screenedCount,
            refinedCount: done.refined.length,
            nTrials: done.nTrials,
            rejectedByDsr: done.rejectedByDsr || 0,
            rejectedByAnti: done.rejectedByAnti || 0,
          });
          pairsDone++;
          emit({ phase: "compute", label: `${done.assetLabel} ${done.tfLabel} terminé`, pct: (pairsDone / totalPairs) * 100, pairsDone, totalPairs });
        } else if (msg.type === "batch-done") {
          worker.terminate();
          active--;
          if (active === 0) resolve();
        } else if (msg.type === "pair-error") {
          pairsDone++;
        }
      };
      worker.onerror = () => { active--; if (active === 0) resolve(); };
      worker.postMessage({ pairs: buckets[w], topK, blockedIds });
    }
    if (active === 0) resolve();
  });

  emit({ phase: "portfolio", label: "Construction du portefeuille corrélé…", pct: 100 });
  allRefined.sort((a, b) => b.score - a.score);

  // meilleure variante par actif
  const bestByAsset: Record<string, FactoryVariant> = {};
  for (const v of allRefined) { if (!bestByAsset[v.asset] || v.score > bestByAsset[v.asset].score) bestByAsset[v.asset] = v; }

  const portfolio = buildPortfolio(allRefined, { maxN: 8, maxCorr: 0.5 });
  const stress = portfolio ? stressPortfolio(portfolio) : null;
  const space = coveredSpace(assets.length, tfs.length);

  return {
    leaderboard: allRefined.slice(0, 60),
    bestByAsset: Object.values(bestByAsset).sort((a, b) => b.score - a.score),
    portfolio, stress, perPair,
    stats: {
      nVariants: allRefined.length, nPairs: pairs.length, nWorkers,
      covered: space.total,
      evaluated: pairs.length * (700 + topK * 54),
      rejectedByDsr,
      rejectedByAnti,
      antiBlocked: blockedIds.length,
      // nTrials typique par paire (screening + grille) — celui utilisé pour déflater le Sharpe.
      nTrialsPerPair: allRefined[0]?.nTrials ?? (700 + 54),
      stressAllPass: stress ? stress.allPass : null,
      stressWorstDd: stress ? stress.worst.maxDD : null,
    },
  };
}
