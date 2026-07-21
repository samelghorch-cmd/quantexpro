// Extrait de v4core.js — walk-forward IS/OOS glissant.
import { buildContext } from "./context.js";
import { runBacktest } from "./backtest.js";

export function walkForward(bars, ctx, evalFn, options, nWindows = 5, isRatio = 0.7) {
  const windows = [];
  const win = Math.floor(bars.length / nWindows);
  for (let w = 0; w < nWindows; w++) {
    const start = w * win;
    const isEnd = start + Math.floor(win * isRatio);
    const oosEnd = start + win;
    const isBars = bars.slice(start, isEnd);
    const oosBars = bars.slice(isEnd, oosEnd);
    const isCtx = buildContext(isBars);
    const oosCtx = buildContext(oosBars);
    const isBt = runBacktest(isBars, isCtx, evalFn, options);
    const oosBt = runBacktest(oosBars, oosCtx, evalFn, options);
    windows.push({
      window: w + 1,
      isRange: [start, isEnd], oosRange: [isEnd, oosEnd],
      is: { pnl: isBt.totalPnL, trades: isBt.trades.length, wr: isBt.winRate, pf: isBt.profitFactor, sharpe: isBt.sharpe },
      oos: { pnl: oosBt.totalPnL, trades: oosBt.trades.length, wr: oosBt.winRate, pf: oosBt.profitFactor, sharpe: oosBt.sharpe },
    });
  }
  return windows;
}
