// P4-REV — reverse engineering d'un historique de signaux externes.
// Parse CSV/JSON → alignement causal sur barres → replay backtest → candidats Rule Builder.
import { RULE_SOURCES } from "./ruleBuilder.js";
import { runBacktestExt } from "./backtestExtended.js";

/**
 * Normalise une ligne signal → { t: number|null, side: 1|-1, raw? }.
 * side : 1 = long/buy, -1 = short/sell.
 */
export function normalizeSignalRow(raw) {
  if (raw == null) return null;
  if (typeof raw === "number") {
    const side = raw > 0 ? 1 : raw < 0 ? -1 : 0;
    if (!side) return null;
    return { t: null, side };
  }
  if (typeof raw !== "object") return null;

  let sideRaw = raw.side ?? raw.signal ?? raw.dir ?? raw.direction ?? raw.action;
  if (sideRaw == null && raw.long != null) sideRaw = raw.long ? 1 : -1;
  let side = 0;
  if (typeof sideRaw === "number") side = sideRaw > 0 ? 1 : sideRaw < 0 ? -1 : 0;
  else {
    const s = String(sideRaw || "").trim().toLowerCase();
    if (["1", "long", "buy", "l", "b", "+"].includes(s)) side = 1;
    else if (["-1", "short", "sell", "s", "-"].includes(s)) side = -1;
  }
  if (!side) return null;

  let t = raw.t ?? raw.time ?? raw.timestamp ?? raw.date ?? raw.datetime ?? null;
  if (typeof t === "string") {
    const ms = Date.parse(t);
    t = Number.isFinite(ms) ? ms : null;
  } else if (typeof t === "number") {
    // secondes unix → ms
    if (t > 0 && t < 1e12) t = t * 1000;
  } else {
    t = null;
  }

  return { t, side, label: raw.label || raw.note || null };
}

/**
 * Parse CSV (header flexible) ou JSON array / { signals: [] }.
 * @returns {{ signals: {t,side}[], format: string, errors: string[] }}
 */
export function parseSignalHistory(text) {
  const errors = [];
  const trimmed = String(text || "").trim();
  if (!trimmed) return { signals: [], format: "empty", errors: ["texte vide"] };

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const data = JSON.parse(trimmed);
      const rows = Array.isArray(data) ? data : data.signals || data.rows || data.data || [];
      const signals = [];
      for (const r of rows) {
        const n = normalizeSignalRow(r);
        if (n) signals.push(n);
        else errors.push(`ligne ignorée: ${JSON.stringify(r).slice(0, 80)}`);
      }
      return { signals, format: "json", errors };
    } catch (e) {
      return { signals: [], format: "json", errors: [e.message] };
    }
  }

  // CSV
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (!lines.length) return { signals: [], format: "csv", errors: ["CSV vide"] };
  const sep = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/^\uFEFF/, ""));
  const looksHeader = header.some((h) =>
    ["t", "time", "timestamp", "date", "datetime", "side", "signal", "dir", "direction", "action"].includes(h),
  );
  const start = looksHeader ? 1 : 0;
  const col = (names) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iT = looksHeader ? col(["t", "time", "timestamp", "date", "datetime"]) : 0;
  const iS = looksHeader ? col(["side", "signal", "dir", "direction", "action"]) : 1;

  const signals = [];
  for (let li = start; li < lines.length; li++) {
    const parts = lines[li].split(sep).map((p) => p.trim());
    const row = looksHeader
      ? {
          t: iT >= 0 ? parts[iT] : undefined,
          side: iS >= 0 ? parts[iS] : parts[1],
        }
      : { t: parts[0], side: parts[1] };
    const n = normalizeSignalRow(row);
    if (n) signals.push(n);
    else errors.push(`L${li + 1} ignorée`);
  }
  return { signals, format: "csv", errors };
}

/**
 * Aligne chaque signal sur l'index de barre causal : première barre avec t >= signal.t.
 * Sans timestamp : répartition séquentielle ignorée — exige t.
 * @returns {{ index: number, side: 1|-1, t: number|null }[]}
 */
export function alignSignalsToBars(signals, bars) {
  if (!bars?.length) return [];
  const aligned = [];
  let cursor = 0;
  const sorted = [...(signals || [])].filter((s) => s && s.side).sort((a, b) => {
    if (a.t == null && b.t == null) return 0;
    if (a.t == null) return 1;
    if (b.t == null) return -1;
    return a.t - b.t;
  });

  for (const s of sorted) {
    if (s.t == null) {
      // Pas de temps : skip (évite faux alignements)
      continue;
    }
    while (cursor < bars.length && (bars[cursor].t == null || bars[cursor].t < s.t)) cursor++;
    if (cursor >= bars.length) break;
    aligned.push({ index: cursor, side: s.side, t: s.t });
    // Autorise plusieurs signaux sur la même barre ; avance d'1 pour le suivant si même t
  }
  return aligned;
}

/** Map barIndex → { long, short } (dernier signal gagne si conflit). */
export function signalsToEvalMap(aligned) {
  const map = new Map();
  for (const a of aligned || []) {
    map.set(a.index, { long: a.side === 1, short: a.side === -1 });
  }
  return map;
}

export function makeExternalSignalEval(aligned) {
  const map = signalsToEvalMap(aligned);
  return (_ctx, i) => map.get(i) || { long: false, short: false };
}

/**
 * Replay des signaux externes via le moteur backtest étendu.
 */
