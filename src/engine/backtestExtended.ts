// Backtest étendu : ajoute Stop Loss / Take Profit / Break-Even paramétrables
// à la logique de runBacktest (qui ne gère que stop ATR + signal inverse).
// Utilisé par le pipeline d'optimisation (FAO, Quant Optimizer).
import { resolveSpec, roundTripCost } from "./contracts.ts";
import { annualFactor, periodsPerYear, type BarTime } from "./annualize.ts";
import type { BacktestBar, BacktestContext, StrategyEvalFn } from "./backtest.ts";

// Paramètres du backtest étendu — tous optionnels (valeurs par défaut appliquées ci-dessous).
//  slAtr   : multiple d'ATR pour le stop (0 = pas de SL)
//  tpAtr   : multiple d'ATR pour le take-profit (0 = pas de TP)
//  beAtr   : profit en multiples d'ATR déclenchant le passage du stop à break-even (0 = off)
//  lotMode : "FIXED_LOTS" (défaut — qty = contracts) | "RISK_PERCENT" (qty dimensionnée
//            pour risquer riskPct % de l'ÉQUITÉ COURANTE jusqu'au stop ; nécessite slAtr > 0,
//            sinon repli documenté sur contracts). Quantité fractionnaire si spec.fractional.
//  warmup  : barres ignorées en début de série (défaut 50 — historique du moteur)
export interface BacktestExtParams {
  contract?: string;
  contracts?: number;
  capital?: number;
  direction?: "both" | "long" | "short";
  slAtr?: number;
  tpAtr?: number;
  beAtr?: number;
  lotMode?: "FIXED_LOTS" | "RISK_PERCENT";
  riskPct?: number;
  warmup?: number;
  // Toléré : champs additionnels passés par le pipeline (regime, etc.) — ignorés ici.
  [key: string]: unknown;
}

// Un trade fermé produit par le moteur étendu.
// side vaut ±1 au runtime ; typé number car `position` (init null) est un evolving-any
// dont les littéraux sont élargis à number par le contrôle de flux TS.
export interface BacktestTrade {
  entry: number;
  exit: number;
  side: number;
  bars: number;
  qty: number;
  pnl: number;
  entryTime: number;
  exitTime: number;
  reason: string;
}

export function runBacktestExt(
  bars: BacktestBar[],
  ctx: BacktestContext,
  strategyEval: StrategyEvalFn,
  params: BacktestExtParams = {},
) {
  const { contract = "MES", contracts = 1, capital = 100000, direction = "both",
          slAtr = 2, tpAtr = 0, beAtr = 0,
          lotMode = "FIXED_LOTS", riskPct = 1, warmup = 50 } = params;
  const spec = resolveSpec(contract);
  const trades: BacktestTrade[] = [];
  let position = null;
  let equity = capital;
  const equityCurve = [equity];

  // Quantité à l'ouverture : risque fixe en % de l'équité courante (compounding),
  // convertie en unités via la distance de stop. Jamais silencieux : qty 0 = pas de trade.
  const sizeFor = (atr: number) => {
    if (lotMode !== "RISK_PERCENT" || !(slAtr > 0) || !(atr > 0)) return contracts;
    const riskPerUnit = slAtr * atr * spec.pv;
    if (!(riskPerUnit > 0)) return contracts;
    const qty = (equity * riskPct / 100) / riskPerUnit;
    return spec.fractional ? qty : Math.floor(qty);
  };

  for (let i = warmup; i < bars.length; i++) {
    const signal = strategyEval(ctx, i);
    const price = bars[i].c;
    const atr = ctx.atr14[i];

    if (position) {
      let exit = false, exitReason = "", exitPrice = price;
      // Break-even : dès que le profit atteint beAtr*ATR, on remonte le stop à l'entrée
      if (beAtr > 0 && !position.beActive && !isNaN(position.entryAtr)) {
        const favor = (price - position.entry) * position.side;
        if (favor >= beAtr * position.entryAtr) {
          position.stop = position.entry;
          position.beActive = true;
        }
      }
      // Stop Loss
      if (slAtr > 0 && !isNaN(position.stop)) {
        if (position.side === 1 && bars[i].l <= position.stop) { exit = true; exitReason = position.beActive ? "BE" : "SL"; exitPrice = position.stop; }
        if (position.side === -1 && bars[i].h >= position.stop) { exit = true; exitReason = position.beActive ? "BE" : "SL"; exitPrice = position.stop; }
      }
      // Take Profit
      if (!exit && tpAtr > 0 && !isNaN(position.tp)) {
        if (position.side === 1 && bars[i].h >= position.tp) { exit = true; exitReason = "TP"; exitPrice = position.tp; }
        if (position.side === -1 && bars[i].l <= position.tp) { exit = true; exitReason = "TP"; exitPrice = position.tp; }
      }
      // Signal inverse
      if (!exit) {
        const reverse = (position.side === 1 && signal.short) || (position.side === -1 && signal.long);
        if (reverse) { exit = true; exitReason = "Signal inverse"; exitPrice = price; }
      }

      if (exit) {
        const gross = (exitPrice - position.entry) * position.side * spec.pv * position.qty;
        const cost = roundTripCost(spec, position.qty, position.entry, exitPrice);
        const net = gross - cost;
        equity += net;
        trades.push({ entry: position.entry, exit: exitPrice, side: position.side, bars: i - position.barIdx,
          qty: position.qty, pnl: net, entryTime: position.time, exitTime: bars[i].t, reason: exitReason });
        position = null;
      }
    }

    if (!position) {
      const openLong = signal.long && (direction === "both" || direction === "long");
      const openShort = signal.short && (direction === "both" || direction === "short");
      if ((openLong || openShort) && !isNaN(atr)) {
        const qty = sizeFor(atr);
        if (qty > 0) {
          const side = openLong ? 1 : -1;
          const stop = slAtr > 0 ? (side === 1 ? price - slAtr * atr : price + slAtr * atr) : NaN;
          const tp = tpAtr > 0 ? (side === 1 ? price + tpAtr * atr : price - tpAtr * atr) : NaN;
          position = { entry: price, side, stop, tp, qty, barIdx: i, time: bars[i].t, entryAtr: atr, beActive: false };
        }
      }
    }
    equityCurve.push(equity + (position ? (price - position.entry) * position.side * spec.pv * position.qty : 0));
  }

  return computeMetrics(trades, equityCurve, capital, bars);
}

