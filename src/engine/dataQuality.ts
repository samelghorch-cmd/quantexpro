// Couche qualité des données : nettoie les bougies brutes des fournisseurs avant tout backtest.
// Tri chronologique, déduplication, suppression des OHLC invalides, détection de gaps, score de santé.
// Des données propres = des backtests fiables = des stratégies qui tiennent.

interface QBar { o: number; h: number; l: number; c: number; t: number; }

function isValidBar(b: QBar | null | undefined) {
  if (!b) return false;
  const { o, h, l, c } = b;
  if (![o, h, l, c].every((v) => Number.isFinite(v) && v > 0)) return false;
  if (h < l) return false;                         // high sous le low = corrompu
  if (h < o || h < c || l > o || l > c) return false; // OHLC incohérent
  return true;
}

// Intervalle médian entre bougies (pour repérer les trous).
function medianStep(bars: QBar[]) {
  if (bars.length < 3) return 0;
  const steps = [];
  for (let i = 1; i < bars.length; i++) steps.push(bars[i].t - bars[i - 1].t);
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)] || 0;
}

export function cleanBars(rawBars: QBar[], { assetClass }: { assetClass?: string } = {}) {
  const initial = rawBars ? rawBars.length : 0;
  if (!rawBars || initial === 0) return { bars: [], report: { initial: 0, kept: 0, removed: 0, dupes: 0, gaps: 0, health: 0 } };

  // 1) tri chronologique
  let bars = [...rawBars].sort((a, b) => a.t - b.t);

  // 2) déduplication par timestamp (garde la dernière version)
  const map = new Map<number, QBar>();
  bars.forEach((b) => map.set(b.t, b));
  const dupes = bars.length - map.size;
  bars = [...map.values()];

  // 3) suppression des bougies invalides
  const beforeInvalid = bars.length;
  bars = bars.filter(isValidBar);
  const removedInvalid = beforeInvalid - bars.length;

  // 4) détection des gaps (trous > 2× l'intervalle médian, hors week-end pour le forex)
  const step = medianStep(bars);
  let gaps = 0;
  if (step > 0) {
    for (let i = 1; i < bars.length; i++) {
      const d = bars[i].t - bars[i - 1].t;
      if (d > step * 2.5) {
        // tolère le trou du week-end (~48-72h) pour forex/indices/métaux/énergie
        const weekendTolerant = assetClass && assetClass !== "crypto";
        if (!(weekendTolerant && d <= step + 72 * 3600 * 1000)) gaps++;
      }
    }
  }

  // 5) score de santé 0-100 (pénalise pertes, dupes, gaps)
  const removed = removedInvalid + dupes;
  const lossPct = initial ? removed / initial : 0;
  const gapPct = bars.length ? gaps / bars.length : 0;
  const health = Math.max(0, Math.min(100, 100 - lossPct * 200 - gapPct * 100));

  return {
    bars,
    report: { initial, kept: bars.length, removed: removedInvalid, dupes, gaps, health: Math.round(health), step },
  };
}

// Applique l'ajustement splits/dividendes (Yahoo) : facteur = adjClose / close, appliqué à O/H/L/C.
export function applyAdjustment(bars: QBar[], adjClose: number[]) {
  if (!adjClose || adjClose.length !== bars.length) return bars;
  return bars.map((b, i) => {
    const adj = adjClose[i];
    if (!Number.isFinite(adj) || !Number.isFinite(b.c) || b.c === 0) return b;
    const f = adj / b.c;
    return { ...b, o: b.o * f, h: b.h * f, l: b.l * f, c: adj };
  });
}
