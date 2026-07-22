// VPIN — Volume-Synchronized Probability of Informed Trading
// Easley, López de Prado & O'Hara (2012) — "Flow Toxicity and Liquidity in a High-Frequency World".
//
// Différence vs l'ancienne implémentation (indicators.vpin) :
//   • Classement du volume par BULK VOLUME CLASSIFICATION (BVC) — on répartit une *fraction*
//     du volume de chaque barre entre achats/ventes via la CDF normale de la variation de prix
//     standardisée, au lieu du tick-rule tout-ou-rien (bien moins bruité — c'est la méthode du papier).
//   • Buckets à VOLUME CONSTANT avec découpage d'une barre à cheval sur deux buckets.
//   • Signal de krach = CDF DU VPIN (percentile glissant), pas un seuil fixe arbitraire.
//     C'est cette CDF qui a atteint son maximum ~1h avant le Flash Crash du 6 mai 2010.
//
// Tout est calculé à partir des barres OHLCV déjà disponibles — aucune donnée inventée.

import { normCdf } from "./backtestMetrics.js";

// Presets VPIN par classe d'actif — la microstructure diffère, donc le réglage aussi.
// Le papier original (Easley/LdP/O'Hara) portait sur les futures E-mini S&P → "indices" est la référence.
export const VPIN_PRESETS = {
  indices:   { buckets: 200, window: 50, sigmaWindow: 50, label: "Indices / Futures (référence — E-mini S&P du papier)" },
  crypto:    { buckets: 250, window: 30, sigmaWindow: 30, label: "Crypto (24/7, réactif — capte les bursts de toxicité)" },
  forex:     { buckets: 200, window: 50, sigmaWindow: 75, label: "Forex (très liquide, lissé)" },
  stocks:    { buckets: 200, window: 40, sigmaWindow: 40, label: "Actions (toxicité d'ouverture / gaps)" },
  metals:    { buckets: 180, window: 50, sigmaWindow: 60, label: "Métaux (futures)" },
  energy:    { buckets: 180, window: 50, sigmaWindow: 60, label: "Énergie (futures)" },
  synthetic: { buckets: 200, window: 50, sigmaWindow: 50, label: "Défaut" },
};

// Résout la classe VPIN à partir du symbole (futures synthétiques ou catalogue réel).
const _FUTURES_CLASS = { ES: "indices", MES: "indices", NQ: "indices", MNQ: "indices", YM: "indices", CL: "energy", GC: "metals", "6E": "forex" };
const _REAL_CLASS = {
  BTC: "crypto", ETH: "crypto", SOL: "crypto", BNB: "crypto", XRP: "crypto",
  SPX: "indices", NDX: "indices", DJI: "indices", RUT: "indices", DAX: "indices",
  EURUSD: "forex", GBPUSD: "forex", USDJPY: "forex", AUDUSD: "forex", USDCAD: "forex",
  AAPL: "stocks", MSFT: "stocks", NVDA: "stocks", TSLA: "stocks", AMZN: "stocks",
  GOLD: "metals", SILVER: "metals", COPPER: "metals", PLATINUM: "metals",
  WTI: "energy", BRENT: "energy", NATGAS: "energy",
};
export function resolveVpinClass(symbol) {
  if (!symbol) return "synthetic";
  return _FUTURES_CLASS[symbol] || _REAL_CLASS[symbol] || "synthetic";
}

// Écart-type glissant des variations close-to-close (sert à standardiser la BVC).
function rollingStd(deltas, window) {
  const out = new Array(deltas.length).fill(NaN);
  let sum = 0, sum2 = 0;
  for (let i = 0; i < deltas.length; i++) {
    sum += deltas[i]; sum2 += deltas[i] * deltas[i];
    if (i >= window) { const d = deltas[i - window]; sum -= d; sum2 -= d * d; }
    const n = Math.min(i + 1, window);
    if (n >= 2) {
      const mean = sum / n;
      const varr = Math.max(1e-12, sum2 / n - mean * mean);
      out[i] = Math.sqrt(varr);
    }
  }
  return out;
}

// Fraction d'ACHAT de chaque barre selon la méthode.
// real : V_buy = vBuy / V   (volume acheteur agressif RÉEL — ex. taker-buy Binance, aucune estimation)
// bvc  : V_buy = V · Φ(ΔP / σ_ΔP)   (Bulk Volume Classification, méthode du papier)
// tick : V_buy = V si ΔP>0, 0 si ΔP<0, V/2 si nul  (tick-rule, grossier)
export function classifyBuyFraction(bars, method = "bvc", sigmaWindow = 50) {
  const n = bars.length;
  const frac = new Array(n).fill(0.5);
  if (method === "real") {
    for (let i = 0; i < n; i++) {
      const v = bars[i].v, vb = bars[i].vBuy;
      frac[i] = (v > 0 && vb !== undefined) ? Math.max(0, Math.min(1, vb / v)) : 0.5;
    }
    return frac;
  }
  const closes = bars.map((b) => b.c);
  const deltas = new Array(n).fill(0);
  for (let i = 1; i < n; i++) deltas[i] = closes[i] - closes[i - 1];
  if (method === "tick") {
    for (let i = 1; i < n; i++) frac[i] = deltas[i] > 0 ? 1 : deltas[i] < 0 ? 0 : 0.5;
    return frac;
  }
  const sig = rollingStd(deltas, sigmaWindow);
  for (let i = 1; i < n; i++) {
    const s = sig[i];
    frac[i] = !s || Number.isNaN(s) ? 0.5 : normCdf(deltas[i] / s);
  }
  return frac;
}

