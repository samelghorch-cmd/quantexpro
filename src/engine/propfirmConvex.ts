// @ts-nocheck — migration bulk P10-TS-ENGINE; typage strict à reprendre fichier par fichier.
// Propfirm Convex — Monte-Carlo d'un challenge type prop firm (FTMO 100K).
// Resampling bloc des PnL journaliers issus des trades, N chemins jour par jour.
import { seededRandom } from "./random.ts";

// Agrège les trades en PnL journaliers (par jour UTC).
export function tradesToDailyPnL(trades) {
  const byDay = new Map();
  for (const t of trades) {
    const day = Math.floor(t.exitTime / 86400000);
    byDay.set(day, (byDay.get(day) || 0) + t.pnl);
  }
  return [...byDay.values()];
}

// challenge : { target, maxDailyLoss, maxTotalLoss, maxDays, accountSize }
export function runPropfirmConvex(dailyPnL, challenge = {}, options = {}) {
  const {
    accountSize = 100000, target = 0.10, maxDailyLoss = 0.05, maxTotalLoss = 0.10, maxDays = 30,
  } = challenge;
  const { nPaths = 5000, seed = 2024, riskScales = [0.5, 1, 1.5, 2] } = options;

  if (!dailyPnL || dailyPnL.length < 3) return null;

  const targetAbs = accountSize * target;
  const dailyLossAbs = accountSize * maxDailyLoss;
  const totalLossAbs = accountSize * maxTotalLoss;

  const simulateScale = (scale, rnd) => {
    let pass = 0, fail = 0;
    const daysToPass = [];
    const maxDDs = [];
    for (let p = 0; p < nPaths; p++) {
      let equity = accountSize, peak = accountSize, maxDD = 0;
      let passed = false, failed = false, day = 0;
      while (day < maxDays && !passed && !failed) {
        const pnl = dailyPnL[Math.floor(rnd() * dailyPnL.length)] * scale;
        // règle daily loss (sur le pnl du jour)
        if (pnl <= -dailyLossAbs) { failed = true; }
        equity += pnl;
        if (equity > peak) peak = equity;
        const dd = (peak - equity) / accountSize;
        if (dd > maxDD) maxDD = dd;
        if (equity <= accountSize - totalLossAbs) failed = true;
        if (equity >= accountSize + targetAbs) { passed = true; daysToPass.push(day + 1); }
        day++;
      }
      maxDDs.push(maxDD);
      if (passed) pass++; else fail++;
    }
    const passRate = (pass / nPaths) * 100;
    daysToPass.sort((a, b) => a - b);
    maxDDs.sort((a, b) => a - b);
    const pct = (arr, q) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * q))] : NaN);
    return {
      scale, passRate,
      timeP50: pct(daysToPass, 0.5), timeP90: pct(daysToPass, 0.9),
      ddP95: pct(maxDDs, 0.95) * 100,
    };
  };

  const rnd = seededRandom(seed);
  const scaleResults = riskScales.map((s) => simulateScale(s, rnd));
  const base = scaleResults.find((r) => r.scale === 1) || scaleResults[0];

  // Coût pour passer : espérance géométrique du nombre de tentatives (loi géométrique)
  const p = base.passRate / 100;
  const feePerAttempt = options.feePerAttempt ?? 540; // frais type challenge 100K
  const expectedAttempts = p > 0 ? 1 / p : Infinity;
  const costToPass = Number.isFinite(expectedAttempts) ? expectedAttempts * feePerAttempt : Infinity;
  // Budget P90 : nb de tentatives couvrant 90% des cas = ceil(ln(0.1)/ln(1-p))
  const attemptsP90 = p > 0 && p < 1 ? Math.ceil(Math.log(0.1) / Math.log(1 - p)) : (p >= 1 ? 1 : Infinity);
  const budgetP90 = Number.isFinite(attemptsP90) ? attemptsP90 * feePerAttempt : Infinity;

  return {
    accountSize, target, maxDailyLoss, maxTotalLoss, maxDays, nPaths, feePerAttempt,
    passRate: base.passRate, timeP50: base.timeP50, timeP90: base.timeP90, ddP95: base.ddP95,
    expectedAttempts, costToPass, attemptsP90, budgetP90,
    scaleResults,
  };
}
