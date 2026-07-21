// Métriques avancées PROTOS calculées à partir des trades + série de prix.
// MinTRL (Bailey & López de Prado), Beta vs Asset, Quality LZ, Kyle's lambda, Adverse Selection.

// Moments d'une série
function moments(x) {
  const n = x.length || 1;
  const mean = x.reduce((a, b) => a + b, 0) / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const v of x) { const d = v - mean; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
  m2 /= n; m3 /= n; m4 /= n;
  const sd = Math.sqrt(m2) || 1e-10;
  return { mean, sd, skew: m3 / sd ** 3, kurt: m4 / sd ** 4 };
}

// Sharpe non-annualisé des rendements par trade
function tradeSharpe(pnls) {
  const { mean, sd } = moments(pnls);
  return sd ? mean / sd : 0;
}

// Probabilistic Sharpe Ratio contre un benchmark SR* = 0
export function probabilisticSharpe(pnls, srStar = 0) {
  if (pnls.length < 3) return 0;
  const sr = tradeSharpe(pnls);
  const { skew, kurt } = moments(pnls);
  const n = pnls.length;
  const denom = Math.sqrt(1 - skew * sr + ((kurt - 1) / 4) * sr * sr) || 1e-10;
  const z = ((sr - srStar) * Math.sqrt(n - 1)) / denom;
  return normCdf(z);
}

// Minimum Track Record Length (Bailey & López de Prado 2012)
// Nombre de trades nécessaires pour que le SR soit statistiquement > srStar au seuil de confiance.
export function minTRL(pnls, srStar = 0, conf = 0.95) {
  if (pnls.length < 3) return { minTrl: NaN, sr: 0 };
  const sr = tradeSharpe(pnls);
  const { skew, kurt } = moments(pnls);
  if (sr <= srStar) return { minTrl: Infinity, sr };
  const zAlpha = invNormCdf(conf);
  const minTrl = 1 + (1 - skew * sr + ((kurt - 1) / 4) * sr * sr) * Math.pow(zAlpha / (sr - srStar), 2);
  return { minTrl, sr };
}

// Espérance du Sharpe MAXIMUM sous H0 (aucun skill) sur nTrials essais indépendants.
// López de Prado (2014), "The Deflated Sharpe Ratio". sigmaSR = dispersion des SR sous H0.
export function expectedMaxSharpe(nTrials, sigmaSR) {
  if (!(nTrials > 1) || !(sigmaSR > 0)) return 0;
  const gamma = 0.5772156649015329; // constante d'Euler-Mascheroni
  const z1 = invNormCdf(1 - 1 / nTrials);
  const z2 = invNormCdf(1 - 1 / (nTrials * Math.E));
  return sigmaSR * ((1 - gamma) * z1 + gamma * z2);
}

// Deflated Sharpe Ratio — probabilité que le Sharpe observé soit RÉEL après avoir testé
// nTrials configurations. C'est LE garde-fou anti-overfitting : un Sharpe élevé trouvé
// parmi des milliers d'essais est probablement de la chance. On déflate le seuil PSR par
// le Sharpe maximum attendu sous l'hypothèse nulle sur nTrials essais.
export function deflatedSharpe(pnls, nTrials = 1) {
  if (!pnls || pnls.length < 3) return { dsr: NaN, sr: 0, srStar: 0, sigmaSR: NaN, nTrials };
  const sr = tradeSharpe(pnls);
  const { skew, kurt } = moments(pnls);
  const T = pnls.length;
  // Écart-type d'échantillonnage du Sharpe (même noyau que la PSR), = dispersion des SR sous H0.
  const sigmaSR = Math.sqrt(Math.max(1e-12, (1 - skew * sr + ((kurt - 1) / 4) * sr * sr) / (T - 1)));
  const srStar = expectedMaxSharpe(nTrials, sigmaSR);
  return { dsr: probabilisticSharpe(pnls, srStar), sr, srStar, sigmaSR, nTrials };
}

