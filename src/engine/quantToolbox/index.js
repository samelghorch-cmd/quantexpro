// Quant Toolbox — approximations JS pures (aucune lib ML externe).
// Chaque fonction est documentée comme heuristique / approximation, jamais présentée
// comme un modèle industriel.

// ---------- Drawdown Distribution ----------
export function drawdownDistribution(equityCurve) {
  if (!equityCurve || equityCurve.length < 2) return null;
  let peak = equityCurve[0];
  const dds = [];
  let inDD = false, ddStart = 0, recSum = 0, recCount = 0, curLen = 0, maxLen = 0;
  const ulcerSq = [];
  equityCurve.forEach((e, i) => {
    if (e > peak) { peak = e; if (inDD) { recSum += curLen; recCount++; inDD = false; curLen = 0; } }
    const dd = (peak - e) / peak;
    dds.push(dd);
    ulcerSq.push(dd * dd);
    if (dd > 1e-9) { if (!inDD) { inDD = true; ddStart = i; } curLen++; if (curLen > maxLen) maxLen = curLen; }
  });
  const maxDD = Math.max(...dds);
  const ulcer = Math.sqrt(ulcerSq.reduce((a, b) => a + b, 0) / ulcerSq.length) * 100;
  const totalRet = (equityCurve[equityCurve.length - 1] - equityCurve[0]) / equityCurve[0];
  const calmar = maxDD > 0 ? totalRet / maxDD : 0;
  const avgRecovery = recCount ? recSum / recCount : 0;
  // buckets d'histogramme des DD
  const buckets = Array(10).fill(0);
  dds.forEach((d) => { const b = Math.min(9, Math.floor(d * 10 / (maxDD || 1))); buckets[b]++; });
  return { maxDD: maxDD * 100, ulcer, calmar, avgRecoveryBars: avgRecovery, maxDDLenBars: maxLen, buckets, dds };
}

// ---------- Trade Clustering (autocorrélation de la séquence gains/pertes) ----------
export function tradeClustering(pnls) {
  if (pnls.length < 5) return null;
  const bin = pnls.map((p) => (p > 0 ? 1 : -1));
  const mean = bin.reduce((a, b) => a + b, 0) / bin.length;
  const acf = [];
  for (let lag = 1; lag <= Math.min(10, bin.length - 1); lag++) {
    let num = 0, den = 0;
    for (let i = 0; i < bin.length; i++) { den += (bin[i] - mean) ** 2; if (i + lag < bin.length) num += (bin[i] - mean) * (bin[i + lag] - mean); }
    acf.push(den ? num / den : 0);
  }
  // Test des runs
  let runs = 1;
  for (let i = 1; i < bin.length; i++) if (bin[i] !== bin[i - 1]) runs++;
  const nPos = bin.filter((b) => b > 0).length, nNeg = bin.length - nPos;
  const expRuns = nPos && nNeg ? (2 * nPos * nNeg) / bin.length + 1 : bin.length;
  const clusterScore = Math.max(0, Math.min(1, 1 - Math.abs(acf[0] || 0))); // faible autocorr = bon
  return { acf, runs, expectedRuns: expRuns, lag1: acf[0] || 0, clusterScore };
}

// ---------- VaR / CVaR multi-méthodes ----------
export function varCvar(pnls, alpha = 0.05) {
  if (pnls.length < 3) return null;
  const sorted = [...pnls].sort((a, b) => a - b);
  const k = Math.max(0, Math.floor(sorted.length * alpha));
  const histVar = sorted[k];
  const tail = sorted.slice(0, k + 1);
  const histCvar = tail.reduce((a, b) => a + b, 0) / tail.length;
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const sd = Math.sqrt(pnls.reduce((a, b) => a + (b - mean) ** 2, 0) / pnls.length);
  const z = 1.645; // alpha 5%
  const paramVar = mean - z * sd;
  // Cornish-Fisher (ajuste skew/kurt)
  let m3 = 0, m4 = 0;
  pnls.forEach((p) => { const d = p - mean; m3 += d ** 3; m4 += d ** 4; });
  m3 /= pnls.length; m4 /= pnls.length;
  const skew = m3 / sd ** 3, kurt = m4 / sd ** 4 - 3;
  const zcf = z + (z * z - 1) * skew / 6 + (z ** 3 - 3 * z) * kurt / 24 - (2 * z ** 3 - 5 * z) * skew ** 2 / 36;
  const cfVar = mean - zcf * sd;
  return { histVar, histCvar, paramVar, cfVar, skew, kurt };
}

