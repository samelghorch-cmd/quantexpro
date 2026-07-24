// Anti-Library — registre des concepts involutifs (P1-ANT).
// Empêche le re-screening / re-optimisation inutile de familles qui échouent
// systématiquement aux backtests (spec Alpha Forge). Persisté en localStorage ;
// le worker Usine reçoit un snapshot d'IDs bloqués (pas d'accès LS dans le worker).
const LS_KEY = "quantexpro:antiLibrary:v1";

const hasLS = () => typeof localStorage !== "undefined";
const uid = () => `al-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Concepts seedés (spec Module 2). `namePattern` = regex (case-insensitive) sur le nom
 * de stratégie ; `strategyIds` = IDs explicites de la librairie.
 */
export const SEED_CONCEPTS = [
  {
    conceptId: "zscore_mr",
    label: "Z-Score Mean Reversion",
    reason: "Involutif systématique — mean-reversion Z-Score (spec Anti-Library)",
    namePattern: "z-?score",
    strategyIds: [21, 30, 74, 80, 85],
  },
  {
    conceptId: "bb_mr",
    label: "Bollinger Band Mean Reversion",
    reason: "Involutif systématique — bounce / %B / BB+RSI mean-reversion",
    namePattern: "bollinger.*bounce|bb %b|bb extreme|rsi \\+ bb|\\+ bb extreme",
    strategyIds: [17, 22],
  },
  {
    conceptId: "trix_mom",
    label: "TRIX Momentum (1983)",
    reason: "Involutif systématique — TRIX zero-cross / momentum 1983",
    namePattern: "\\btrix\\b",
    strategyIds: [50],
  },
  {
    conceptId: "lotka_volterra",
    label: "Modèle Proie-Prédateur (Lotka-Volterra)",
    reason: "Involutif systématique — analogie proie-prédateur non causal en trading",
    namePattern: "lotka|volterra|proie.?pr[eé]dateur|prey.?predator",
    strategyIds: [],
  },
  {
    conceptId: "stoch_resonance",
    label: "Résonance Stochastique",
    reason: "Involutif systématique — résonance stochastique non robuste hors labo",
    namePattern: "r[eé]sonance\\s*stoch|stoch(?:astic)?\\s*reson",
    strategyIds: [],
  },
];

function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const conceptId = String(raw.conceptId || "").trim();
  if (!conceptId) return null;
  return {
    id: raw.id || uid(),
    conceptId,
    label: String(raw.label || conceptId).trim(),
    reason: String(raw.reason || "").trim(),
    namePattern: raw.namePattern ? String(raw.namePattern) : "",
    strategyIds: Array.isArray(raw.strategyIds)
      ? [...new Set(raw.strategyIds.map(Number).filter((n) => Number.isFinite(n)))]
      : [],
    seeded: Boolean(raw.seeded),
    createdAt: raw.createdAt || Date.now(),
  };
}

export function loadAntiLibrary() {
  if (!hasLS()) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeEntry).filter(Boolean);
  } catch {
    return [];
  }
}

function persist(entries) {
  if (hasLS()) localStorage.setItem(LS_KEY, JSON.stringify(entries));
}

/** Insère les concepts seedés manquants (idempotent). Retourne la liste complète. */
export function ensureSeeded() {
  const cur = loadAntiLibrary();
  const have = new Set(cur.map((e) => e.conceptId));
  const added = [];
  for (const seed of SEED_CONCEPTS) {
    if (have.has(seed.conceptId)) continue;
    added.push(normalizeEntry({ ...seed, seeded: true, createdAt: Date.now() }));
  }
  if (added.length === 0) return cur;
  const next = [...cur, ...added];
  persist(next);
  return next;
}

export function addAntiEntry({ conceptId, label, reason, namePattern, strategyIds } = {}) {
  const id = String(conceptId || "").trim();
  if (!id) throw new Error("conceptId requis");
  const entries = ensureSeeded();
  if (entries.some((e) => e.conceptId === id)) {
    throw new Error(`Concept '${id}' déjà présent dans l'Anti-Library`);
  }
  const entry = normalizeEntry({
    conceptId: id,
    label: label || id,
    reason: reason || "Ajout manuel",
    namePattern: namePattern || "",
    strategyIds: strategyIds || [],
    seeded: false,
    createdAt: Date.now(),
  });
  const next = [...entries, entry];
  persist(next);
  return entry;
}

export function removeAntiEntry(entryId) {
  const next = loadAntiLibrary().filter((e) => e.id !== entryId);
  persist(next);
  return next;
}

export function clearAntiLibrary({ keepSeeded = true } = {}) {
  const next = keepSeeded
    ? SEED_CONCEPTS.map((s) => normalizeEntry({ ...s, seeded: true, createdAt: Date.now() }))
    : [];
  persist(next);
  return next;
}

/** True si la stratégie matche une entrée (id explicite ou regex sur le nom). */
export function isStrategyBlocked(strat, entries = null) {
  if (!strat) return false;
  const list = entries || ensureSeeded();
  const name = String(strat.name || "");
  const sid = Number(strat.id);
  for (const e of list) {
    if (e.strategyIds.includes(sid)) return true;
    if (e.namePattern) {
      try {
        if (new RegExp(e.namePattern, "i").test(name)) return true;
      } catch {
        /* pattern invalide → ignoré */
      }
    }
  }
  return false;
}

/** Entrée qui bloque (ou null). */
export function findBlockingEntry(strat, entries = null) {
  if (!strat) return null;
  const list = entries || ensureSeeded();
  const name = String(strat.name || "");
  const sid = Number(strat.id);
  for (const e of list) {
    if (e.strategyIds.includes(sid)) return e;
    if (e.namePattern) {
      try {
        if (new RegExp(e.namePattern, "i").test(name)) return e;
      } catch { /* noop */ }
    }
  }
  return null;
}

export function filterLibrary(library, entries = null) {
  const list = entries || ensureSeeded();
  return (library || []).filter((s) => !isStrategyBlocked(s, list));
}

/** Snapshot d'IDs bloqués pour le worker Usine (pas de localStorage dans le worker). */
export function blockedStrategyIds(library, entries = null) {
  const list = entries || ensureSeeded();
  return (library || []).filter((s) => isStrategyBlocked(s, list)).map((s) => s.id);
}
