// Extrait de v4core.js — moteur de backtest (PnL réaliste) + batch.
import { CONTRACTS } from "./contracts.js";
import { annualFactor } from "./annualize.js";

export function runBacktest(bars, ctx, strategyEval, options) {
  const { contract, contracts, useAtrStop, atrMult, direction, capital } = options;
  const spec = CONTRACTS[contract];
  const trades = [];
  let position = null;
  let equity = capital;
  const equityCurve = [equity];

  for (let i = 50; i < bars.length; i++) {
    const signal = strategyEval(ctx, i);
    const price = bars[i].c;
    const atr = ctx.atr14[i];

    // Gestion sortie
    if (position) {
      let exit = false;
      let exitReason = "";
      let exitPrice = price;
      if (useAtrStop && !isNaN(atr)) {
        if (position.side === 1 && bars[i].l <= position.stop) { exit = true; exitReason = "SL"; exitPrice = position.stop; }
        if (position.side === -1 && bars[i].h >= position.stop) { exit = true; exitReason = "SL"; exitPrice = position.stop; }
      }
      const reverseSignal = (position.side === 1 && signal.short) || (position.side === -1 && signal.long);
      if (reverseSignal) { exit = true; exitReason = "Signal inverse"; }

      if (exit) {
        const gross = (exitPrice - position.entry) * position.side * spec.pv * contracts;
        const cost = 2 * (spec.commission * contracts + spec.slippage * spec.tick * spec.pv * contracts);
        const net = gross - cost;
        equity += net;
        trades.push({
          entry: position.entry, exit: exitPrice, side: position.side,
          bars: i - position.barIdx, pnl: net, entryTime: position.time, exitTime: bars[i].t, reason: exitReason,
        });
        position = null;
      }
    }

    // Ouverture
    if (!position) {
      const openLong = signal.long && (direction === "both" || direction === "long");
      const openShort = signal.short && (direction === "both" || direction === "short");
      if (openLong || openShort) {
        const side = openLong ? 1 : -1;
        const stop = useAtrStop && !isNaN(atr) ? (side === 1 ? price - atrMult * atr : price + atrMult * atr) : NaN;
        position = { entry: price, side, stop, barIdx: i, time: bars[i].t };
      }
    }
    equityCurve.push(equity + (position ? (price - position.entry) * position.side * spec.pv * contracts : 0));
  }

  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const totalPnL = trades.reduce((s, t) => s + t.pnl, 0);
  const winRate = trades.length ? wins.length / trades.length * 100 : 0;
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
  const profitFactor = avgLoss ? (wins.reduce((s, t) => s + t.pnl, 0)) / Math.abs(losses.reduce((s, t) => s + t.pnl, 0) || 1e-10) : 0;
  const returns = [];
  for (let i = 1; i < equityCurve.length; i++) returns.push((equityCurve[i] - equityCurve[i - 1]) / capital);
  const meanRet = returns.reduce((s, r) => s + r, 0) / (returns.length || 1);
  const stdRet = Math.sqrt(returns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / (returns.length || 1));
  const sharpe = stdRet ? (meanRet / stdRet) * annualFactor(bars) : 0;
  let maxDD = 0, peak = capital;
  equityCurve.forEach(e => { if (e > peak) peak = e; const dd = (peak - e) / peak; if (dd > maxDD) maxDD = dd; });
  return { trades, totalPnL, winRate, avgWin, avgLoss, profitFactor, sharpe, maxDD, equityCurve, finalEquity: equity };
}

export function runBatchBacktest(bars, ctx, library, options, onProgress) {
  const results = [];
  for (let k = 0; k < library.length; k++) {
    const s = library[k];
    try {
      const bt = runBacktest(bars, ctx, s.eval, options);
      results.push({
        id: s.id, name: s.name, cat: s.cat,
        trades: bt.trades.length, pnl: bt.totalPnL, winRate: bt.winRate,
        pf: bt.profitFactor, sharpe: bt.sharpe, maxDD: bt.maxDD,
        avgWin: bt.avgWin, avgLoss: bt.avgLoss,
      });
    } catch (e) { /* skip */ }
    if (onProgress && k % 25 === 0) onProgress(k + 1, library.length);
  }
  if (onProgress) onProgress(library.length, library.length);
  return results;
}