// Métriques de base réutilisées par tout le pipeline.
// Générique sur le type de trade : seul `pnl` est requis, le type d'entrée est
// préservé dans le résultat (les appelants gardent leur shape de trade).
// bars n'est utilisé que pour cadencer l'annualisation (seul `.t` est lu), d'où le
// type large { t?: … } : accepte aussi bien BacktestBar[] que FactoryBar[] (t optionnel).
export function computeMetrics<T extends { pnl: number }>(
  trades: T[],
  equityCurve: number[],
  capital: number,
  bars: { t?: number | null }[],
) {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const totalPnL = trades.reduce((s, t) => s + t.pnl, 0);
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const profitFactor = grossLoss ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);

  const returns = [];
  for (let i = 1; i < equityCurve.length; i++) returns.push((equityCurve[i] - equityCurve[i - 1]) / capital);
  const meanRet = returns.reduce((s, r) => s + r, 0) / (returns.length || 1);
  const stdRet = Math.sqrt(returns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / (returns.length || 1));
  // Cast sûr : periodsPerYear/annualFactor tolèrent un `t` absent (repli 252 périodes/an).
  const ann = annualFactor(bars as BarTime[]);
  const sharpe = stdRet ? (meanRet / stdRet) * ann : 0;
  const downside = Math.sqrt(returns.filter((r) => r < 0).reduce((s, r) => s + r * r, 0) / (returns.length || 1));
  const sortino = downside ? (meanRet / downside) * ann : 0;

  let maxDD = 0, peak = capital;
  equityCurve.forEach((e) => { if (e > peak) peak = e; const dd = (peak - e) / peak; if (dd > maxDD) maxDD = dd; });

  const totalPnLPct = (totalPnL / capital) * 100;
  const barsSpan = equityCurve.length || 1;
  const years = barsSpan / periodsPerYear(bars as BarTime[]);
  const cagr = years > 0 ? (Math.pow((capital + totalPnL) / capital, 1 / Math.max(years, 1e-6)) - 1) * 100 : 0;
  const calmar = maxDD > 0 ? cagr / (maxDD * 100) : 0;

  // Expectancy en R (R = perte moyenne)
  const expectancyR = avgLoss ? ((winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss) / avgLoss : 0;
  const evTrade = trades.length ? totalPnL / trades.length : 0;

  // Kelly (fraction) : W - (1-W)/R
  const R = avgLoss ? avgWin / avgLoss : 0;
  const W = winRate / 100;
  const kelly = R > 0 ? W - (1 - W) / R : 0;
  const kellyHalf = Math.max(0, kelly / 2) * 100;

  return {
    trades, totalPnL, totalPnLPct, winRate, avgWin, avgLoss, profitFactor,
    sharpe, sortino, calmar, cagr, maxDD, equityCurve, finalEquity: capital + totalPnL,
    expectancyR, evTrade, kelly, kellyHalf, grossWin, grossLoss,
    nTrades: trades.length, nWins: wins.length, nLosses: losses.length,
  };
}
