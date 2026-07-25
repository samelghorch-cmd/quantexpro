// Optimiseur évolutionnaire (algorithme génétique) — « variantes à l'infini ».
// Contrairement au refine à grille figée (54 combos), il explore un espace continu de paramètres
// {stratégie, SL, TP, BE, direction} par sélection / croisement / mutation, sur l'actif × TF courant.
// Fitness = même score composite que la page Backtest. Cache par génome pour éviter les recalculs.
import { runBacktestExt, type BacktestExtParams } from "./backtestExtended.ts";
import type { BacktestBar, BacktestContext, BacktestStrategy, StrategyEvalFn } from "./backtest.ts";
import { seededRandom } from "./random.ts";

const DIRS = ["both", "long", "short"] as const;
type GaDirection = (typeof DIRS)[number];
const MIN_TRADES = 8; // en-dessous, résultat non fiable → rejeté

type ExtResult = ReturnType<typeof runBacktestExt>;

export interface GaScoreInput {
  nTrades: number;
  sharpe?: number;
  winRate: number;
  profitFactor: number;
  maxDD: number;
  expectancyR: number;
}

export interface Genome {
  stratId: number | string;
  slAtr: number;
  tpAtr: number;
  beAtr: number;
  direction: GaDirection;
}

export interface EvaluatedGenome extends Genome {
  name?: string;
  cat?: string;
  score: number;
  res: ExtResult | null;
}

export interface GaStrategy {
  id: number | string;
  name?: string;
  cat?: string;
  eval: StrategyEvalFn;
}

export interface CreateGAOptions {
  bars: BacktestBar[];
  ctx: BacktestContext;
  library: GaStrategy[] | BacktestStrategy[];
  symbol: string;
  capital?: number;
  popSize?: number;
  lockStratId?: number | string | null;
  seed?: number;
  mutationRate?: number;
}

export function scoreOf(res: GaScoreInput | null | undefined): number {
  if (!res || res.nTrades < MIN_TRADES) return -1;
  const parts = [
    Math.min(1, (res.sharpe || 0) / 2.5),
    Math.min(1, res.winRate / 70),
    Math.min(1, (Number.isFinite(res.profitFactor) ? res.profitFactor : 3) / 2.5),
    Math.max(0, 1 - res.maxDD / 0.3),
    Math.min(1, Math.max(0, res.expectancyR) / 0.5),
  ];
  return (parts.reduce((a, b) => a + b, 0) / parts.length) * 100;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

function randGenome(rng: () => number, stratIds: Array<number | string>): Genome {
  return {
    stratId: stratIds[Math.floor(rng() * stratIds.length)],
    slAtr: r2(0.5 + rng() * 4.5),
    tpAtr: rng() < 0.25 ? 0 : r2(0.5 + rng() * 7.5),
    beAtr: rng() < 0.5 ? 0 : r2(rng() * 3),
    direction: DIRS[Math.floor(rng() * DIRS.length)],
  };
}

function mutate(
  g: Genome,
  rng: () => number,
  stratIds: Array<number | string>,
  rate: number,
  lockStrat: boolean,
): Genome {
  const n: Genome = { ...g };
  if (!lockStrat && rng() < rate) n.stratId = stratIds[Math.floor(rng() * stratIds.length)];
  if (rng() < rate) n.slAtr = r2(clamp(n.slAtr + (rng() - 0.5) * 2, 0.3, 6));
  if (rng() < rate) n.tpAtr = rng() < 0.15 ? 0 : r2(clamp((n.tpAtr || 2) + (rng() - 0.5) * 3, 0, 10));
  if (rng() < rate) n.beAtr = rng() < 0.3 ? 0 : r2(clamp((n.beAtr || 1) + (rng() - 0.5) * 2, 0, 4));
  if (rng() < rate) n.direction = DIRS[Math.floor(rng() * DIRS.length)];
  return n;
}

function crossover(a: Genome, b: Genome, rng: () => number): Genome {
  return {
    stratId: rng() < 0.5 ? a.stratId : b.stratId,
    slAtr: rng() < 0.5 ? a.slAtr : b.slAtr,
    tpAtr: rng() < 0.5 ? a.tpAtr : b.tpAtr,
    beAtr: rng() < 0.5 ? a.beAtr : b.beAtr,
    direction: rng() < 0.5 ? a.direction : b.direction,
  };
}

// Crée un optimiseur pas-à-pas (la page appelle step() par génération pour garder l'UI fluide).
export function createGA({
  bars, ctx, library, symbol, capital = 100000, popSize = 40,
  lockStratId = null, seed = 42, mutationRate = 0.3,
}: CreateGAOptions) {
  const rng = seededRandom(seed);
  const stratIds: Array<number | string> = lockStratId != null ? [lockStratId] : library.map((s) => s.id);
  const stratById = new Map(library.map((s) => [s.id, s]));
  const cache = new Map<string, EvaluatedGenome>();
  const key = (g: Genome) => `${g.stratId}|${g.slAtr}|${g.tpAtr}|${g.beAtr}|${g.direction}`;

  function evaluate(g: Genome): EvaluatedGenome {
    const k = key(g);
    const cached = cache.get(k);
    if (cached) return cached;
    const strat = stratById.get(g.stratId);
    let res: ExtResult | null = null;
    let score = -1;
    if (strat) {
      const extParams: BacktestExtParams = {
        contract: symbol, capital, direction: g.direction,
        slAtr: g.slAtr, tpAtr: g.tpAtr, beAtr: g.beAtr, contracts: 1,
      };
      res = runBacktestExt(bars, ctx, strat.eval, extParams);
      score = scoreOf(res);
    }
    const out: EvaluatedGenome = { ...g, name: strat?.name, cat: strat?.cat, score, res };
    cache.set(k, out);
    return out;
  }

  let population = Array.from({ length: popSize }, () => evaluate(randGenome(rng, stratIds)));
  population.sort((a, b) => b.score - a.score);
  let gen = 0;

  function step() {
    const elite = Math.max(2, Math.floor(popSize * 0.2));
    const next = population.slice(0, elite); // élitisme : on garde le top 20 %
    const poolTop = population.slice(0, Math.max(elite, Math.floor(popSize * 0.5)));
    let guard = 0;
    while (next.length < popSize && guard++ < popSize * 20) {
      const pa = poolTop[Math.floor(rng() * poolTop.length)];
      const pb = poolTop[Math.floor(rng() * poolTop.length)];
      let child = crossover(pa, pb, rng);
      child = mutate(child, rng, stratIds, mutationRate, lockStratId != null);
      next.push(evaluate(child));
    }
    next.sort((a, b) => b.score - a.score);
    population = next;
    gen++;
    return { gen, best: population[0], evaluated: cache.size };
  }

  return {
    step,
    get population() { return population; },
    get best() { return population[0]; },
    get evaluated() { return cache.size; },
    get gen() { return gen; },
    get spaceSize() { return stratIds.length; },
  };
}
