// Facteur d'annualisation dérivé du VRAI espacement des barres.
// Corrige le bug historique `Math.sqrt(252 * 78)` codé en dur (valable seulement pour du 5 min
// actions), qui surévaluait le Sharpe/Sortino d'un facteur ~3 à ~9 sur 1h / 4h / 1j.
//
// Méthode : médiane des deltas de timestamps → ignore les gaps week-end/nuit (qui sont minoritaires),
// puis nombre de périodes par an sur une base calendaire (365,25 j). Fonctionne pour tout TF et toute
// classe d'actif (crypto 24/7 comme actions), de façon cohérente entre tous les outils.

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

export function periodsPerYear(bars) {
  if (!Array.isArray(bars) || bars.length < 3) return 252;
  const deltas = [];
  for (let i = 1; i < bars.length; i++) {
    const d = bars[i].t - bars[i - 1].t;
    if (d > 0) deltas.push(d);
  }
  if (!deltas.length) return 252;
  deltas.sort((a, b) => a - b);
  const med = deltas[Math.floor(deltas.length / 2)]; // espacement dominant (médiane)
  const ppy = YEAR_MS / med;
  return Number.isFinite(ppy) && ppy > 0 ? ppy : 252;
}

// √(périodes par an) — facteur direct pour annualiser un Sharpe/Sortino calculé par barre.
export function annualFactor(bars) {
  return Math.sqrt(periodsPerYear(bars));
}
