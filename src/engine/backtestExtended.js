// Backtest étendu : ajoute Stop Loss / Take Profit / Break-Even paramétrables
// à la logique de runBacktest (qui ne gère que stop ATR + signal inverse).
// Utilisé par le pipeline d'optimisation (FAO, Quant Optimizer).
import { CONTRACTS } from "./contracts.js";

// params : { slAtr, tpAtr, beAtr, direction, contracts, capital }
//  slAtr : multiple d'ATR pour le stop (0 = pas de SL)
//  tpAtr : multiple d'ATR pour le take-profit (0 = pas de TP)
//  beAtr : profit en multiples d'ATR déclenchant le passage du stop à break-even (0 = off)
export function runBacktestExt(bars, ctx, strategyEval, params) {
  const { contract = "MES", contracts = 1, capital = 100000, direction = "both",
          slAtr = 2, tpAtr = 0, beAtr = 0 } = params || {};
  const spec = CONTRACTS[contract];
  const trades = [];
  let position = null;
  let equity = capital;
  const equityCurve = [equity];

  for (let i = 50; i < bars.length; i++) {
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
        const gross = (exitPrice - position.entry) * position.side * spec.pv * contracts;
        const cost = 2 * (spec.commission * contracts + spec.slippage * spec.tick * spec.pv * contracts);
        const net = gross - cost;
        equity += net;
        trades.push({ entry: position.entry, exit: exitPrice, side: position.side, bars: i - position.barIdx,
          pnl: net, entryTime: position.time, exitTime: bars[i].t, reason: exitReason });
        position = null;
      }
    }

    if (!position) {
      const openLong = signal.long && (direction === "both" || direction === "long");
      const openShort = signal.short && (direction === "both" || direction === "short");
      if ((openLong || openShort) && !isNaN(atr)) {
        const side = openLong ? 1 : -1;
        const stop = slAtr > 0 ? (side === 1 ? price - slAtr * atr : price + slAtr * atr) : NaN;
        const tp = tpAtr > 0 ? (side === 1 ? price + tpAtr * atr : price - tpAtr * atr) : NaN;
        position = { entry: price, side, stop, tp, barIdx: i, time: bars[i].t, entryAtr: atr, beActive: false };
      }
    }
    equityCurve.push(equity + (position ? (price - position.entry) * position.side * spec.pv * contracts : 0));
  }

  return computeMetrics(trades, equityCurve, capital, bars);
}

// Métriques de base réutilisées par tout le pipeline.
export function computeMetrics(trades, equityCurve, capital, bars) {
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
  const ann = Math.sqrt(252 * 78);
  const sharpe = stdRet ? (meanRet / stdRet) * ann : 0;
  const downside = Math.sqrt(returns.filter((r) => r < 0).reduce((s, r) => s + r * r, 0) / (returns.length || 1));
  const sortino = downside ? (meanRet / downside) * ann : 0;

  let maxDD = 0, peak = capital;
  equityCurve.forEach((e) => { if (e > peak) peak = e; const dd = (peak - e) / peak; if (dd > maxDD) maxDD = dd; });

  const totalPnLPct = (totalPnL / capital) * 100;
  const barsSpan = equityCurve.length || 1;
  const years = barsSpan / (252 * 78);
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
