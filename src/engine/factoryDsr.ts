// Garde-fou DSR pour l'Usine à Stratégies (P1 / P9-TS-DSR).
// Même seuil que Reco Finale : un DSR < 50 % = résultat non significatif après nTrials essais
// (López de Prado 2014). Calculé sur les PnL des trades OOS, avec nTrials = essais de
// sélection sur la paire (screening + grille de refine).
import { deflatedSharpe } from "./backtestMetrics.ts";

export const FACTORY_DSR_MIN = 0.5;

export interface DsrResult {
  dsr: number;
  sr: number;
  srStar: number;
  sigmaSR: number;
  nTrials: number;
}

export interface TradePnL {
  pnl?: number;
}

export interface PassFactoryDsrOpts {
  oos?: boolean;
  minDsr?: number;
}

/** Nombre d'essais indépendants ayant concouru à la sélection sur une paire actif×TF. */
export function trialsForFactoryPair(screenedCount: number, gridSize: number): number {
  const s = Math.max(0, Number(screenedCount) || 0);
  const g = Math.max(0, Number(gridSize) || 0);
  return Math.max(1, s + g);
}

/** Calcule le DSR à partir des trades (doit exposer `.pnl`). */
export function evaluateFactoryDsr(
  trades: TradePnL[] | null | undefined,
  nTrials: number,
): DsrResult {
  const pnls = (trades || []).map((t) => t.pnl).filter((x): x is number => Number.isFinite(x));
  return deflatedSharpe(pnls, nTrials) as DsrResult;
}

/**
 * True si la variante survit au filtre anti-overfit.
 * - en OOS : DSR ≥ FACTORY_DSR_MIN obligatoire (NaN = rejeté)
 * - sans OOS (série trop courte) : on laisse passer (pas assez d'info pour déflater)
 */
export function passesFactoryDsr(
  dsrResult: Partial<DsrResult> | null | undefined,
  { oos = true, minDsr = FACTORY_DSR_MIN }: PassFactoryDsrOpts = {},
): boolean {
  if (!oos) return true;
  const dsr = dsrResult?.dsr;
  if (!Number.isFinite(dsr)) return false;
  return (dsr as number) >= minDsr;
}