// ---------- GARCH(1,1) approximé (vol conditionnelle) ----------
export function garchVol(returns) {
  if (returns.length < 20) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const varUnc = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  // paramètres typiques calibrés grossièrement par méthode des moments
  const omega = varUnc * 0.05, alpha = 0.1, beta = 0.85;
  const cond = [varUnc];
  for (let i = 1; i < returns.length; i++) {
    const prev = returns[i - 1] - mean;
    cond.push(omega + alpha * prev * prev + beta * cond[i - 1]);
  }
  const vol = cond.map((v) => Math.sqrt(v));
  return { vol, omega, alpha, beta, uncondVol: Math.sqrt(varUnc), persistence: alpha + beta };
}

// ---------- HMM 3 états (Baum-Welch réduit sur la volatilité) ----------
export function hmmRegimes(returns, nStates = 3, iters = 12) {
  if (returns.length < 30) return null;
  // Initialisation par quantiles de |return|
  const absr = returns.map(Math.abs);
  const sorted = [...absr].sort((a, b) => a - b);
  const means = [sorted[Math.floor(sorted.length * 0.2)], sorted[Math.floor(sorted.length * 0.5)], sorted[Math.floor(sorted.length * 0.85)]];
  let mu = means.slice(0, nStates);
  let sigma = mu.map((m) => (m || 0.001) * 0.5 + 1e-4);
  const N = returns.length;
  let gamma = Array.from({ length: N }, () => Array(nStates).fill(1 / nStates));
  const gauss = (x, m, s) => Math.exp(-((x - m) ** 2) / (2 * s * s)) / (Math.sqrt(2 * Math.PI) * s);
  for (let it = 0; it < iters; it++) {
    // E-step (approx : responsabilité locale, sans transition complète)
    for (let i = 0; i < N; i++) {
      const x = absr[i];
      let sum = 0;
      for (let k = 0; k < nStates; k++) { gamma[i][k] = gauss(x, mu[k], sigma[k]) + 1e-12; sum += gamma[i][k]; }
      for (let k = 0; k < nStates; k++) gamma[i][k] /= sum;
    }
    // M-step
    for (let k = 0; k < nStates; k++) {
      let wsum = 0, msum = 0;
      for (let i = 0; i < N; i++) { wsum += gamma[i][k]; msum += gamma[i][k] * absr[i]; }
      mu[k] = wsum ? msum / wsum : mu[k];
      let vsum = 0;
      for (let i = 0; i < N; i++) vsum += gamma[i][k] * (absr[i] - mu[k]) ** 2;
      sigma[k] = wsum ? Math.sqrt(vsum / wsum) + 1e-5 : sigma[k];
    }
  }
  const states = gamma.map((g) => g.indexOf(Math.max(...g)));
  // ordonne : 0=calme, 2=stress
  const order = mu.map((m, i) => [m, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const remap = {}; order.forEach((old, idx) => (remap[old] = idx));
  const labeled = states.map((s) => remap[s]);
  const counts = Array(nStates).fill(0); labeled.forEach((s) => counts[s]++);
  return { states: labeled, mu: order.map((i) => mu[i]), sigma: order.map((i) => sigma[i]), counts, labels: ["Calme", "Normal", "Stress"] };
}

// ---------- "XGBoost" heuristique : ensemble de stumps boostés (badge heuristique JS) ----------
// Prédit le signe du rendement futur à partir de features simples. Retourne l'accuracy in-sample.
export function boostedStumps(features, labels, nRounds = 30, lr = 0.3) {
  if (features.length < 20) return null;
  const n = features.length, d = features[0].length;
  let pred = Array(n).fill(0);
  const stumps = [];
  const sigmoid = (x) => 1 / (1 + Math.exp(-x));
  for (let r = 0; r < nRounds; r++) {
    // gradient résiduel (log-loss)
    const grad = pred.map((p, i) => sigmoid(p) - (labels[i] > 0 ? 1 : 0));
    // meilleur stump : feature + seuil qui réduit le plus le gradient
    let best = null;
    for (let f = 0; f < d; f++) {
      const vals = features.map((row) => row[f]).sort((a, b) => a - b);
      const thr = vals[Math.floor(vals.length / 2)];
      let left = 0, right = 0, ln = 0, rn = 0;
      for (let i = 0; i < n; i++) { if (features[i][f] <= thr) { left += grad[i]; ln++; } else { right += grad[i]; rn++; } }
      const lv = ln ? -left / ln : 0, rv = rn ? -right / rn : 0;
      const gain = Math.abs(left) + Math.abs(right);
      if (!best || gain > best.gain) best = { f, thr, lv, rv, gain };
    }
    if (!best) break;
    stumps.push(best);
    for (let i = 0; i < n; i++) pred[i] += lr * (features[i][best.f] <= best.thr ? best.lv : best.rv);
  }
  let correct = 0;
  for (let i = 0; i < n; i++) if ((pred[i] > 0 ? 1 : -1) === (labels[i] > 0 ? 1 : -1)) correct++;
  // importance des features
  const imp = Array(d).fill(0);
  stumps.forEach((s) => (imp[s.f] += s.gain));
  const impSum = imp.reduce((a, b) => a + b, 0) || 1;
  return { accuracy: (correct / n) * 100, nStumps: stumps.length, importance: imp.map((v) => v / impSum) };
}

// ---------- "Autoencoder" anomalies : PCA (power iteration) + erreur de reconstruction ----------
export function pcaAnomaly(data, k = 2) {
  if (data.length < 5) return null;
  const n = data.length, d = data[0].length;
  const mean = Array(d).fill(0);
  data.forEach((row) => row.forEach((v, j) => (mean[j] += v / n)));
  const centered = data.map((row) => row.map((v, j) => v - mean[j]));
  // covariance
  const cov = Array.from({ length: d }, () => Array(d).fill(0));
  centered.forEach((row) => { for (let a = 0; a < d; a++) for (let b = 0; b < d; b++) cov[a][b] += (row[a] * row[b]) / n; });
  // power iteration pour k composantes principales
  const comps = [];
  const covWork = cov.map((r) => r.slice());
  for (let c = 0; c < k; c++) {
    let v = Array(d).fill(0).map(() => Math.random());
    for (let it = 0; it < 50; it++) {
      const nv = Array(d).fill(0);
      for (let a = 0; a < d; a++) for (let b = 0; b < d; b++) nv[a] += covWork[a][b] * v[b];
      const norm = Math.sqrt(nv.reduce((s, x) => s + x * x, 0)) || 1e-9;
      v = nv.map((x) => x / norm);
    }
    comps.push(v);
    // deflation
    let lambda = 0;
    for (let a = 0; a < d; a++) for (let b = 0; b < d; b++) lambda += v[a] * covWork[a][b] * v[b];
    for (let a = 0; a < d; a++) for (let b = 0; b < d; b++) covWork[a][b] -= lambda * v[a] * v[b];
  }
  // erreur de reconstruction par point
  const errors = centered.map((row) => {
    const proj = comps.map((c) => c.reduce((s, cv, j) => s + cv * row[j], 0));
    const recon = Array(d).fill(0);
    comps.forEach((c, ci) => c.forEach((cv, j) => (recon[j] += proj[ci] * cv)));
    return Math.sqrt(row.reduce((s, v, j) => s + (v - recon[j]) ** 2, 0));
  });
  const meanErr = errors.reduce((a, b) => a + b, 0) / errors.length;
  const sdErr = Math.sqrt(errors.reduce((a, b) => a + (b - meanErr) ** 2, 0) / errors.length);
  const anomalies = errors.map((e, i) => ({ i, error: e, isAnomaly: e > meanErr + 2 * sdErr }));
  return { errors, anomalies: anomalies.filter((a) => a.isAnomaly), threshold: meanErr + 2 * sdErr, meanErr };
}
