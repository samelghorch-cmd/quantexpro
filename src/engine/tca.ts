// TCA — Transaction Cost Analysis (P1-TCA / P9-TS-TCA).
// Compare le slippage / coût d'exécution OBSERVÉ (fills démo, backtest next-open, saisie manuelle)
// au modèle théorique (`costModel.ts` / `contracts.ts`).
import { COST_MODELS, roundTripCost as modelRtFrac } from "./costModel.js";
import { resolveSpec, roundTripCost as absRtCost, REAL_ASSET_CLASS } from "./contracts.js";

const LS_KEY = "quantexpro:tcaFills:v1";
const hasLS = (): boolean => typeof localStorage !== "undefined";

/** Ratio observé/modèle au-delà duquel le modèle sous-estime les coûts. */
export const TCA_WORSE_RATIO = 1.3;
/** Ratio en dessous duquel l'exécution bat le modèle. */
export const TCA_BETTER_RATIO = 0.7;

export type TradeSide = 1 | -1;
export type TcaVerdict =
  | "INSUFFICIENT"
  | "BETTER_THAN_MODEL"
  | "WORSE_THAN_MODEL"
  | "CALIBRATED";

export interface CostModelLike {
  feePct?: number;
  spreadPct?: number;
  label?: string;
  [key: string]: unknown;
}

export interface ModelCostBps {
  classId: string;
  label: string;
  feePct: number;
  spreadPct: number;
  oneWayBps: number;
  roundTripBps: number;
  model: CostModelLike;
  assetKey?: string;
  price?: number;
  qty?: number;
  roundTripUsd?: number;
  oneWayUsd?: number;
}

export interface OhlcvBar {
  t?: number | null;
  o: number;
  h?: number;
  l?: number;
  c: number;
  v?: number;
}

export interface TradeLike {
  side?: number | string;
  entry?: number;
  exit?: number;
  entryTime?: number | null;
  exitTime?: number | null;
  notional?: number;
  ret?: number;
  pnl?: number;
}

export interface TcaFill {
  id?: string;
  side: TradeSide;
  signalPrice: number;
  fillPrice: number;
  exitSignal?: number | null;
  exitFill?: number | null;
  entrySlipBps: number;
  exitSlipBps?: number;
  roundTripSlipBps?: number;
  notional: number;
  isUsd: number;
  entryTime?: number | null;
  exitTime?: number | null;
  source?: string;
  exitSource?: string;
  assetKey?: string | null;
}

export interface TcaOpts {
  classId?: string;
  assetKey?: string;
  price?: number;
  notional?: number;
}

export interface TcaObserved {
  avgEntrySlipBps: number;
  medianEntrySlipBps: number;
  p95EntrySlipBps: number;
  avgRoundTripSlipBps: number;
  totalImplementationShortfallUsd: number;
  pctAdverse: number;
}

export interface TcaResult {
  n: number;
  model: ModelCostBps;
  observed: TcaObserved;
  ratio: number;
  verdict: TcaVerdict;
  calibration: { suggestedSpreadPct: number; note: string };
  fills: TcaFill[];
}

export function classIdForAsset(assetKey: string | null | undefined): string {
  return (assetKey && REAL_ASSET_CLASS[assetKey]) || "synthetic";
}

/** Coût modèle one-way / round-trip en bps (fraction × 10 000). */
export function modelCostBps(classId = "synthetic"): ModelCostBps {
  const models = COST_MODELS as Record<string, CostModelLike>;
  const m = models[classId] || models.synthetic;
  const oneWay = ((m.feePct || 0) + (m.spreadPct || 0)) * 1e4;
  return {
    classId: models[classId] ? classId : "synthetic",
    label: String(m.label || classId),
    feePct: m.feePct || 0,
    spreadPct: m.spreadPct || 0,
    oneWayBps: oneWay,
    roundTripBps: modelRtFrac(m) * 1e4,
    model: m,
  };
}

/**
 * Coût modèle pour une clé d'actif (futures tick ou réel %).
 * `price` sert à convertir les $ futures en bps de notionnel.
 */
export function modelCostForAsset(assetKey: string, price = 100, qty = 1): ModelCostBps {
  const cls = classIdForAsset(assetKey);
  const models = COST_MODELS as Record<string, CostModelLike>;
  const spec = resolveSpec(assetKey) as ReturnType<typeof resolveSpec> & { commission?: number };
  if (models[cls] && !spec.commission) {
    return { ...modelCostBps(cls), assetKey, price, qty };
  }
  const px = Number(price) || 100;
  const q = Number(qty) || 1;
  const rtUsd = absRtCost(spec, q, px, px);
  const notional = spec.pv != null && !spec.fractional
    ? Math.max(px * (spec.pv as number) * q, 1e-9)
    : Math.max(px * q, 1e-9);
  const rtBps = (rtUsd / notional) * 1e4;
  return {
    classId: (spec.class as string) || cls,
    label: (spec.name as string) || assetKey,
    assetKey,
    price: px,
    qty: q,
    feePct: 0,
    spreadPct: 0,
    oneWayBps: rtBps / 2,
    roundTripBps: rtBps,
    roundTripUsd: rtUsd,
    oneWayUsd: rtUsd / 2,
    model: spec as unknown as CostModelLike,
  };
}