// Beta de la stratégie contre le buy&hold de l'actif (régression des rendements)
export function betaVsAsset(equityCurve, bars, capital) {
  if (!equityCurve || equityCurve.length < 3 || !bars || bars.length < 3) return NaN;
  const stratRet = [];
  for (let i = 1; i < equityCurve.length; i++) stratRet.push((equityCurve[i] - equityCurve[i - 1]) / capital);
  const assetRet = [];
  const offset = bars.length - equityCurve.length;
  for (let i = 1; i < equityCurve.length; i++) {
    const bi = Math.max(1, offset + i);
    if (bi < bars.length) assetRet.push((bars[bi].c - bars[bi - 1].c) / bars[bi - 1].c);
    else assetRet.push(0);
  }
  const n = Math.min(stratRet.length, assetRet.length);
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += assetRet[i]; my += stratRet[i]; }
  mx /= n; my /= n;
  let cov = 0, varx = 0;
  for (let i = 0; i < n; i++) { cov += (assetRet[i] - mx) * (stratRet[i] - my); varx += (assetRet[i] - mx) ** 2; }
  return varx ? cov / varx : NaN;
}

// Quality LZ : complexité de Lempel-Ziv de la séquence binarisée gains/pertes,
// normalisée. Faible = trades très auto-corrélés (suspect), élevé = imprévisible/robuste.
export function qualityLZ(pnls) {
  if (pnls.length < 4) return 0;
  const s = pnls.map((p) => (p > 0 ? "1" : "0")).join("");
  let i = 0, c = 1, l = 1, k = 1, kMax = 1, n = s.length;
  while (true) {
    if (s[i + k - 1] === s[l + k - 1]) {
      k++;
      if (l + k > n) { c++; break; }
    } else {
      if (k > kMax) kMax = k;
      i++;
      if (i === l) { c++; l += kMax; if (l + 1 > n) break; i = 0; k = 1; kMax = 1; }
      else k = 1;
    }
  }
  const bn = n / Math.log2(n);
  return Math.min(1, c / bn);
}

// Kyle's lambda : impact prix par unité de volume (régression |ΔP| ~ volume)
export function kylesLambda(bars) {
  if (!bars || bars.length < 10) return NaN;
  const dp = [], vol = [];
  for (let i = 1; i < bars.length; i++) { dp.push(Math.abs(bars[i].c - bars[i - 1].c)); vol.push(bars[i].v); }
  const n = dp.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += vol[i]; my += dp[i]; }
  mx /= n; my /= n;
  let cov = 0, varx = 0;
  for (let i = 0; i < n; i++) { cov += (vol[i] - mx) * (dp[i] - my); varx += (vol[i] - mx) ** 2; }
  return varx ? (cov / varx) * 1e6 : NaN; // ×1e6 pour lisibilité
}

// Adverse Selection % : proportion de trades dont le prix bouge contre nous
// dans les N barres suivant l'entrée (mesure de mauvais timing d'entrée).
export function adverseSelection(trades, bars, lookahead = 5) {
  if (!trades || trades.length === 0 || !bars) return NaN;
  const byTime = new Map(bars.map((b, i) => [b.t, i]));
  let adverse = 0, counted = 0;
  for (const t of trades) {
    const idx = byTime.get(t.entryTime);
    if (idx === undefined || idx + lookahead >= bars.length) continue;
    const future = bars[idx + lookahead].c;
    const move = (future - t.entry) * t.side;
    if (move < 0) adverse++;
    counted++;
  }
  return counted ? (adverse / counted) * 100 : NaN;
}

// Regroupe toutes les métriques avancées
export function advancedMetrics(result, bars, capital) {
  const pnls = result.trades.map((t) => t.pnl);
  const { minTrl } = minTRL(pnls, 0, 0.95);
  return {
    minTrl,
    psr: probabilisticSharpe(pnls, 0),
    beta: betaVsAsset(result.equityCurve, bars, capital),
    qualityLZ: qualityLZ(pnls),
    kylesLambda: kylesLambda(bars),
    adverseSel: adverseSelection(result.trades, bars, 5),
  };
}

// --- utilitaires distribution normale ---
export function normCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
export function invNormCdf(p) {
  // Approximation de Acklam
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425, ph = 1 - pl;
  let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= ph) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
