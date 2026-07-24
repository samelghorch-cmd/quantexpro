// TESTS D'INTÉGRATION — CAUSALITÉ DU MOTEUR COMPLET
// Deux garanties de niveau due diligence, sur le VRAI pipeline (buildContext + librairie complète) :
//
//  A. Invariance par troncature du contexte : chaque indicateur précalculé par buildContext
//     doit valoir EXACTEMENT la même chose qu'on lui donne 600 barres ou seulement les 450
//     premières. Un indicateur qui change quand on ajoute du futur EST du look-ahead
//     (normalisation plein-échantillon, décalage forward type chikou, etc.).
//
//  B. Barrière temporelle sur TOUTE la librairie de stratégies : aucune des stratégies
//     réelles ne lit un indice > barre courante pendant un backtest complet.
//
// Parité recherche/exécution : le Collector Node importe LES MÊMES fichiers
// (../src/engine/*) que le dashboard — vérifié par le test C ci-dessous. Il n'existe
// donc qu'un seul moteur : ces tests couvrent les deux environnements à la fois.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildContext } from "../../src/engine/context.ts";
import { buildStrategyLibrary } from "../../src/engine/strategyLibrary.ts";
import { runBacktestExt } from "../../src/engine/backtestExtended.ts";
import { makeBars, makeCausalityGuard } from "../helpers/fixtures.js";

const N_FULL = 600;
const N_CUT = 450;

// Comparaison récursive de deux contextes sur [0, upto) — NaN ≡ NaN.
function collectMismatches(a, b, upto, pathName, out) {
  if (Array.isArray(a) && typeof a[a.length - 1] !== "object") {
    for (let i = 0; i < upto; i++) {
      const x = a[i], y = b[i];
      if (Object.is(x, y)) continue;
      if (typeof x === "number" && typeof y === "number" && (Number.isNaN(x) && Number.isNaN(y))) continue;
      if (typeof x === "number" && typeof y === "number" && Math.abs(x - y) < 1e-9) continue;
      out.push(`${pathName}[${i}] : ${x} ≠ ${y}`);
      if (out.length > 20) return; // assez pour diagnostiquer
    }
    return;
  }
  if (a && typeof a === "object") {
    for (const k of Object.keys(a)) {
      if (out.length > 20) return;
      collectMismatches(a[k], b?.[k], upto, `${pathName}.${k}`, out);
    }
  }
}

// P0-T4 (résolu) — computeVPIN calibre désormais bucketVolume sur une fenêtre d'amorce
// FIXE (les `calibBars` premières barres), plus jamais sur le volume de la série entière.
// vpinBvc / vpinCdf sont donc CAUSAUX : plus aucune exception tolérée ici. Le test A
// couvre maintenant l'intégralité du contexte, VPIN inclus (le test B ci-dessous vérifie
// en plus qu'aucune stratégie — dont vpinSpike — ne lit le futur).

describe("A — Invariance par troncature de buildContext (aucun indicateur ne lit le futur)", () => {
  const full = makeBars({ n: N_FULL, seed: 777, vol: 12, drift: 0.5 });
  const ctxFull = buildContext(full);
  const ctxCut = buildContext(full.slice(0, N_CUT));

  it(`ctx(${N_FULL} barres) ≡ ctx(${N_CUT} premières barres) sur [0, ${N_CUT}) — contexte complet, VPIN inclus`, () => {
    const mismatches = [];
    collectMismatches(ctxCut, ctxFull, N_CUT, "ctx", mismatches);
    expect(mismatches, `Indicateurs non causaux détectés :\n${mismatches.join("\n")}`).toEqual([]);
  });

  it("VPIN causal (P0-T4) : vpinBvc/vpinCdf identiques à la troncature", () => {
    const mismatches = [];
    for (const key of ["vpinBvc", "vpinCdf"]) {
      collectMismatches(ctxCut[key], ctxFull[key], N_CUT, `ctx.${key}`, mismatches);
    }
    expect(mismatches, `VPIN non causal :\n${mismatches.join("\n")}`).toEqual([]);
  });
});

describe("B — Barrière temporelle sur la librairie complète de stratégies", () => {
  it("aucune stratégie de la librairie ne lit un indice futur pendant un backtest", () => {
    const bars = makeBars({ n: 400, seed: 888, vol: 12, drift: 0.3 });
    const ctx = buildContext(bars);
    const library = buildStrategyLibrary();
    expect(library.length).toBeGreaterThan(100); // la librairie complète, pas un échantillon

    const offenders = [];
    for (const s of library) {
      const guard = makeCausalityGuard(ctx);
      try {
        runBacktestExt(bars, guard.guarded, guard.wrapStrategy(s.eval),
          { contract: "MES", contracts: 1, capital: 100000, direction: "both", slAtr: 2, tpAtr: 0, beAtr: 0 });
      } catch (e) {
        offenders.push(`${s.id} (${s.name}) : exception ${e.message}`);
        continue;
      }
      if (guard.violations.length > 0) {
        const v = guard.violations[0];
        offenders.push(`${s.id} (${s.name}) : lit ${v.path}[${v.index}] à la barre ${v.currentI}`);
      }
    }
    expect(offenders, `Stratégies avec look-ahead :\n${offenders.join("\n")}`).toEqual([]);
  }, 120000);
});

describe("C — Parité recherche/exécution (dashboard ↔ collector)", () => {
  it("le Collector Node importe le moteur depuis ../src/engine (un seul moteur, zéro divergence)", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const collector = readFileSync(path.join(here, "../../collector/index.js"), "utf8");
    // Si quelqu'un copie-colle un moteur local dans le collector, ce test casse.
    expect(collector).toMatch(/from "\.\.\/src\/engine\/strategyLibrary\.ts"/);
    expect(collector).toMatch(/from "\.\.\/src\/engine\/context\.ts"/);
    expect(collector).toMatch(/from "\.\.\/src\/engine\/backtestExtended\.ts"/);
    expect(collector).not.toMatch(/function runBacktest/); // pas de moteur dupliqué
  });
});
