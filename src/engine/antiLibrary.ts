// Anti-Library — registre des concepts involutifs (P1-ANT / P6-TS-MORE).
// Empêche le re-screening / re-optimisation inutile de familles qui échouent
// systématiquement aux backtests (spec Alpha Forge). Persisté en localStorage ;
// le worker Usine reçoit un snapshot d'IDs bloqués (pas d'accès LS dans le worker).

const LS_KEY = "quantexpro:antiLibrary:v1";

const hasLS = (): boolean => typeof localStorage !== "undefined";
const uid = (): string =>
  `al-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export interface SeedConcept {
  conceptId: string;
  label: string;
  reason: string;
  namePattern: string;
  strategyIds: number[];
}

export interface AntiEntry {
  id: string;
  conceptId: string;
  label: string;
  reason: string;
  namePattern: string;
  strategyIds: number[];
  seeded: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface StratRef {
  id?: number | string;
  name?: string;
}

/**
 * Concepts seedés (spec Module 2). `namePattern` = regex (case-insensitive) sur le nom
 * de stratégie ; `strategyIds` = IDs explicites de la librairie.
 */
export const SEED_CONCEPTS: readonly SeedConcept[] = [
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

function normalizeEntry(
  raw: Partial<AntiEntry> & Record<string, unknown>,
): AntiEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const conceptId = String(raw.conceptId || "").trim();
  if (!conceptId) return null;
  return {
    id: (raw.id as string) || uid(),
    conceptId,
    label: String(raw.label || conceptId).trim(),
    reason: String(raw.reason || "").trim(),
    namePattern: raw.namePattern ? String(raw.namePattern) : "",
    strategyIds: Array.isArray(raw.strategyIds)
      ? [...new Set(raw.strategyIds.map(Number).filter((n) => Number.isFinite(n)))]
      : [],
    seeded: Boolean(raw.seeded),
    createdAt: (raw.createdAt as number) || Date.now(),
    updatedAt: raw.updatedAt as number | undefined,
  };
}

export function loadAntiLibrary(): AntiEntry[] {
  if (!hasLS()) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((e) => normalizeEntry(e as Partial<AntiEntry> & Record<string, unknown>))
      .filter((e): e is AntiEntry => Boolean(e));
  } catch {
    return [];
  }
}

function persist(entries: AntiEntry[]): void {
  if (hasLS()) localStorage.setItem(LS_KEY, JSON.stringify(entries));
}

/** Insère les concepts seedés manquants (idempotent). Retourne la liste complète. */
export function ensureSeeded(): AntiEntry[] {
  const cur = loadAntiLibrary();
  const have = new Set(cur.map((e) => e.conceptId));
  const added: AntiEntry[] = [];
  for (const seed of SEED_CONCEPTS) {
    if (have.has(seed.conceptId)) continue;
    const entry = normalizeEntry({ ...seed, seeded: true, createdAt: Date.now() });
    if (entry) added.push(entry);
  }
  if (added.length === 0) return cur;
  const next = [...cur, ...added];
  persist(next);
  return next;
}

export function addAntiEntry({
  conceptId,
  label,
  reason,
  namePattern,
  strategyIds,
}: {
  conceptId?: string;
  label?: string;
  reason?: string;
  namePattern?: string;
  strategyIds?: number[];
} = {}): AntiEntry {
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
  if (!entry) throw new Error("conceptId requis");
  const next = [...entries, entry];
  persist(next);
  return entry;
}

export function removeAntiEntry(entryId: string): AntiEntry[] {
  const next = loadAntiLibrary().filter((e) => e.id !== entryId);
  persist(next);
  return next;
}

export function clearAntiLibrary({ keepSeeded = true }: { keepSeeded?: boolean } = {}): AntiEntry[] {
  const next = keepSeeded
    ? SEED_CONCEPTS.map((s) =>
        normalizeEntry({ ...s, seeded: true, createdAt: Date.now() }),
      ).filter((e): e is AntiEntry => Boolean(e))
    : [];
  persist(next);
  return next;
}

/** True si la stratégie matche une entrée (id explicite ou regex sur le nom). */
export function isStrategyBlocked(
  strat: StratRef | null | undefined,
  entries: AntiEntry[] | null = null,
): boolean {
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
export function findBlockingEntry(
  strat: StratRef | null | undefined,
  entries: AntiEntry[] | null = null,
): AntiEntry | null {
  if (!strat) return null;
  const list = entries || ensureSeeded();
  const name = String(strat.name || "");
  const sid = Number(strat.id);
  for (const e of list) {
    if (e.strategyIds.includes(sid)) return e;
    if (e.namePattern) {
      try {
        if (new RegExp(e.namePattern, "i").test(name)) return e;
      } catch {
        /* noop */
      }
    }
  }
  return null;
}

export function filterLibrary<T extends StratRef>(
  library: T[] | null | undefined,
  entries: AntiEntry[] | null = null,
): T[] {
  const list = entries || ensureSeeded();
  return (library || []).filter((s) => !isStrategyBlocked(s, list));
}

/** Snapshot d'IDs bloqués pour le worker Usine (pas de localStorage dans le worker). */
export function blockedStrategyIds(
  library: StratRef[] | null | undefined,
  entries: AntiEntry[] | null = null,
): Array<number | string | undefined> {
  const list = entries || ensureSeeded();
  return (library || []).filter((s) => isStrategyBlocked(s, list)).map((s) => s.id);
}
