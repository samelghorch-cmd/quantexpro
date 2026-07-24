// Patterns Library — 616 patterns dérivés déterministiquement de la bibliothèque de stratégies,
// avec métadonnées de filtrage (timeframe M1–MN, actifs, difficulté, nb d'indicateurs).
// P4-PAT / P7-TS-PAT : grille TF complète alignée spec institutionnelle.
import { seededRandom } from "./random.ts";
import { buildStrategyLibrary } from "./strategyLibrary.ts";

export type Timeframe = "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1" | "W1" | "MN";
export type TfFamily = "all" | "scalp" | "intraday" | "swing";
export type Difficulty = "simple" | "medium" | "advanced";
export type AssetClass =
  | "forex"
  | "crypto"
  | "futures"
  | "indices"
  | "stocks"
  | "etf"
  | "commodities"
  | "jpy";

export interface Pattern {
  id: number;
  name: string;
  cat: string;
  stratId: number | string;
  eval: unknown;
  timeframe: Timeframe;
  assets: AssetClass[];
  difficulty: Difficulty;
  nIndicators: number;
  winRateHint: number;
}

export interface PatternFilters {
  timeframe?: string;
  tfFamily?: string;
  asset?: string;
  difficulty?: string;
  indicators?: string;
  search?: string;
}

/** Timeframes M1 → MN (ordre croissant). */
export const TIMEFRAMES: readonly Timeframe[] = [
  "M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN",
];

/** Familles de TF pour filtres rapides UI. */
export const TF_FAMILIES: Record<TfFamily, readonly Timeframe[]> = {
  all: TIMEFRAMES.slice(),
  scalp: ["M1", "M5", "M15"],
  intraday: ["M30", "H1", "H4"],
  swing: ["D1", "W1", "MN"],
};

export const ASSETS: readonly AssetClass[] = [
  "forex", "crypto", "futures", "indices", "stocks", "etf", "commodities", "jpy",
];
export const DIFFICULTY: readonly Difficulty[] = ["simple", "medium", "advanced"];

interface CatProfile {
  diff: Difficulty;
  ind: number;
}

// Mappe la catégorie de stratégie vers un profil de difficulté/indicateurs plausibles.
const CAT_PROFILE: Record<string, CatProfile> = {
  a: { diff: "simple", ind: 1 }, b: { diff: "medium", ind: 2 }, c: { diff: "medium", ind: 2 },
  d: { diff: "advanced", ind: 3 }, e: { diff: "advanced", ind: 2 }, f: { diff: "advanced", ind: 3 },
  g: { diff: "medium", ind: 2 }, h: { diff: "simple", ind: 1 }, i: { diff: "medium", ind: 2 },
  j: { diff: "advanced", ind: 4 }, k: { diff: "simple", ind: 1 }, l: { diff: "advanced", ind: 3 },
};

let _cache: Pattern[] | null = null;
let _cacheKey = "";

export function clearPatternsCache(): void {
  _cache = null;
  _cacheKey = "";
}

export function buildPatternsLibrary(target = 616): Pattern[] {
  const key = `${target}|${TIMEFRAMES.join(",")}`;
  if (_cache && _cacheKey === key) return _cache;
  const lib = buildStrategyLibrary() as Array<{
    id: number | string;
    name: string;
    cat: string;
    eval: unknown;
  }>;
  const rnd = seededRandom(616) as () => number;
  const patterns: Pattern[] = [];
  for (let k = 0; k < target; k++) {
    const strat = lib[k % lib.length];
    const prof = CAT_PROFILE[strat.cat] || { diff: "medium" as const, ind: 2 };
    const tf = TIMEFRAMES[Math.floor(rnd() * TIMEFRAMES.length)];
    const nAssets = 1 + Math.floor(rnd() * 3);
    const pool = ASSETS.slice() as AssetClass[];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    const assets = pool.slice(0, nAssets);
    const indVar = Math.max(1, Math.min(4, prof.ind + (Math.floor(rnd() * 3) - 1)));
    patterns.push({
      id: k + 1,
      name: strat.name + (k >= lib.length ? ` · var.${Math.floor(k / lib.length) + 1}` : ""),
      cat: strat.cat,
      stratId: strat.id,
      eval: strat.eval,
      timeframe: tf,
      assets,
      difficulty: prof.diff,
      nIndicators: indVar,
      winRateHint: 40 + Math.floor(rnd() * 35),
    });
  }
  _cache = patterns;
  _cacheKey = key;
  return patterns;
}

export function filterPatterns(
  patterns: Pattern[],
  {
    timeframe = "all",
    tfFamily = "all",
    asset = "all",
    difficulty = "all",
    indicators = "all",
    search = "",
  }: PatternFilters = {},
): Pattern[] {
  const q = search.toLowerCase().trim();
  const familyKey = tfFamily as TfFamily;
  const familySet =
    tfFamily && tfFamily !== "all" && TF_FAMILIES[familyKey]
      ? new Set(TF_FAMILIES[familyKey])
      : null;

  return patterns.filter((p) => {
    if (timeframe !== "all" && p.timeframe !== timeframe) return false;
    if (familySet && !familySet.has(p.timeframe)) return false;
    if (asset !== "all" && !p.assets.includes(asset as AssetClass)) return false;
    if (difficulty !== "all" && p.difficulty !== difficulty) return false;
    if (indicators !== "all") {
      if (indicators === "4+") {
        if (p.nIndicators < 4) return false;
      } else if (p.nIndicators !== Number(indicators)) return false;
    }
    if (q && !p.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Comptage par timeframe (pour UI / tests). */
export function countByTimeframe(patterns: Pattern[] | null | undefined): Record<Timeframe, number> {
  const out = Object.fromEntries(TIMEFRAMES.map((tf) => [tf, 0])) as Record<Timeframe, number>;
  for (const p of patterns || []) {
    if (out[p.timeframe] != null) out[p.timeframe]++;
  }
  return out;
}

export const PATTERN_FILTERS = {
  TIMEFRAMES,
  TF_FAMILIES: Object.keys(TF_FAMILIES),
  ASSETS,
  DIFFICULTY,
};
