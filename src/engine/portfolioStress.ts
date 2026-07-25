// Stress-test historique sur l'équité du portefeuille Usine (P1-PORT).
// Scénarios stylisés (ordres de grandeur SPX) : GFC 2008, Flash Crash 2010, COVID mars 2020.
// Pendant la fenêtre de stress, la décorrélation du panier s'effondre (corrSpike)
// et l'équité blend avec le facteur marché — diversification « qui disparaît en crise ».

/** Seuil institutionnel : MaxDD stressé au-delà → FAIL scénario. */
export const STRESS_MAX_DD_LIMIT = 0.4;

interface StressScenario {
  id: string;
  label: string;
  year: number;
  description?: string;
  corrSpike?: number;
  beta?: number;
  marketReturns: number[];
}

/**
 * Chemin géométrique déterministe : crash jusqu'à `trough` (ex. 0.45 = −55 %),
 * puis récupération jusqu'à `recoverTo` (ex. 0.65 = 65 % du pic).
 */
export function geometricCrashRecover({ trough, crashDays, recoverDays, recoverTo }: { trough: number; crashDays: number; recoverDays: number; recoverTo: number }) {
  const rets = [];
  const cDays = Math.max(1, crashDays | 0);
  const rDays = Math.max(1, recoverDays | 0);
  const crashFactor = Math.pow(trough, 1 / cDays);
  for (let i = 0; i < cDays; i++) rets.push(crashFactor - 1);
  const recoverFactor = Math.pow(recoverTo / trough, 1 / rDays);
  for (let i = 0; i < rDays; i++) rets.push(recoverFactor - 1);
  return rets;
}

/** Flash Crash : chute brutale + rebond court (stylisé 6 mai 2010). */
export function flashCrashPath() {
  return [-0.01, -0.025, -0.09, 0.05, 0.035, 0.02, 0.015, 0.01];
}

export const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: "gfc_2008",
    label: "Crise 2008 (GFC)",
    year: 2008,
    description: "Pic→creux ~−55 % (SPX Sep-08 → Mar-09), récupération partielle — corrélation → 1.",
    corrSpike: 0.92,
    beta: 1,
    marketReturns: geometricCrashRecover({ trough: 0.45, crashDays: 120, recoverDays: 80, recoverTo: 0.65 }),
  },
  {
    id: "flash_2010",
    label: "Flash Crash 2010",
    year: 2010,
    description: "Chute intraday ~−9 % puis rebond rapide — liquidité absente, corrSpike extrême.",
    corrSpike: 0.98,
    beta: 1,
    marketReturns: flashCrashPath(),
  },
  {
    id: "covid_2020",
    label: "Mars 2020 (COVID)",
    year: 2020,
    description: "Crash ~−34 % en ~1 mois puis V-shape — stress de liquidité généralisé.",
    corrSpike: 0.9,
    beta: 1,
    marketReturns: geometricCrashRecover({ trough: 0.66, crashDays: 23, recoverDays: 40, recoverTo: 1.05 }),
  },
];

export function metricsFromCurve(curve: number[]) {
  if (!curve || curve.length === 0) {
    return { maxDD: 0, final: 0, peak: 0, trough: 0, totalPnL: 0 };
  }
  let peak = curve[0];
  let trough = curve[0];
  let maxDD = 0;
  for (const eq of curve) {
    if (eq > peak) peak = eq;
    if (eq < trough) trough = eq;
    const dd = peak > 0 ? (peak - eq) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return {
    maxDD,
    final: curve[curve.length - 1],
    peak,
    trough,
    totalPnL: curve[curve.length - 1] - curve[0],
  };
}

/**
 * Applique un scénario sur une courbe d'équité.
 * Pendant la fenêtre : r* = (1−λ)·r_port + λ·β·r_mkt (λ = corrSpike).
 */
export function applyScenario(curve: number[], scenario: StressScenario, { beta }: { beta?: number } = {}) {
  if (!curve || curve.length < 2 || !scenario?.marketReturns?.length) return null;
  const b = beta ?? scenario.beta ?? 1;
  const lambda = scenario.corrSpike ?? 0.85;
  const shocks = scenario.marketReturns;

  const rPort = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1];
    rPort.push(prev !== 0 ? curve[i] / prev - 1 : 0);
  }

  // Ancre la fenêtre en 2ᵉ moitié (impact visible sur le final), clampée.
  let start = Math.max(0, Math.floor(rPort.length * 0.55) - Math.floor(shocks.length / 2));
  if (start + shocks.length > rPort.length) start = Math.max(0, rPort.length - shocks.length);

  const stressedR = rPort.map((r, i) => {
    const k = i - start;
    if (k < 0 || k >= shocks.length) return r;
    return (1 - lambda) * r + lambda * b * shocks[k];
  });

  const stressed = [curve[0]];
  for (const r of stressedR) stressed.push(stressed[stressed.length - 1] * (1 + r));

  const base = metricsFromCurve(curve);
  const sm = metricsFromCurve(stressed);
  return {
    scenarioId: scenario.id,
    label: scenario.label,
    year: scenario.year,
    description: scenario.description || "",
    curve: stressed,
    maxDD: sm.maxDD,
    baseMaxDD: base.maxDD,
    ddDelta: sm.maxDD - base.maxDD,
    finalEquity: sm.final,
    totalPnL: sm.totalPnL,
    corrSpike: lambda,
    window: { start, length: Math.min(shocks.length, rPort.length - start) },
  };
}

/**
 * Stress-test complet du portefeuille Usine.
 * @param {{ curve: number[], maxDD?: number }} portfolio
 * @param {{ maxDDLimit?: number, scenarios?: typeof STRESS_SCENARIOS, beta?: number }} [opts]
 */
export function stressPortfolio(
  portfolio: { curve: number[]; maxDD?: number },
  opts: { maxDDLimit?: number; scenarios?: StressScenario[]; beta?: number } = {},
) {
  if (!portfolio?.curve || portfolio.curve.length < 2) return null;
  const maxDDLimit = opts.maxDDLimit ?? STRESS_MAX_DD_LIMIT;
  const scenarios = opts.scenarios || STRESS_SCENARIOS;
  const results = scenarios.map((s) => {
    const r = applyScenario(portfolio.curve, s, opts);
    if (!r) return null;
    return { ...r, pass: r.maxDD <= maxDDLimit };
  }).filter((x) => x !== null);

  if (results.length === 0) return null;
  const worst = results.reduce((a, b) => (a.maxDD >= b.maxDD ? a : b));
  return {
    results,
    worst,
    allPass: results.every((r) => r.pass),
    maxDDLimit,
    baseMaxDD: portfolio.maxDD ?? metricsFromCurve(portfolio.curve).maxDD,
  };
}
