// Patterns Library — 616 patterns dérivés déterministiquement de la bibliothèque de stratégies,
// avec métadonnées de filtrage (timeframe, actifs, difficulté, nb d'indicateurs).
import { seededRandom } from "./random.js";
import { buildStrategyLibrary } from "./strategyLibrary.js";

const TIMEFRAMES = ["M5", "M15", "M30", "H1", "H4", "D1"];
const ASSETS = ["forex", "crypto", "futures", "indices", "stocks", "etf", "commodities", "jpy"];
const DIFFICULTY = ["simple", "medium", "advanced"];

// Mappe la catégorie de stratégie vers un profil de difficulté/indicateurs plausibles.
const CAT_PROFILE = {
  a: { diff: "simple", ind: 1 }, b: { diff: "medium", ind: 2 }, c: { diff: "medium", ind: 2 },
  d: { diff: "advanced", ind: 3 }, e: { diff: "advanced", ind: 2 }, f: { diff: "advanced", ind: 3 },
  g: { diff: "medium", ind: 2 }, h: { diff: "simple", ind: 1 }, i: { diff: "medium", ind: 2 },
  j: { diff: "advanced", ind: 4 }, k: { diff: "simple", ind: 1 }, l: { diff: "advanced", ind: 3 },
};

let _cache = null;
export function buildPatternsLibrary(target = 616) {
  if (_cache) return _cache;
  const lib = buildStrategyLibrary();
  const rnd = seededRandom(616);
  const patterns = [];
  for (let k = 0; k < target; k++) {
    const strat = lib[k % lib.length];
    const prof = CAT_PROFILE[strat.cat] || { diff: "medium", ind: 2 };
    const tf = TIMEFRAMES[Math.floor(rnd() * TIMEFRAMES.length)];
    const nAssets = 1 + Math.floor(rnd() * 3);
    const assets = [...ASSETS].sort(() => rnd() - 0.5).slice(0, nAssets);
    const indVar = Math.max(1, Math.min(4, prof.ind + (Math.floor(rnd() * 3) - 1)));
    patterns.push({
      id: k + 1,
      name: strat.name + (k >= lib.length ? ` · var.${Math.floor(k / lib.length) + 1}` : ""),
      cat: strat.cat, stratId: strat.id, eval: strat.eval,
      timeframe: tf, assets, difficulty: prof.diff, nIndicators: indVar,
      winRateHint: 40 + Math.floor(rnd() * 35),
    });
  }
  _cache = patterns;
  return patterns;
}

export function filterPatterns(patterns, { timeframe = "all", asset = "all", difficulty = "all", indicators = "all", search = "" }) {
  const q = search.toLowerCase().trim();
  return patterns.filter((p) => {
    if (timeframe !== "all" && p.timeframe !== timeframe) return false;
    if (asset !== "all" && !p.assets.includes(asset)) return false;
    if (difficulty !== "all" && p.difficulty !== difficulty) return false;
    if (indicators !== "all") {
      if (indicators === "4+") { if (p.nIndicators < 4) return false; }
      else if (p.nIndicators !== Number(indicators)) return false;
    }
    if (q && !p.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

export const PATTERN_FILTERS = { TIMEFRAMES, ASSETS, DIFFICULTY };
