// Rule Builder — compile un AST de conditions (LONG/SHORT, AND) en closure (ctx,i)=>{long,short}.
// PAS d'eval() de chaîne utilisateur : chaque condition est un objet interprété.

// Sources disponibles (mappées vers ctx)
export const RULE_SOURCES = [
  { id: "close", label: "Close", get: (ctx, i) => ctx.close[i] },
  { id: "open", label: "Open", get: (ctx, i) => ctx.open[i] },
  { id: "ema20", label: "EMA 20", get: (ctx, i) => ctx.ema[20]?.[i] },
  { id: "ema50", label: "EMA 50", get: (ctx, i) => ctx.ema[50]?.[i] },
  { id: "ema200", label: "EMA 200", get: (ctx, i) => ctx.ema[200]?.[i] },
  { id: "sma20", label: "SMA 20", get: (ctx, i) => ctx.sma[20]?.[i] },
  { id: "rsi14", label: "RSI 14", get: (ctx, i) => ctx.rsi[14]?.[i] },
  { id: "rsi2", label: "RSI 2", get: (ctx, i) => ctx.rsi[2]?.[i] },
  { id: "vwap", label: "VWAP", get: (ctx, i) => ctx.vwap?.[i] },
  { id: "adx14", label: "ADX 14", get: (ctx, i) => ctx.adx14?.adx?.[i] },
  { id: "atr14", label: "ATR 14", get: (ctx, i) => ctx.atr14?.[i] },
  { id: "macd", label: "MACD line", get: (ctx, i) => ctx.macd["12_26_9"]?.macd?.[i] },
  { id: "macdSig", label: "MACD signal", get: (ctx, i) => ctx.macd["12_26_9"]?.sig?.[i] },
  { id: "bbUp", label: "BB Upper", get: (ctx, i) => ctx.bb["20_2"]?.up?.[i] },
  { id: "bbLo", label: "BB Lower", get: (ctx, i) => ctx.bb["20_2"]?.lo?.[i] },
  { id: "const", label: "Valeur constante", get: (ctx, i, v) => v },
];

export const RULE_OPS = [
  { id: "gt", label: "> (au-dessus)" },
  { id: "lt", label: "< (en-dessous)" },
  { id: "crossUp", label: "croise au-dessus" },
  { id: "crossDn", label: "croise en-dessous" },
];

const srcGet = (id) => RULE_SOURCES.find((s) => s.id === id)?.get || (() => NaN);

// condition : { left, op, right, rightConst }
function evalCondition(cond, ctx, i) {
  if (i < 1) return false;
  const lg = srcGet(cond.left);
  const rg = srcGet(cond.right);
  const L = lg(ctx, i), Lp = lg(ctx, i - 1);
  const R = cond.right === "const" ? Number(cond.rightConst) : rg(ctx, i);
  const Rp = cond.right === "const" ? Number(cond.rightConst) : rg(ctx, i - 1);
  if ([L, R].some((v) => v === undefined || Number.isNaN(v))) return false;
  switch (cond.op) {
    case "gt": return L > R;
    case "lt": return L < R;
    case "crossUp": return Lp <= Rp && L > R;
    case "crossDn": return Lp >= Rp && L < R;
    default: return false;
  }
}

// rules : { long: [cond...], short: [cond...] } — AND sur chaque côté
export function compileRules(rules) {
  const longConds = rules.long || [];
  const shortConds = rules.short || [];
  return (ctx, i) => ({
    long: longConds.length > 0 && longConds.every((c) => evalCondition(c, ctx, i)),
    short: shortConds.length > 0 && shortConds.every((c) => evalCondition(c, ctx, i)),
  });
}

export function describeRule(cond) {
  const l = RULE_SOURCES.find((s) => s.id === cond.left)?.label || cond.left;
  const op = RULE_OPS.find((o) => o.id === cond.op)?.label || cond.op;
  const r = cond.right === "const" ? cond.rightConst : (RULE_SOURCES.find((s) => s.id === cond.right)?.label || cond.right);
  return `${l} ${op} ${r}`;
}
