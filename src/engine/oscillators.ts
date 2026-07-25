// P4-OSC / P5-TS-MORE — oscillateurs multi-courbes Z-Score / Hurst / régimes (Module 1).
// Séries causales pour overlay chart — pas de look-ahead.
import { hmmRegimes, HMM_REGIME_LABELS } from "./quantToolbox/index.ts";

export interface OscBar {
  t?: number;
  c: number;
}

/** Sous-ensemble de buildContext utilisé ici. */
export interface OscContext {
  z?: Record<number, (number | null)[]>;
  hurst100?: (number | null)[];
}

export interface OscOpts {
  zWin?: number;
}

export interface OscCurrent {
  zScore: number | null;
  hurst: number | null;
  regime: number | null;
  regimeLabel: string | null;
}

export interface MarketOscillators {
  zScore: (number | null)[];
  hurst: (number | null)[];
  hurstOverlay: (number | null)[];
  regime: (number | null)[];
  regimeLabels: string[];
  current: OscCurrent;
  meta: {
    zWin: number;
    hurstLen: number;
    n: number;
    heuristicRegime: boolean;
  };
}

/** Z-Score roulant causal (fenêtre ``win`` close). */
export function rollingZScore(
  series: number[] | null | undefined,
  win = 20,
): (number | null)[] {
  const out: (number | null)[] = Array(series?.length ?? 0).fill(null);
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
export function scaleHurstForOverlay(
  hurstSeries: (number | null | undefined)[] | null | undefined,
  scale = 4,
): (number | null)[] {
  return (hurstSeries || []).map((h) =>
    Number.isFinite(h as number) ? ((h as number) - 0.5) * scale : null,
  );
}

/** Bundle oscillateurs marché pour Statistical Edge / Analyse. */
export function buildMarketOscillators(
  bars: OscBar[] | null | undefined,
  ctx: OscContext | null | undefined,
  opts: OscOpts = {},
): MarketOscillators {
  const zWin = opts.zWin ?? 20;
  const close = (bars || []).map((b) => b.c);
  const returns: number[] = [];
  for (let i = 1; i < close.length; i++) {
    const prev = close[i - 1];
    returns.push(prev > 0 ? Math.log(close[i] / prev) : 0);
  }

  const zScore = ctx?.z?.[zWin] || rollingZScore(close, zWin);
  const hurst = ctx?.hurst100 || [];
  const hurstOverlay = scaleHurstForOverlay(hurst, 4);

  const hmm = returns.length >= 40 ? hmmRegimes(returns) : null;
  const regime: (number | null)[] = Array(close.length).fill(null);
  if (hmm?.states) {
    for (let i = 0; i < hmm.states.length; i++) {
      regime[i + 1] = hmm.states[i];
    }
    if (regime[0] == null) regime[0] = hmm.states[0];
  }

  const lastZ = lastFinite(zScore);
  const lastH = lastFinite(hurst);
  const lastR = (hmm?.current ?? lastFinite(regime)) as number | null;

  const labels: string[] = hmm?.labels || HMM_REGIME_LABELS.slice();

  return {
    zScore,
    hurst,
    hurstOverlay,
    regime,
    regimeLabels: labels,
    current: {
      zScore: lastZ,
      hurst: lastH,
      regime: lastR,
      regimeLabel:
        lastR != null && labels[lastR] != null
          ? labels[lastR]
          : lastR != null
            ? HMM_REGIME_LABELS[lastR]
            : null,
    },
    meta: {
      zWin,
      hurstLen: 100,
      n: close.length,
      heuristicRegime: Boolean(hmm?.heuristic),
    },
  };
}

function lastFinite(arr: (number | null | undefined)[] | null | undefined): number | null {
  if (!arr?.length) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (Number.isFinite(v as number)) return v as number;
  }
  return null;
}

/** CSV oscillateurs (t, z, hurst, regime). */
export function oscillatorsToCSV(bars: OscBar[], osc: MarketOscillators): string {
  const lines = ["t,close,zScore,hurst,regime,regimeLabel"];
  const labels = osc.regimeLabels || HMM_REGIME_LABELS;
  for (let i = 0; i < bars.length; i++) {
    const t = bars[i].t != null ? new Date(bars[i].t as number).toISOString() : i;
    const z = osc.zScore[i];
    const h = osc.hurst[i];
    const r = osc.regime[i];
    const lab = r != null && labels[r] != null ? labels[r] : "";
    lines.push(
      [
        t,
        bars[i].c,
        Number.isFinite(z as number) ? (z as number).toFixed(4) : "",
        Number.isFinite(h as number) ? (h as number).toFixed(4) : "",
        r != null ? r : "",
        lab,
      ].join(","),
    );
  }
  return lines.join("\n");
}
