// Forward-test « démo live » — PAPER TRADING sur données RÉELLES en temps quasi-réel.
// Exécute une stratégie sur les barres réelles jusqu'à l'instant présent et simule un compte démo.
// AUCUN ordre réel n'est passé, aucun identifiant broker n'est requis : c'est du paper trading.
// À chaque nouvelle bougie réelle (polling), l'app ré-évalue et met à jour l'équité de démo.
import { runBacktestExt } from "./backtestExtended.ts";

// startTs = timestamp (ms) du début de session → sépare l'historique du « live » depuis le démarrage.
export function evalForwardTest(
  bars: Parameters<typeof runBacktestExt>[0],
  ctx: Parameters<typeof runBacktestExt>[1],
  strat: { eval: Parameters<typeof runBacktestExt>[2] },
  params: Parameters<typeof runBacktestExt>[3],
  startTs: number,
) {
  const res = runBacktestExt(bars, ctx, strat.eval, params);
  const i = bars.length - 1;
  const sig = i > 50 && strat ? strat.eval(ctx, i) : { long: false, short: false };
  const liveState = sig.long ? "LONG" : sig.short ? "SHORT" : "FLAT";

  // Trades clôturés depuis le début de session (« paper trades » live).
  const sessionTrades = res.trades.filter((t) => t.exitTime >= startTs);
  const sessionPnL = sessionTrades.reduce((s, t) => s + t.pnl, 0);
  const sessionWins = sessionTrades.filter((t) => t.pnl > 0).length;

  return {
    res, liveState, sig,
    sessionTrades, sessionPnL, sessionWins,
    lastBar: bars[i], lastPrice: bars[i]?.c,
    nTrades: res.nTrades, equity: res.finalEquity,
  };
}
