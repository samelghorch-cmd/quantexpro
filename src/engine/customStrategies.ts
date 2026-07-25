// Stratégies CUSTOM — la boucle création → librairie.
// Une règle créée dans Core Mode ou l'Importer est validée, persistée (localStorage),
// puis compilée et FUSIONNÉE dans la librairie : elle devient une stratégie numérotée
// (#9001+) utilisable partout — Backtest, Optimizer, FAO, dossiers, collector 24/7.
// IDs ≥ 9001 : jamais de collision avec les stratégies intégrées (1..~701).
import { compileRules, RULE_SOURCES, RULE_OPS, type RuleCond, type RuleSet } from "./ruleBuilder.ts";
import { buildStrategyLibrary } from "./strategyLibrary.ts";

const LS_KEY = "quantexpro:customStrategies:v1";
export const CUSTOM_ID_BASE = 9000;
export const CUSTOM_CAT = "z";

interface CustomDef { id: number; name: string; rules: RuleSet; createdAt: number; }

const SOURCE_IDS = new Set(RULE_SOURCES.map((s) => s.id));
const OP_IDS = new Set(RULE_OPS.map((o) => o.id));
const hasLS = () => typeof localStorage !== "undefined";

// Validation STRICTE d'un jeu de règles — lève une Error explicite (jamais d'échec
// silencieux : une config invalide qui donnerait « 0 trades » sans raison est un piège).
// Retourne les règles normalisées (champs connus uniquement).
export function validateRules(rules: any): RuleSet {
  if (!rules || typeof rules !== "object") throw new Error("Champ 'rules' manquant ou invalide (objet { long, short } attendu).");
  const sides = ["long", "short"] as const;
  const norm: { long: RuleCond[]; short: RuleCond[] } = { long: [], short: [] };
  for (const side of sides) {
    const conds = rules[side] ?? [];
    if (!Array.isArray(conds)) throw new Error(`'rules.${side}' doit être un tableau de conditions.`);
    conds.forEach((c, k) => {
      const where = `condition ${side}[${k}]`;
      if (!c || typeof c !== "object") throw new Error(`${where} : objet { left, op, right } attendu.`);
      for (const key of ["left", "op", "right"]) {
        if (c[key] == null) throw new Error(`${where} : champ '${key}' manquant (schéma : { left, op, right, rightConst? }).`);
      }
      if (!SOURCE_IDS.has(c.left)) throw new Error(`${where} : source inconnue '${c.left}'. Sources valides : ${[...SOURCE_IDS].join(", ")}.`);
      if (!OP_IDS.has(c.op)) throw new Error(`${where} : opérateur inconnu '${c.op}'. Ops valides : ${[...OP_IDS].join(", ")}.`);
      if (!SOURCE_IDS.has(c.right)) throw new Error(`${where} : source inconnue '${c.right}'. Sources valides : ${[...SOURCE_IDS].join(", ")}.`);
      if (c.right === "const" && !Number.isFinite(Number(c.rightConst))) throw new Error(`${where} : 'rightConst' doit être un nombre quand right = "const".`);
      norm[side].push({ left: c.left, op: c.op, right: c.right, ...(c.right === "const" ? { rightConst: Number(c.rightConst) } : {}) });
    });
  }
  if (norm.long.length === 0 && norm.short.length === 0) throw new Error("Au moins une condition LONG ou SHORT est requise.");
  return norm;
}

export function loadCustomDefs(): CustomDef[] {
  if (!hasLS()) return [];
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]") || []; } catch { return []; }
}

function persist(defs: CustomDef[]) {
  if (hasLS()) localStorage.setItem(LS_KEY, JSON.stringify(defs));
}

// Valide + persiste une définition. Retourne la def complète (avec id attribué).
export function saveCustomDef({ name, rules }: { name?: string; rules?: unknown }): CustomDef {
  const norm = validateRules(rules);
  const defs = loadCustomDefs();
  const id = defs.reduce((m, d) => Math.max(m, d.id), CUSTOM_ID_BASE) + 1;
  const def = { id, name: String(name || "").trim() || `Règle custom ${id - CUSTOM_ID_BASE}`, rules: norm, createdAt: Date.now() };
  persist([...defs, def]);
  return def;
}

export function deleteCustomDef(id: number) {
  persist(loadCustomDefs().filter((d) => d.id !== id));
}

// Def JSON → entrée de librairie (même forme que les stratégies intégrées, + custom/rules
// pour que les consommateurs — collector, export — sachent transporter la définition).
export function compileCustomDef(def: CustomDef) {
  return { id: def.id, name: def.name, cat: CUSTOM_CAT, eval: compileRules(def.rules), custom: true, rules: def.rules };
}

// Librairie complète = intégrées + customs. C'est CE build que le pipeline doit utiliser.
export function buildFullLibrary() {
  return [...buildStrategyLibrary(), ...loadCustomDefs().map(compileCustomDef)];
}
