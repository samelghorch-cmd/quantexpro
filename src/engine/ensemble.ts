// Extrait de v4core.js — combinaison pondérée de stratégies.
type EnsembleEval = (ctx: any, i: number) => { long?: boolean; short?: boolean };
interface EnsembleComponent { eval: EnsembleEval; weight: number; }

// components = [{ eval, weight }]
export function ensembleEval(components: EnsembleComponent[]) {
  return (ctx: any, i: number) => {
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
