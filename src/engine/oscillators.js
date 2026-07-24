// P4-OSC — oscillateurs multi-courbes Z-Score / Hurst / régimes (Module 1).
// Séries causales pour overlay chart — pas de look-ahead.
import { hmmRegimes, HMM_REGIME_LABELS } from "./quantToolbox/index.js";

/**
 * Z-Score roulant causal (fenêtre ``win`` close).
 * @param {number[]} series
 * @param {number} [win=20]
 * @returns {(number|null)[]}
 */
export function rollingZScore(series, win = 20) {
  const out = Array(series.length).fill(null);
  if (!(win > 1) || !series?.length) return out;
  for (let i = win - 1; i < series.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = i - win + 1; j <= i; j++) {
      if (Number.isFinite(series[j])) {
        sum += series[j];
        n++;
      }
    }
    if (n < win * 0.8) continue;
    const mean = sum / n;
    let vsum = 0;
    for (let j = i - win + 1; j <= i; j++) {
      if (Number.isFinite(series[j])) vsum += (series[j] - mean) ** 2;
    }
    const sd = Math.sqrt(vsum / n) || 1e-12;
    out[i] = (series[i] - mean) / sd;
  }
  return out;
}

/**
 * Remap Hurst autour de 0 pour co-affichage avec Z-Score : (H − 0.5) × scale.
 * H=0.5 → 0 · H=0.75 → +1 (scale=4).
 */
export function scaleHurstForOverlay(hurstSeries, scale = 4) {
  return (hurstSeries || []).map((h) =>
    Number.isFinite(h) ? (h - 0.5) * scale : null,
  );
}

/**
 * Bundle oscillateurs marché pour Statistical Edge / Analyse.
 * @param {Array<{c:number}>} bars
 * @param {object} ctx — buildContext
 * @param {{ zWin?: number }} [opts]
 */
export function buildMarketOscillators(bars, ctx, opts = {}) {
  const zWin = opts.zWin ?? 20;
  const close = (bars || []).map((b) => b.c);
  const returns = [];
  for (let i = 1; i < close.length; i++) {
    const prev = close[i - 1];
    returns.push(prev > 0 ? Math.log(close[i] / prev) : 0);
  }

  const zScore = ctx?.z?.[zWin] || rollingZScore(close, zWin);
  // Align zScore length to bars (ctx series usually same length as bars)
  const hurst = ctx?.hurst100 || [];
  const hurstOverlay = scaleHurstForOverlay(hurst, 4);

  const hmm = returns.length >= 40 ? hmmRegimes(returns) : null;
  // Régime aligné sur barres (returns[i] ↔ bars[i+1])
  const regime = Array(close.length).fill(null);
  if (hmm?.states) {
    for (let i = 0; i < hmm.states.length; i++) {
      regime[i + 1] = hmm.states[i];
    }
    if (regime[0] == null) regime[0] = hmm.states[0];
  }

  const lastZ = lastFinite(zScore);
  const lastH = lastFinite(hurst);
  const lastR = hmm?.current ?? lastFinite(regime);

  return {
    zScore,
    hurst,
    hurstOverlay,
    regime,
    regimeLabels: hmm?.labels || HMM_REGIME_LABELS.slice(),
    current: {
      zScore: lastZ,
      hurst: lastH,
      regime: lastR,
      regimeLabel:
        lastR != null && hmm?.labels?.[lastR] != null
          ? hmm.labels[lastR]
          : lastR != null
            ? HMM_REGIME_LABELS[lastR]
            : null,
    },
    meta: { zWin, hurstLen: 100, n: close.length, heuristicRegime: Boolean(hmm?.heuristic) },
  };
}

function lastFinite(arr) {
  if (!arr?.length) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (Number.isFinite(arr[i])) return arr[i];
  }
  return null;
}

/** CSV oscillateurs (t, z, hurst, regime). */
export function oscillatorsToCSV(bars, osc) {
  const lines = ["t,close,zScore,hurst,regime,regimeLabel"];
  const labels = osc.regimeLabels || HMM_REGIME_LABELS;
  for (let i = 0; i < bars.length; i++) {
    const t = bars[i].t != null ? new Date(bars[i].t).toISOString() : i;
    const z = osc.zScore[i];
    const h = osc.hurst[i];
    const r = osc.regime[i];
    const lab = r != null && labels[r] != null ? labels[r] : "";
    lines.push(
      [
        t,
        bars[i].c,
        Number.isFinite(z) ? z.toFixed(4) : "",
        Number.isFinite(h) ? h.toFixed(4) : "",
        r != null ? r : "",
        lab,
      ].join(","),
    );
  }
  return lines.join("\n");
}
