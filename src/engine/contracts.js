// Extrait de v4core.js — specs contrats futures (point value, tick, frais)
// + specs des ACTIFS RÉELS (coûts proportionnels au notionnel : fee % + spread %).
export const CONTRACTS = {
  ES:  { name: "E-mini S&P 500",  pv: 50,   tick: 0.25,  commission: 2.50, slippage: 1 },
  MES: { name: "Micro E-mini S&P",pv: 5,    tick: 0.25,  commission: 0.85, slippage: 1 },
  NQ:  { name: "E-mini Nasdaq",   pv: 20,   tick: 0.25,  commission: 2.50, slippage: 1 },
  MNQ: { name: "Micro E-mini NQ", pv: 2,    tick: 0.25,  commission: 0.85, slippage: 1 },
  YM:  { name: "E-mini Dow",      pv: 5,    tick: 1.00,  commission: 2.50, slippage: 1 },
  CL:  { name: "Crude Oil",       pv: 1000, tick: 0.01,  commission: 3.10, slippage: 1 },
  GC:  { name: "Gold",            pv: 100,  tick: 0.10,  commission: 3.10, slippage: 1 },
  "6E":{ name: "Euro FX",         pv: 125000,tick: 0.00005,commission: 2.50, slippage: 1 },
};

// Coûts par CLASSE d'actif réel — proportionnels au notionnel (pv = 1 : le P&L est
// Δprix × quantité, la quantité peut être fractionnaire).
//   feePct    : commission par côté, en fraction du notionnel (0.001 = 10 bps)
//   spreadPct : spread aller-retour, en fraction du notionnel d'entrée
// Ordres de grandeur retail honnêtes : Binance taker 0.10 %, forex majors ~1 pip,
// actions ~5 bps + spread, indices/CFD ~2 bps, futures métaux/énergie via classe.
export const REAL_CLASS_SPECS = {
  crypto:  { feePct: 0.0010, spreadPct: 0.0002 },
  indices: { feePct: 0.0000, spreadPct: 0.0002 },
  forex:   { feePct: 0.0000, spreadPct: 0.0001 },
  stocks:  { feePct: 0.0005, spreadPct: 0.0002 },
  metals:  { feePct: 0.0002, spreadPct: 0.0003 },
  energy:  { feePct: 0.0002, spreadPct: 0.0003 },
};

// Clé d'actif réel → classe (miroir statique du catalogue marketData.ASSET_CLASSES —
// pas d'import pour rester sans cycle ; l'appartenance est testée en CI).
export const REAL_ASSET_CLASS = {
  BTC: "crypto", ETH: "crypto", SOL: "crypto", BNB: "crypto", XRP: "crypto",
  SPX: "indices", NDX: "indices", DJI: "indices", RUT: "indices", DAX: "indices",
  EURUSD: "forex", GBPUSD: "forex", USDJPY: "forex", AUDUSD: "forex", USDCAD: "forex",
  AAPL: "stocks", MSFT: "stocks", NVDA: "stocks", TSLA: "stocks", AMZN: "stocks",
  GOLD: "metals", SILVER: "metals", COPPER: "metals", PLATINUM: "metals",
  WTI: "energy", BRENT: "energy", NATGAS: "energy",
};

// Résout le spec de coûts pour une clé : contrat futures OU actif réel.
// Jamais de fallback silencieux vers un mauvais actif : clé inconnue → MES documenté
// via `fallback: true` (les outils peuvent l'afficher).
export function resolveSpec(key) {
  if (CONTRACTS[key]) return CONTRACTS[key];
  const cls = REAL_ASSET_CLASS[key];
  if (cls) return { name: key, pv: 1, tick: 0.01, fractional: true, ...REAL_CLASS_SPECS[cls], class: cls };
  return { ...CONTRACTS.MES, fallback: true };
}

// Coût ALLER-RETOUR d'un trade pour un spec donné.
//   futures : 2 × (commission + slippage × tick × pv) × qty        (indépendant du prix)
//   réel    : feePct × (entrée + sortie) × qty + spreadPct × entrée × qty  (notionnel)
export function roundTripCost(spec, qty, entry, exit) {
  if (spec.feePct != null) return spec.feePct * (entry + exit) * qty + (spec.spreadPct || 0) * entry * qty;
  return 2 * (spec.commission * qty + spec.slippage * spec.tick * spec.pv * qty);
}