/**
 * Slippage en bps (positif = adverse pour le trader).
 * side: +1 long, −1 short.
 */
export function slipBps(signalPrice: number, fillPrice: number, side: number = 1): number {
  const s = Number(signalPrice);
  const f = Number(fillPrice);
  const d = Number(side) || 1;
  if (!(s > 0) || !(f > 0)) return NaN;
  return ((f - s) / s) * d * 1e4;
}

export function slipUsd(
  signalPrice: number,
  fillPrice: number,
  side: number,
  notional: number,
): number {
  const bps = slipBps(signalPrice, fillPrice, side);
  if (!Number.isFinite(bps)) return NaN;
  return (bps / 1e4) * (Number(notional) || 0);
}

/**
 * Construit des fills d'entrée depuis des trades backtest/démo + barres OHLCV.
 * Signal = close de la barre d'entrée ; fill observé = open de la barre suivante (next-open).
 * Si pas de barre suivante → fill = signal (slip 0, source `same_bar`).
 */
export function fillsFromTrades(
  trades: TradeLike[] | null | undefined,
  bars: OhlcvBar[] | null | undefined,
  { notional = 100000 }: { notional?: number } = {},
): TcaFill[] {
  if (!Array.isArray(trades) || !Array.isArray(bars) || bars.length === 0) return [];
  const idxByT = new Map<number, number>();
  bars.forEach((b, i) => { if (b?.t != null) idxByT.set(b.t, i); });

  const out: TcaFill[] = [];
  for (const t of trades) {
    const side: TradeSide = t.side === -1 || t.side === "short" ? -1 : 1;
    const signal = Number(t.entry);
    if (!(signal > 0)) continue;
    let fill = signal;
    let source = "same_bar";
    const i = t.entryTime != null ? idxByT.get(t.entryTime) : undefined;
    if (i != null && i + 1 < bars.length && bars[i + 1].o > 0) {
      fill = bars[i + 1].o;
      source = "next_open";
    }
    const notion = Number.isFinite(t.notional as number) ? (t.notional as number)
      : (Number.isFinite(t.ret as number) && t.ret !== 0 && Number.isFinite(t.pnl as number)
        ? Math.abs((t.pnl as number) / (t.ret as number))
        : notional);
    const entryBps = slipBps(signal, fill, side);

    // Exit : signal = prix théorique enregistré ; fill ≈ close de la barre de sortie (proxy).
    const exitSignal = Number(t.exit);
    let exitFill = exitSignal;
    let exitSource = "same_bar";
    const j = t.exitTime != null ? idxByT.get(t.exitTime) : undefined;
    if (j != null && bars[j]?.c > 0) {
      exitFill = bars[j].c;
      exitSource = "exit_close";
    }
    const exitBps = Number.isFinite(exitSignal) && exitSignal > 0
      ? slipBps(exitSignal, exitFill, -side) // sortie = sens inverse
      : NaN;

    out.push({
      side,
      signalPrice: signal,
      fillPrice: fill,
      exitSignal: Number.isFinite(exitSignal) ? exitSignal : null,
      exitFill: Number.isFinite(exitFill) ? exitFill : null,
      entrySlipBps: entryBps,
      exitSlipBps: exitBps,
      roundTripSlipBps: Number.isFinite(entryBps) && Number.isFinite(exitBps) ? entryBps + exitBps : entryBps,
      notional: notion,
      isUsd: slipUsd(signal, fill, side, notion),
      entryTime: t.entryTime ?? null,
      exitTime: t.exitTime ?? null,
      source,
      exitSource,
    });
  }
  return out;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[i];
}