export function replayExternalSignals(bars, ctx, aligned, params = {}) {
  const evalFn = makeExternalSignalEval(aligned);
  const res = runBacktestExt(bars, ctx, evalFn, {
    contract: params.contract || "MES",
    capital: params.capital ?? 100000,
    slAtr: params.slAtr ?? 2,
    tpAtr: params.tpAtr ?? 0,
    direction: "both",
    warmup: params.warmup ?? 1,
  });
  return {
    ...res,
    nSignals: aligned.length,
    nLong: aligned.filter((a) => a.side === 1).length,
    nShort: aligned.filter((a) => a.side === -1).length,
  };
}

/** Candidats Rule Builder explorés pour la rétro-ingénierie. */
export const REVERSE_CANDIDATES = [
  { left: "close", op: "gt", right: "ema20" },
  { left: "close", op: "lt", right: "ema20" },
  { left: "close", op: "gt", right: "ema50" },
  { left: "close", op: "lt", right: "ema50" },
  { left: "close", op: "gt", right: "ema200" },
  { left: "close", op: "lt", right: "ema200" },
  { left: "close", op: "crossUp", right: "ema20" },
  { left: "close", op: "crossDn", right: "ema20" },
  { left: "close", op: "crossUp", right: "ema50" },
  { left: "close", op: "crossDn", right: "ema50" },
  { left: "rsi14", op: "gt", right: "const", rightConst: 50 },
  { left: "rsi14", op: "lt", right: "const", rightConst: 50 },
  { left: "rsi14", op: "gt", right: "const", rightConst: 70 },
  { left: "rsi14", op: "lt", right: "const", rightConst: 30 },
  { left: "rsi2", op: "lt", right: "const", rightConst: 10 },
  { left: "rsi2", op: "gt", right: "const", rightConst: 90 },
  { left: "macd", op: "gt", right: "macdSig" },
  { left: "macd", op: "lt", right: "macdSig" },
  { left: "macd", op: "crossUp", right: "macdSig" },
  { left: "macd", op: "crossDn", right: "macdSig" },
  { left: "close", op: "gt", right: "vwap" },
  { left: "close", op: "lt", right: "vwap" },
  { left: "close", op: "gt", right: "bbUp" },
  { left: "close", op: "lt", right: "bbLo" },
  { left: "adx14", op: "gt", right: "const", rightConst: 25 },
];

function evalCond(cond, ctx, i) {
  if (i < 1) return false;
  const lg = RULE_SOURCES.find((s) => s.id === cond.left)?.get;
  const rg = RULE_SOURCES.find((s) => s.id === cond.right)?.get;
  if (!lg) return false;
  const L = lg(ctx, i);
  const Lp = lg(ctx, i - 1);
  const R = cond.right === "const" ? Number(cond.rightConst) : rg?.(ctx, i);
  const Rp = cond.right === "const" ? Number(cond.rightConst) : rg?.(ctx, i - 1);
  if ([L, R].some((v) => v === undefined || Number.isNaN(v))) return false;
  switch (cond.op) {
    case "gt":
      return L > R;
    case "lt":
      return L < R;
    case "crossUp":
      return Lp <= Rp && L > R;
    case "crossDn":
      return Lp >= Rp && L < R;
    default:
      return false;
  }
}

/**
 * Score les candidats : lift = P(cond|signaux side) / P(cond|baseline).
 * @returns {{ long: object[], short: object[], proposedRules: { long, short } }}
 */
export function reverseEngineerRules(bars, ctx, aligned, opts = {}) {
  const topK = opts.topK ?? 3;
  const minHits = opts.minHits ?? 2;
  const longIdx = aligned.filter((a) => a.side === 1).map((a) => a.index);
  const shortIdx = aligned.filter((a) => a.side === -1).map((a) => a.index);

  // Baseline : échantillon régulier de barres (pas look-ahead — indices passés uniquement)
  const baseline = [];
  const step = Math.max(1, Math.floor(bars.length / 200));
  for (let i = 50; i < bars.length; i += step) baseline.push(i);

  const scoreSide = (indices) => {
    if (!indices.length) return [];
    const scored = [];
    for (const cond of REVERSE_CANDIDATES) {
      let hits = 0;
      for (const i of indices) if (evalCond(cond, ctx, i)) hits++;
      let baseHits = 0;
      for (const i of baseline) if (evalCond(cond, ctx, i)) baseHits++;
      const pSig = hits / indices.length;
      const pBase = baseline.length ? baseHits / baseline.length : 0;
      const lift = pBase > 0.02 ? pSig / pBase : pSig > 0 ? 99 : 0;
      if (hits < minHits) continue;
      scored.push({
        ...cond,
        hits,
        n: indices.length,
        hitRate: pSig,
        baseRate: pBase,
        lift,
      });
    }
    scored.sort((a, b) => b.lift - a.lift || b.hitRate - a.hitRate);
    return scored.slice(0, Math.max(topK * 2, 8));
  };

  const longScores = scoreSide(longIdx);
  const shortScores = scoreSide(shortIdx);

  const pick = (scores) =>
    scores
      .filter((s) => (s.lift >= 1.15 && s.hitRate >= 0.35) || s.hitRate >= 0.6)
      .slice(0, topK)
      .map(({ left, op, right, rightConst }) => {
        const c = { left, op, right };
        if (right === "const") c.rightConst = rightConst;
        return c;
      });

  return {
    long: longScores,
    short: shortScores,
    proposedRules: {
      long: pick(longScores),
      short: pick(shortScores),
    },
    nLong: longIdx.length,
    nShort: shortIdx.length,
  };
}

/** Résumé texte pour UI. */
export function summarizeReverse(parsed, aligned, replay, reverse) {
  return {
    format: parsed.format,
    nParsed: parsed.signals.length,
    nAligned: aligned.length,
    nTrades: replay?.nTrades ?? 0,
    nProposedLong: reverse?.proposedRules?.long?.length ?? 0,
    nProposedShort: reverse?.proposedRules?.short?.length ?? 0,
  };
}
