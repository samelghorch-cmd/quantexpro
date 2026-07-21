// Extrait de v4core.js — combinaison pondérée de stratégies.
export function ensembleEval(components) {
  // components = [{ eval, weight }]
  return (ctx, i) => {
    let longScore = 0, shortScore = 0, totalW = 0;
    components.forEach(({ eval: fn, weight }) => {
      const s = fn(ctx, i);
      if (s.long) longScore += weight;
      if (s.short) shortScore += weight;
      totalW += weight;
    });
    return { long: longScore >= totalW * 0.5, short: shortScore >= totalW * 0.5, longScore, shortScore, totalW };
  };
}