function mean(arr: number[]): number {
  if (!arr.length) return NaN;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Analyse TCA agrégée. */
export function runTCA(
  fills: Partial<TcaFill>[] | null | undefined,
  opts: TcaOpts = {},
): TcaResult {
  const list: TcaFill[] = (fills || []).map((f) => {
    if (Number.isFinite(f.entrySlipBps as number)) return f as TcaFill;
    const rawSide = f.side as number | string | undefined;
    const side: TradeSide = rawSide === -1 || rawSide === "short" ? -1 : 1;
    const entrySlipBps = slipBps(f.signalPrice as number, f.fillPrice as number, side);
    return {
      ...f,
      side,
      signalPrice: Number(f.signalPrice),
      fillPrice: Number(f.fillPrice),
      notional: Number(f.notional) || opts.notional || 100000,
      entrySlipBps,
      isUsd: slipUsd(
        f.signalPrice as number,
        f.fillPrice as number,
        side,
        f.notional || opts.notional || 100000,
      ),
    } as TcaFill;
  }).filter((f) => Number.isFinite(f.entrySlipBps));

  const classId = opts.classId || (opts.assetKey ? classIdForAsset(opts.assetKey) : "synthetic");
  const model = opts.assetKey
    ? modelCostForAsset(opts.assetKey, opts.price ?? list[0]?.signalPrice ?? 100)
    : modelCostBps(classId);

  const entrySlips = list.map((f) => f.entrySlipBps).sort((a, b) => a - b);
  const rtSlips = list.map((f) => (Number.isFinite(f.roundTripSlipBps as number) ? (f.roundTripSlipBps as number) : f.entrySlipBps * 2));
  const avgEntry = mean(entrySlips);
  const avgRt = mean(rtSlips);
  const totalIs = list.reduce((s, f) => s + (Number.isFinite(f.isUsd) ? f.isUsd : 0), 0);

  const ratio = model.oneWayBps > 1e-9 && Number.isFinite(avgEntry)
    ? avgEntry / model.oneWayBps
    : NaN;

  let verdict: TcaVerdict = "INSUFFICIENT";
  if (list.length === 0) verdict = "INSUFFICIENT";
  else if (!Number.isFinite(ratio)) verdict = "INSUFFICIENT";
  else if (ratio < TCA_BETTER_RATIO) verdict = "BETTER_THAN_MODEL";
  else if (ratio > TCA_WORSE_RATIO) verdict = "WORSE_THAN_MODEL";
  else verdict = "CALIBRATED";

  const baseSpread = model.spreadPct ?? (model.model?.spreadPct as number) ?? 0;
  const suggestedSpreadPct = Number.isFinite(ratio) ? Math.max(0, baseSpread * Math.max(ratio, 0)) : baseSpread;

  return {
    n: list.length,
    model,
    observed: {
      avgEntrySlipBps: avgEntry,
      medianEntrySlipBps: percentile(entrySlips, 0.5),
      p95EntrySlipBps: percentile(entrySlips, 0.95),
      avgRoundTripSlipBps: avgRt,
      totalImplementationShortfallUsd: totalIs,
      pctAdverse: entrySlips.length ? entrySlips.filter((x) => x > 0).length / entrySlips.length : NaN,
    },
    ratio,
    verdict,
    calibration: {
      suggestedSpreadPct,
      note: verdict === "WORSE_THAN_MODEL"
        ? "Le modèle sous-estime les coûts — augmenter spreadPct / slippage."
        : verdict === "BETTER_THAN_MODEL"
          ? "Exécution meilleure que le modèle — modèle conservateur OK."
          : verdict === "CALIBRATED"
            ? "Observé aligné sur le modèle (±30 %)."
            : "Pas assez de fills pour calibrer.",
    },
    fills: list,
  };
}

// ---- Persist fills manuels / passerelle démo ----
export function loadTcaFills(): TcaFill[] {
  if (!hasLS()) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || "[]") as unknown;
    return Array.isArray(raw) ? (raw as TcaFill[]) : [];
  } catch {
    return [];
  }
}

export function saveTcaFills(fills: TcaFill[] | null | undefined): TcaFill[] | null | undefined {
  if (hasLS()) localStorage.setItem(LS_KEY, JSON.stringify(fills || []));
  return fills;
}

export function addTcaFill(fill: {
  id?: string;
  side?: number | string;
  signalPrice?: number;
  fillPrice?: number;
  notional?: number;
  entryTime?: number | null;
  source?: string;
  assetKey?: string | null;
}): TcaFill {
  const side: TradeSide = fill.side === -1 || fill.side === "short" ? -1 : 1;
  const entry: TcaFill = {
    id: fill.id || `tca-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    side,
    signalPrice: Number(fill.signalPrice),
    fillPrice: Number(fill.fillPrice),
    notional: Number(fill.notional) || 100000,
    entryTime: fill.entryTime || Date.now(),
    source: fill.source || "manual",
    assetKey: fill.assetKey || null,
    entrySlipBps: NaN,
    isUsd: NaN,
  };
  entry.entrySlipBps = slipBps(entry.signalPrice, entry.fillPrice, side);
  entry.isUsd = slipUsd(entry.signalPrice, entry.fillPrice, side, entry.notional);
  const next = [...loadTcaFills(), entry];
  saveTcaFills(next);
  return entry;
}

export function clearTcaFills(): TcaFill[] {
  saveTcaFills([]);
  return [];
}
