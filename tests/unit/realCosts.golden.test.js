// COÛTS PAR ACTIF RÉEL — golden tests du modèle proportionnel (fee % + spread %).
// Exigence due diligence : un backtest Bitcoin doit être facturé comme du Bitcoin
// (fee taker + spread en % du notionnel), pas comme un future Micro S&P.
// (Bug historique : `contract: symbol` avec symbol resté "MES" en mode réel.)
import { describe, it, expect } from "vitest";
import { CONTRACTS, REAL_ASSET_CLASS, REAL_CLASS_SPECS, resolveSpec, roundTripCost } from "../../src/engine/contracts.ts";
import { ALL_SYMBOLS } from "../../src/engine/marketData.ts";
import { runBacktestExt } from "../../src/engine/backtestExtended.ts";
import { minimalCtx, singleRoundTrip, DAY_MS, T0 } from "../helpers/fixtures.js";

describe("resolveSpec — résolution futures / actif réel", () => {
  it("clé futures → spec futures inchangé", () => {
    expect(resolveSpec("MES")).toBe(CONTRACTS.MES);
    expect(resolveSpec("GC")).toBe(CONTRACTS.GC);
  });

  it("actif réel → pv=1, fractionnable, coûts de sa classe", () => {
    const btc = resolveSpec("BTC");
    expect(btc.pv).toBe(1);
    expect(btc.fractional).toBe(true);
    expect(btc.feePct).toBe(REAL_CLASS_SPECS.crypto.feePct);
    expect(resolveSpec("EURUSD").spreadPct).toBe(REAL_CLASS_SPECS.forex.spreadPct);
    expect(resolveSpec("AAPL").class).toBe("stocks");
  });

  it("clé inconnue → fallback MES EXPLICITE (flag fallback, jamais silencieux)", () => {
    const s = resolveSpec("INCONNU");
    expect(s.fallback).toBe(true);
    expect(s.pv).toBe(CONTRACTS.MES.pv);
  });

  it("SYNCHRO : chaque actif du catalogue marketData a une classe de coûts", () => {
    // Si un actif est ajouté à ASSET_CLASSES sans entrée REAL_ASSET_CLASS, ce test casse.
    for (const s of ALL_SYMBOLS) {
      expect(REAL_ASSET_CLASS[s.key], `actif ${s.key} sans classe de coûts`).toBe(s.classId);
    }
  });
});

describe("roundTripCost — goldens calculés à la main", () => {
  it("futures MES : formule historique inchangée (2×(0.85 + 1×0.25×5) = $4.20)", () => {
    expect(roundTripCost(CONTRACTS.MES, 1, 5000, 5010)).toBeCloseTo(4.2, 9);
    expect(roundTripCost(CONTRACTS.MES, 3, 5000, 5010)).toBeCloseTo(12.6, 9); // ∝ qty
    // indépendant du prix pour les futures
    expect(roundTripCost(CONTRACTS.MES, 1, 99999, 1)).toBeCloseTo(4.2, 9);
  });

  it("crypto BTC : 0.5 BTC, 60 000 → 61 000 : fee 0.001×121000×0.5=60.5 + spread 0.0002×60000×0.5=6 → $66.50", () => {
    expect(roundTripCost(resolveSpec("BTC"), 0.5, 60000, 61000)).toBeCloseTo(66.5, 9);
  });

  it("forex EURUSD : fee 0, spread 1 pb du notionnel d'entrée seulement", () => {
    // qty 100 000 (1 lot), entrée 1.10 : 0.0001 × 1.10 × 100000 = $11
    expect(roundTripCost(resolveSpec("EURUSD"), 100000, 1.10, 1.20)).toBeCloseTo(11, 9);
  });

  it("le coût crypto DÉPEND du prix (notionnel) — contrairement aux futures", () => {
    const spec = resolveSpec("BTC");
    expect(roundTripCost(spec, 1, 60000, 60000)).toBeGreaterThan(roundTripCost(spec, 1, 30000, 30000) * 1.9);
  });
});

describe("Intégration moteur — aller-retour à prix constant sur actif réel", () => {
  it("BTC à prix constant 50 000 : perte = coût exact 0.001×100000 + 0.0002×50000 = $110", () => {
    const flat = Array.from({ length: 100 }, (_, i) => ({ o: 50000, h: 50000, l: 50000, c: 50000, v: 10, t: T0 + i * DAY_MS }));
    const res = runBacktestExt(flat, minimalCtx(flat, 100), singleRoundTrip(55, 60),
      { contract: "BTC", contracts: 1, capital: 100000, direction: "long", slAtr: 0 });
    expect(res.trades.length).toBe(1);
    expect(res.trades[0].pnl).toBeCloseTo(-110, 9);
  });

  it("le même trade sur spec MES aurait coûté $4.20 — l'écart BTC/futures est bien réel", () => {
    const flat = Array.from({ length: 100 }, (_, i) => ({ o: 50000, h: 50000, l: 50000, c: 50000, v: 10, t: T0 + i * DAY_MS }));
    const res = runBacktestExt(flat, minimalCtx(flat, 100), singleRoundTrip(55, 60),
      { contract: "MES", contracts: 1, capital: 100000, direction: "long", slAtr: 0 });
    expect(res.trades[0].pnl).toBeCloseTo(-4.2, 9);
  });
});