// Vrai si les barres portent un volume acheteur réel exploitable (ex. crypto Binance).
export function hasRealFlow(bars) {
  return Array.isArray(bars) && bars.some((b) => b && b.vBuy !== undefined && b.v > 0);
}

// Percentile empirique glissant de `value` dans l'historique `hist` (buckets précédents).
// = CDF du VPIN : proportion des valeurs passées ≤ valeur courante.
function empiricalCdf(hist, value) {
  if (hist.length === 0) return NaN;
  let le = 0;
  for (const h of hist) if (h <= value) le++;
  return le / hist.length;
}

// Niveau de toxicité dérivé de la CDF (signal de krach façon Easley/LdP/O'Hara).
export function toxicityLevel(cdf) {
  if (Number.isNaN(cdf)) return { level: "n/a", label: "—", color: "#6a7280" };
  if (cdf >= 0.99) return { level: "toxic", label: "TOXIQUE", color: "#ff4d4f" };
  if (cdf >= 0.90) return { level: "high", label: "ÉLEVÉ", color: "#ffb020" };
  if (cdf >= 0.70) return { level: "warm", label: "TENDU", color: "#e6c229" };
  return { level: "normal", label: "NORMAL", color: "#33c17a" };
}

/**
 * Calcule le VPIN complet à partir des barres.
 * @param {Array<{c:number,v:number,t?:number}>} bars
 * @param {object} opt
 *   - buckets    : nombre de buckets à volume constant visés sur l'échantillon (déf. 200)
 *   - window     : nb de buckets dans la moyenne VPIN (déf. 50, ≈ 1 "jour" de buckets)
 *   - method     : "bvc" (déf.) | "tick"
 *   - sigmaWindow: fenêtre d'écart-type pour la BVC (déf. 50)
 *   - cdfWindow  : historique glissant pour la CDF du VPIN (déf. 250 buckets ; 0 = expanding)
 * @returns { vpinByBar, cdfByBar, buckets, lastVPIN, lastCDF, tox, method, bucketVolume, avgVPIN, maxVPIN }
 */
export function computeVPIN(bars, opt = {}) {
  const { buckets: nBucketsTarget = 200, window = 50, method = "auto", sigmaWindow = 50, cdfWindow = 250 } = opt;
  const n = bars?.length || 0;
  // "auto" → classification réelle si les barres portent un volume acheteur, sinon BVC.
  const effMethod = method === "auto" ? (hasRealFlow(bars) ? "real" : "bvc") : method;
  const empty = { vpinByBar: new Array(n).fill(NaN), cdfByBar: new Array(n).fill(NaN), buckets: [], lastVPIN: NaN, lastCDF: NaN, tox: toxicityLevel(NaN), method: effMethod, bucketVolume: 0, avgVPIN: NaN, maxVPIN: NaN };
  if (n < window + 5) return empty;

  const vols = bars.map((b) => Math.max(0, b.v || 0));
  const totalV = vols.reduce((a, b) => a + b, 0);
  if (totalV <= 0) return empty;

  const buyFrac = classifyBuyFraction(bars, effMethod, sigmaWindow);
  const bucketVolume = totalV / nBucketsTarget;

  const vpinByBar = new Array(n).fill(NaN);
  const cdfByBar = new Array(n).fill(NaN);
  const bucketList = [];         // { oi, vpin, cdf, endBar }
  const vpinHistory = [];        // valeurs VPIN passées (pour la CDF)
  const imbalances = [];         // |Vb − Vs| / V par bucket

  let curV = 0, curBuy = 0, curSell = 0;

  for (let i = 0; i < n; i++) {
    let remaining = vols[i];
    const bf = buyFrac[i];
    // Découpe le volume de la barre à travers les frontières de bucket.
    while (remaining > 0) {
      const room = bucketVolume - curV;
      const take = Math.min(remaining, room);
      curBuy += take * bf;
      curSell += take * (1 - bf);
      curV += take;
      remaining -= take;

      if (curV >= bucketVolume - 1e-9) {
        const oi = Math.abs(curBuy - curSell) / bucketVolume; // ∈ [0,1]
        imbalances.push(oi);
        let vpin = NaN, cdf = NaN;
        if (imbalances.length >= window) {
          const slice = imbalances.slice(-window);
          vpin = slice.reduce((a, b) => a + b, 0) / window;
          const hist = cdfWindow > 0 ? vpinHistory.slice(-cdfWindow) : vpinHistory;
          cdf = empiricalCdf(hist, vpin);
          vpinHistory.push(vpin);
        }
        bucketList.push({ oi, vpin, cdf, endBar: i });
        if (!Number.isNaN(vpin)) { vpinByBar[i] = vpin; cdfByBar[i] = cdf; }
        curV = 0; curBuy = 0; curSell = 0;
      }
    }
  }

  // Propage la dernière valeur connue vers l'avant pour un tracé continu par barre.
  let lastV = NaN, lastC = NaN;
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(vpinByBar[i])) { lastV = vpinByBar[i]; lastC = cdfByBar[i]; }
    else if (!Number.isNaN(lastV)) { vpinByBar[i] = lastV; cdfByBar[i] = lastC; }
  }

  const valid = vpinHistory.filter((v) => !Number.isNaN(v));
  const lastVPIN = valid.length ? valid[valid.length - 1] : NaN;
  const lastCDF = bucketList.length ? bucketList[bucketList.length - 1].cdf : NaN;
  return {
    vpinByBar, cdfByBar, buckets: bucketList,
    lastVPIN, lastCDF, tox: toxicityLevel(lastCDF),
    method: effMethod, bucketVolume,
    avgVPIN: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : NaN,
    maxVPIN: valid.length ? Math.max(...valid) : NaN,
  };
}
