// BOUCLE CRÉATION → LIBRAIRIE — tests du store de stratégies custom.
// Garanties : validation STRICTE (jamais de « 0 trades » silencieux sur schéma invalide),
// persistance localStorage, ids sans collision (≥ 9001), fusion dans la librairie complète,
// et le compilé custom produit EXACTEMENT les mêmes trades que compileRules direct.
import { describe, it, expect, beforeEach } from "vitest";
import {
  validateRules, saveCustomDef, loadCustomDefs, deleteCustomDef,
  compileCustomDef, buildFullLibrary, CUSTOM_ID_BASE, CUSTOM_CAT,
} from "../../src/engine/customStrategies.js";
import { compileRules } from "../../src/engine/ruleBuilder.js";
import { buildStrategyLibrary, CATS } from "../../src/engine/strategyLibrary.js";
import { runBacktestExt } from "../../src/engine/backtestExtended.js";
import { buildContext } from "../../src/engine/context.js";
import { makeBars } from "../helpers/fixtures.js";

// Stub localStorage (environnement node)
beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
});

const GOOD_RULES = {
  long: [{ left: "close", op: "crossUp", right: "ema20" }],
  short: [{ left: "close", op: "crossDn", right: "ema20" }],
};

describe("validateRules — validation stricte, erreurs explicites", () => {
  it("accepte un jeu de règles valide et le normalise", () => {
    const norm = validateRules({ long: [{ left: "rsi14", op: "gt", right: "const", rightConst: "50", extra: "ignoré" }], short: [] });
    expect(norm.long[0]).toEqual({ left: "rsi14", op: "gt", right: "const", rightConst: 50 });
    expect(norm.long[0].extra).toBeUndefined();
  });

  it("rejette l'ancien piège silencieux : schéma a/b au lieu de left/right", () => {
    expect(() => validateRules({ long: [{ a: "close", op: "crossUp", b: "ema20" }], short: [] }))
      .toThrow(/champ 'left' manquant/);
  });

  it("rejette source inconnue, opérateur inconnu, const non numérique, rules absent", () => {
    expect(() => validateRules({ long: [{ left: "ema9999", op: "gt", right: "close" }] })).toThrow(/source inconnue 'ema9999'/);
    expect(() => validateRules({ long: [{ left: "close", op: "above", right: "ema20" }] })).toThrow(/opérateur inconnu 'above'/);
    expect(() => validateRules({ long: [{ left: "close", op: "gt", right: "const", rightConst: "abc" }] })).toThrow(/rightConst/);
    expect(() => validateRules(null)).toThrow(/'rules' manquant/);
    expect(() => validateRules({ long: [], short: [] })).toThrow(/Au moins une condition/);
  });
});

describe("saveCustomDef / loadCustomDefs — persistance et ids", () => {
  it("attribue des ids séquentiels ≥ 9001 et persiste", () => {
    const a = saveCustomDef({ name: "Ma règle", rules: GOOD_RULES });
    const b = saveCustomDef({ name: "", rules: GOOD_RULES });
    expect(a.id).toBe(CUSTOM_ID_BASE + 1);
    expect(b.id).toBe(CUSTOM_ID_BASE + 2);
    expect(b.name).toMatch(/Règle custom/); // nom par défaut
    expect(loadCustomDefs().map((d) => d.id)).toEqual([9001, 9002]);
    deleteCustomDef(9001);
    expect(loadCustomDefs().map((d) => d.id)).toEqual([9002]);
    // pas de réutilisation d'id après suppression partielle
    expect(saveCustomDef({ name: "c", rules: GOOD_RULES }).id).toBe(9003);
  });

  it("refuse de sauvegarder des règles invalides", () => {
    expect(() => saveCustomDef({ name: "x", rules: { long: [{ left: "nope", op: "gt", right: "close" }] } })).toThrow(/source inconnue/);
    expect(loadCustomDefs()).toEqual([]);
  });
});

describe("buildFullLibrary — fusion intégrées + customs", () => {
  it("la librairie complète contient les customs, catégorie déclarée, zéro collision d'id", () => {
    saveCustomDef({ name: "Custom A", rules: GOOD_RULES });
    const base = buildStrategyLibrary();
    const full = buildFullLibrary();
    expect(full.length).toBe(base.length + 1);
    const custom = full.find((s) => s.id === 9001);
    expect(custom.custom).toBe(true);
    expect(custom.cat).toBe(CUSTOM_CAT);
    expect(CATS[CUSTOM_CAT].name).toBe("Custom");
    expect(custom.rules).toEqual(validateRules(GOOD_RULES));
    const ids = new Set(full.map((s) => s.id));
    expect(ids.size).toBe(full.length); // aucune collision
  });

  it("sans localStorage (Node/collector) : librairie de base, pas de crash", () => {
    delete globalThis.localStorage;
    expect(buildFullLibrary().length).toBe(buildStrategyLibrary().length);
  });
});

describe("Parité création → exécution", () => {
  it("le custom compilé produit EXACTEMENT les mêmes trades que compileRules direct", () => {
    const def = saveCustomDef({ name: "Parité", rules: GOOD_RULES });
    const bars = makeBars({ n: 400, seed: 321, vol: 12, drift: 0.3 });
    const ctx = buildContext(bars);
    const params = { contract: "MES", capital: 100000, direction: "both", slAtr: 2 };
    const viaLib = runBacktestExt(bars, ctx, compileCustomDef(def).eval, params);
    const direct = runBacktestExt(bars, ctx, compileRules(GOOD_RULES), params);
    expect(viaLib.trades).toEqual(direct.trades);
    expect(viaLib.totalPnL).toBe(direct.totalPnL);
  });
});
