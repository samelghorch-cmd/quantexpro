// Modèle de coûts par classe d'actif + backtest cross-actif en pourcentage (net de spread + commissions).
// Permet de comparer équitablement des stratégies sur crypto / forex / indices / actions / métaux / énergie.
// P9-TS-COST
import { computeMetrics } from "./backtestExtended.js";

export type CostClassId =
  | "crypto"
  | "forex"
  | "indices"
  | "stocks"
  | "metals"
  | "energy"
  | "synthetic";

export interface CostModel {
  feePct: number;
  spreadPct: number;
  label: string;
}

export interface FactoryBar {
  t?: number | null;
  o?: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface FactorySignal {
  long?: boolean;
  short?: boolean;
}

export type FactoryEvalFn = (ctx: FactoryCtx, i: number) => FactorySignal;

export interface FactoryCtx {
  atr14: number[];
  [key: string]: unknown;
}

export interface FactoryParams {
  slAtr?: number;
  tpAtr?: number;
  beAtr?: number;
  direction?: "both" | "long" | "short" | string;
}

export interface FactoryWindow {
  start?: number;
  end?: number;
}

export interface FactoryTrade {
  entry: number;
  exit: number;
  side: 1 | -1;
  bars: number;
  pnl: number;
  ret: number;
  entryTime: number | null | undefined;
  exitTime: number | null | undefined;
  reason: string;
}

export interface FactoryMetrics {
  nTrades: number;
  winRate?: number;
  profitFactor?: number;
  sharpe?: number;
  sortino?: number;
  calmar?: number;
  maxDD?: number;
  totalPnL?: number;
  totalPnLPct?: number;
  expectancyR?: number;
  [key: string]: unknown;
}

interface OpenPosition {
  entry: number;
  side: 1 | -1;
  stop: number;
  tp: number;
  barIdx: number;
  time: number | null | undefined;
  entryAtr: number;
  beActive: boolean;
}

// Coûts aller-retour approximés, réalistes pour un compte réel / prop firm.
// feePct = commission par côté (fraction du notionnel) · spreadPct = demi-spread par côté.
export const COST_MODELS: Record<CostClassId, CostModel> = {
  crypto:  { feePct: 0.00040, spreadPct: 0.00020, label: "Crypto (0.04% + spread)" },
  forex:   { feePct: 0.00002, spreadPct: 0.00005, label: "Forex (~0.5-1 pip)" },
  indices: { feePct: 0.00005, spreadPct: 0.00010, label: "Indices (spread + comm.)" },
  stocks:  { feePct: 0.00010, spreadPct: 0.00010, label: "Actions (~2 bps)" },
  metals:  { feePct: 0.00005, spreadPct: 0.00015, label: "Métaux (spread futures)" },
  energy:  { feePct: 0.00005, spreadPct: 0.00020, label: "Énergie (spread futures)" },
  synthetic: { feePct: 0.00005, spreadPct: 0.00010, label: "Synthétique" },
};

export function roundTripCost(model: Partial<CostModel> | null | undefined): number {
  return 2 * ((model?.feePct || 0) + (model?.spreadPct || 0));
}

// Backtest en % du notionnel, net de coûts. params : { slAtr, tpAtr, beAtr, direction }.
// window = { start, end } restreint le backtest à une fenêtre (pour le train/test out-of-sample).
// Le contexte (indicateurs) est calculé sur toute la série → indicateurs déjà « chauds » au début de la fenêtre.
export function runFactoryBacktest(
  bars: FactoryBar[],
  ctx: FactoryCtx,
  evalFn: FactoryEvalFn,
  params: FactoryParams | null | undefined,
  costModel: Partial<CostModel> | null | undefined,
  notional = 100000,
  window?: FactoryWindow | null,
): FactoryMetrics {
  const { slAtr = 2, tpAtr = 0, beAtr = 0, direction = "both" } = params || {};
  const start = Math.max(50, window?.start ?? 50);
  const end = Math.min(bars.length, window?.end ?? bars.length);
  const rt = roundTripCost(costModel);
  const trades: FactoryTrade[] = [];
  let position: OpenPosition | null = null;
  let equity = notional;
  const equityCurve = [equity];

  for (let i = start; i < end; i++) {
    const signal = evalFn(ctx, i);
    const price = bars[i].c;
    const atr = ctx.atr14[i];

    if (position) {
      let exit = false;
      let exitReason = "";
      let exitPrice = price;
      if (beAtr > 0 && !position.beActive && !isNaN(position.entryAtr)) {
        const favor = (price - position.entry) * position.side;
        if (favor >= beAtr * position.entryAtr) { position.stop = position.entry; position.beActive = true; }
      }
      if (slAtr > 0 && !isNaN(position.stop)) {
        if (position.side === 1 && bars[i].l <= position.stop) { exit = true; exitReason = position.beActive ? "BE" : "SL"; exitPrice = position.stop; }
        if (position.side === -1 && bars[i].h >= position.stop) { exit = true; exitReason = position.beActive ? "BE" : "SL"; exitPrice = position.stop; }
      }
      if (!exit && tpAtr > 0 && !isNaN(position.tp)) {
        if (position.side === 1 && bars[i].h >= position.tp) { exit = true; exitReason = "TP"; exitPrice = position.tp; }
        if (position.side === -1 && bars[i].l <= position.tp) { exit = true; exitReason = "TP"; exitPrice = position.tp; }
      }
      if (!exit) {
        const reverse = (position.side === 1 && signal.short) || (position.side === -1 && signal.long);
        if (reverse) { exit = true; exitReason = "Signal inverse"; exitPrice = price; }
      }
      if (exit) {
        const ret = ((exitPrice - position.entry) / position.entry) * position.side;
        const pnl = notional * (ret - rt); // coût aller-retour déduit
        equity += pnl;
        trades.push({
          entry: position.entry, exit: exitPrice, side: position.side, bars: i - position.barIdx,
          pnl, ret, entryTime: position.time, exitTime: bars[i].t, reason: exitReason,
        });
        position = null;
      }
    }

    if (!position && !isNaN(atr) && atr > 0) {
      const openLong = signal.long && (direction === "both" || direction === "long");
      const openShort = signal.short && (direction === "both" || direction === "short");
      if (openLong || openShort) {
        const side: 1 | -1 = openLong ? 1 : -1;
        const stop = slAtr > 0 ? (side === 1 ? price - slAtr * atr : price + slAtr * atr) : NaN;
        const tp = tpAtr > 0 ? (side === 1 ? price + tpAtr * atr : price - tpAtr * atr) : NaN;
        position = { entry: price, side, stop, tp, barIdx: i, time: bars[i].t, entryAtr: atr, beActive: false };
      }
    }
    equityCurve.push(equity + (position ? notional * ((price - position.entry) / position.entry * position.side) : 0));
  }

  // clôture forcée de la position ouverte en fin de fenêtre (réalise le trade pour un OOS propre)
  if (position && end > start) {
    const last = bars[end - 1].c;
    const ret = ((last - position.entry) / position.entry) * position.side;
    const pnl = notional * (ret - rt);
    equity += pnl;
    trades.push({
      entry: position.entry, exit: last, side: position.side, bars: end - 1 - position.barIdx,
      pnl, ret, entryTime: position.time, exitTime: bars[end - 1].t, reason: "Fin fenêtre",
    });
  }

  return computeMetrics(trades, equityCurve, notional, bars) as FactoryMetrics;
}

// Score composite 0-100 pour classer les variantes (net de coûts).
// minTrades plus bas pour l'out-of-sample (fenêtre test plus courte → moins de trades).
export function factoryScore(m: FactoryMetrics | null | undefined, minTrades = 10): number {
  if (!m || m.nTrades < minTrades) return -1;
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const sharpe = clamp((m.sharpe || 0) / 3);
  const pf = clamp((Number.isFinite(m.profitFactor) ? (m.profitFactor as number) : 3) / 3);
  const exp = clamp(Math.max(0, m.expectancyR || 0));
  const dd = clamp(1 - (m.maxDD || 0) / 0.4);
  const consistency = clamp(m.nTrades / 60); // évite les stratégies à 10 trades chanceux
  return (0.32 * sharpe + 0.24 * pf + 0.18 * exp + 0.16 * dd + 0.10 * consistency) * 100;
}

// Sous-ensemble de métriques transportable entre worker et main.
export function pickMetrics(m: FactoryMetrics): Record<string, number> {
  return {
    nTrades: m.nTrades,
    winRate: m.winRate as number,
    profitFactor: Number.isFinite(m.profitFactor) ? (m.profitFactor as number) : 999,
    sharpe: m.sharpe as number,
    sortino: m.sortino as number,
    calmar: m.calmar as number,
    maxDD: m.maxDD as number,
    totalPnL: m.totalPnL as number,
    totalPnLPct: m.totalPnLPct as number,
    expectancyR: m.expectancyR as number,
  };
}
