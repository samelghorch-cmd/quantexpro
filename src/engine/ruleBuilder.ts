// Rule Builder — compile un AST de conditions (LONG/SHORT, AND) en closure (ctx,i)=>{long,short}.
// PAS d'eval() de chaîne utilisateur : chaque condition est un objet interprété.
// P4-CORE / P9-TS-RULE

export type RuleOpId = "gt" | "lt" | "crossUp" | "crossDn";

export interface RuleCtx {
  close?: number[];
  open?: number[];
  ema?: Record<number, number[]>;
  sma?: Record<number, number[]>;
  rsi?: Record<number, number[]>;
  vwap?: number[];
  adx14?: { adx?: number[] };
  atr14?: number[];
  macd?: Record<string, { macd?: number[]; sig?: number[] }>;
  bb?: Record<string, { up?: number[]; lo?: number[] }>;
  kama?: Record<number, number[]>;
  linreg?: Record<number, number[]>;
  ich?: Record<string, { tk?: number[]; kj?: number[]; spanA?: number[]; spanB?: number[] }>;
  [key: string]: unknown;
}

export type RuleSourceGet = (ctx: RuleCtx, i: number, v?: number) => number | undefined;

export interface RuleSource {
  id: string;
  label: string;
  get: RuleSourceGet;
}

export interface RuleOp {
  id: RuleOpId | string;
  label: string;
}

export interface RuleCond {
  left: string;
  op: string;
  right: string;
  rightConst?: number | string;
}

export interface RuleSet {
  long?: RuleCond[];
  short?: RuleCond[];
}

export interface RuleSignal {
  long: boolean;
  short: boolean;
}

export type CompiledRules = (ctx: RuleCtx, i: number) => RuleSignal;

// Sources disponibles (mappées vers ctx)
export const RULE_SOURCES: RuleSource[] = [
  { id: "close", label: "Close", get: (ctx, i) => ctx.close?.[i] },
  { id: "open", label: "Open", get: (ctx, i) => ctx.open?.[i] },
  { id: "ema20", label: "EMA 20", get: (ctx, i) => ctx.ema?.[20]?.[i] },
  { id: "ema50", label: "EMA 50", get: (ctx, i) => ctx.ema?.[50]?.[i] },
  { id: "ema200", label: "EMA 200", get: (ctx, i) => ctx.ema?.[200]?.[i] },
  { id: "sma20", label: "SMA 20", get: (ctx, i) => ctx.sma?.[20]?.[i] },
  { id: "rsi14", label: "RSI 14", get: (ctx, i) => ctx.rsi?.[14]?.[i] },
  { id: "rsi2", label: "RSI 2", get: (ctx, i) => ctx.rsi?.[2]?.[i] },
  { id: "vwap", label: "VWAP", get: (ctx, i) => ctx.vwap?.[i] },
  { id: "adx14", label: "ADX 14", get: (ctx, i) => ctx.adx14?.adx?.[i] },
  { id: "atr14", label: "ATR 14", get: (ctx, i) => ctx.atr14?.[i] },
  { id: "macd", label: "MACD line", get: (ctx, i) => ctx.macd?.["12_26_9"]?.macd?.[i] },
  { id: "macdSig", label: "MACD signal", get: (ctx, i) => ctx.macd?.["12_26_9"]?.sig?.[i] },
  { id: "bbUp", label: "BB Upper", get: (ctx, i) => ctx.bb?.["20_2"]?.up?.[i] },
  { id: "bbLo", label: "BB Lower", get: (ctx, i) => ctx.bb?.["20_2"]?.lo?.[i] },
  { id: "kama10", label: "KAMA 10", get: (ctx, i) => ctx.kama?.[10]?.[i] },
  { id: "kama21", label: "KAMA 21", get: (ctx, i) => ctx.kama?.[21]?.[i] },
  { id: "linreg20", label: "LinReg 20", get: (ctx, i) => ctx.linreg?.[20]?.[i] },
  { id: "linreg50", label: "LinReg 50", get: (ctx, i) => ctx.linreg?.[50]?.[i] },
  { id: "ichTenkan", label: "Ichimoku Tenkan", get: (ctx, i) => ctx.ich?.["9_26"]?.tk?.[i] },
  { id: "ichKijun", label: "Ichimoku Kijun", get: (ctx, i) => ctx.ich?.["9_26"]?.kj?.[i] },
  { id: "ichSpanA", label: "Ichimoku Span A", get: (ctx, i) => ctx.ich?.["9_26"]?.spanA?.[i] },
  { id: "ichSpanB", label: "Ichimoku Span B", get: (ctx, i) => ctx.ich?.["9_26"]?.spanB?.[i] },
  { id: "const", label: "Valeur constante", get: (_ctx, _i, v) => v },
];

export const RULE_OPS: RuleOp[] = [
  { id: "gt", label: "> (au-dessus)" },
  { id: "lt", label: "< (en-dessous)" },
  { id: "crossUp", label: "croise au-dessus" },
  { id: "crossDn", label: "croise en-dessous" },
];

const srcGet = (id: string): RuleSourceGet =>
  RULE_SOURCES.find((s) => s.id === id)?.get || (() => NaN);

// condition : { left, op, right, rightConst }
function evalCondition(cond: RuleCond, ctx: RuleCtx, i: number): boolean {
  if (i < 1) return false;
  const lg = srcGet(cond.left);
  const rg = srcGet(cond.right);
  const L = lg(ctx, i);
  const Lp = lg(ctx, i - 1);
  const R = cond.right === "const" ? Number(cond.rightConst) : rg(ctx, i);
  const Rp = cond.right === "const" ? Number(cond.rightConst) : rg(ctx, i - 1);
  if ([L, R].some((v) => v === undefined || Number.isNaN(v as number))) return false;
  switch (cond.op) {
    case "gt": return (L as number) > (R as number);
    case "lt": return (L as number) < (R as number);
    case "crossUp": return (Lp as number) <= (Rp as number) && (L as number) > (R as number);
    case "crossDn": return (Lp as number) >= (Rp as number) && (L as number) < (R as number);
    default: return false;
  }
}

/** rules : { long: [cond...], short: [cond...] } — AND sur chaque côté */
export function compileRules(rules: RuleSet | null | undefined): CompiledRules {
  const longConds = rules?.long || [];
  const shortConds = rules?.short || [];
  return (ctx, i) => ({
    long: longConds.length > 0 && longConds.every((c) => evalCondition(c, ctx, i)),
    short: shortConds.length > 0 && shortConds.every((c) => evalCondition(c, ctx, i)),
  });
}

export function describeRule(cond: RuleCond): string {
  const l = RULE_SOURCES.find((s) => s.id === cond.left)?.label || cond.left;
  const op = RULE_OPS.find((o) => o.id === cond.op)?.label || cond.op;
  const r = cond.right === "const"
    ? cond.rightConst
    : (RULE_SOURCES.find((s) => s.id === cond.right)?.label || cond.right);
  return `${l} ${op} ${r}`;
}
