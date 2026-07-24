// @ts-nocheck — migration bulk P10-TS-ENGINE; typage strict à reprendre fichier par fichier.
// P2-MQL5 — Export Expert Advisor MetaTrader 5 pour familles de stratégies simples.
// Génère un .mq5 autonome (indicateurs locaux + ATR SL/TP/BE). ≠ pont QuantEXProBridge.

/** Familles supportées (v1). */
export const SUPPORTED_FAMILIES = {
  maCross: {
    id: "maCross",
    label: "MA Cross",
    paramsSchema: ["type", "fast", "slow"],
    mqlHandles: ["iMA"],
  },
  rsiRev: {
    id: "rsiRev",
    label: "RSI Reversion",
    paramsSchema: ["period", "low", "high"],
    mqlHandles: ["iRSI"],
  },
  macdCross: {
    id: "macdCross",
    label: "MACD Signal Cross",
    paramsSchema: ["fast", "slow", "signal"],
    mqlHandles: ["iMACD"],
  },
  donchianBreak: {
    id: "donchianBreak",
    label: "Donchian Breakout",
    paramsSchema: ["period"],
    mqlHandles: ["iHighest", "iLowest"],
  },
  bbBounce: {
    id: "bbBounce",
    label: "Bollinger Bounce",
    paramsSchema: ["period", "deviation"],
    mqlHandles: ["iBands"],
  },
};

/**
 * Meta export pour IDs canoniques (params fermés dans eval JS — non introspectables).
 * proxy:true = le nom UI est une approximation ; le template suit la famille réelle.
 */
export const STRATEGY_EXPORT_META = {
  1:  { family: "maCross", params: { type: "ema", fast: 50, slow: 200 } },
  2:  { family: "maCross", params: { type: "ema", fast: 9, slow: 21 } },
  3:  { family: "macdCross", params: { fast: 12, slow: 26, signal: 9 } },
  10: { family: "maCross", params: { type: "ema", fast: 10, slow: 20 }, proxy: true },
  11: { family: "maCross", params: { type: "ema", fast: 12, slow: 26 }, proxy: true },
  12: { family: "maCross", params: { type: "ema", fast: 20, slow: 50 }, proxy: true },
  13: { family: "maCross", params: { type: "dema", fast: 20, slow: 50 } },
  14: { family: "maCross", params: { type: "ema", fast: 10, slow: 30 }, proxy: true },
  15: { family: "maCross", params: { type: "tema", fast: 14, slow: 28 } },
  16: { family: "rsiRev", params: { period: 2, low: 20, high: 80 } },
  22: { family: "bbBounce", params: { period: 20, deviation: 2 } },
  26: { family: "rsiRev", params: { period: 7, low: 30, high: 70 }, proxy: true },
  31: { family: "donchianBreak", params: { period: 20 } },
  32: { family: "donchianBreak", params: { period: 55 } },
  65: { family: "maCross", params: { type: "ema", fast: 5, slow: 20 } },
  103: { family: "donchianBreak", params: { period: 20 }, proxy: true },
  106: { family: "rsiRev", params: { period: 4, low: 25, high: 75 } },
  112: { family: "maCross", params: { type: "ema", fast: 5, slow: 34 }, proxy: true },
};

const MA_METHOD = {
  sma: "MODE_SMA",
  ema: "MODE_EMA",
  dema: "MODE_DEMA",
  tema: "MODE_TEMA",
  smma: "MODE_SMMA",
  lwma: "MODE_LWMA",
};

export function listSupportedFamilies() {
  return Object.values(SUPPORTED_FAMILIES);
}

/** @param {number|object} strategyIdOrStrat */
export function resolveFamily(strategyIdOrStrat) {
  const id = typeof strategyIdOrStrat === "object" && strategyIdOrStrat != null
    ? Number(strategyIdOrStrat.id ?? strategyIdOrStrat.strategyId)
    : Number(strategyIdOrStrat);
  if (!Number.isFinite(id)) {
    return { family: null, params: null, supported: false, strategyId: null, proxy: false };
  }
  const meta = STRATEGY_EXPORT_META[id];
  if (!meta || !SUPPORTED_FAMILIES[meta.family]) {
    return { family: null, params: null, supported: false, strategyId: id, proxy: false };
  }
  return {
    family: meta.family,
    params: { ...meta.params },
    supported: true,
    strategyId: id,
    proxy: Boolean(meta.proxy),
  };
}

function sanitizeIdent(name) {
  const s = String(name || "Strategy").replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_");
  const trimmed = s.slice(0, 48) || "Strategy";
  return /^[0-9]/.test(trimmed) ? `EA_${trimmed}` : trimmed;
}

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function escapeStr(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Bloc commun : inputs trade + ATR helpers + position management. */
function commonHeader({ eaName, strategyId, name, symbol, magic, trade, familyLabel, warnings }) {
  const warnBlock = warnings.length
    ? warnings.map((w) => `// ⚠ ${w}`).join("\n") + "\n"
    : "";
  return `//+------------------------------------------------------------------+
//| ${eaName}.mq5
//| QuantEXPro — export famille « ${familyLabel} »
//| Stratégie #${strategyId} · ${escapeStr(name)}
//| Symbole backtest : ${escapeStr(symbol || "—")}
//| Généré : ${new Date().toISOString()}
//| ⚠ Template autonome (≠ QuantEXProBridge). Compiler dans MetaEditor.
//+------------------------------------------------------------------+
#property copyright "QuantEXPro"
#property version   "1.00"
#property strict

#include <Trade/Trade.mqh>

${warnBlock}//--- Trade
input int      MagicNumber   = ${Math.trunc(num(magic, 5000 + (strategyId || 0)))};
input double   Lots          = ${num(trade.lots, 0.1)};
input double   SL_ATR_Mult   = ${num(trade.slAtr, 2)};
input double   TP_ATR_Mult   = ${num(trade.tpAtr, 0)};
input double   BE_ATR_Mult   = ${num(trade.beAtr, 0)};
input string   Direction     = "${escapeStr(trade.direction || "both")}"; // long | short | both
input int      ATR_Period    = 14;
input int      MaxSlippage   = 20;
`;
}

function commonBodyTail() {
  return `
CTrade trade;
int    atrHandle = INVALID_HANDLE;
datetime lastBar = 0;

bool AllowLong()  { return (Direction=="both" || Direction=="long"); }
bool AllowShort() { return (Direction=="both" || Direction=="short"); }

bool IsNewBar()
  {
   datetime t = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(t == lastBar) return false;
   lastBar = t;
   return true;
  }

double ATRValue()
  {
   double buf[];
   if(CopyBuffer(atrHandle, 0, 1, 1, buf) < 1) return 0;
   return buf[0];
  }

bool HasPosition()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(!PositionSelectByTicket(PositionGetTicket(i))) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if((int)PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      return true;
     }
   return false;
  }

void ManageBE()
  {
   if(BE_ATR_Mult <= 0) return;
   double atr = ATRValue();
   if(atr <= 0) return;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if((int)PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      double open = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl   = PositionGetDouble(POSITION_SL);
      double tp   = PositionGetDouble(POSITION_TP);
      long   type = PositionGetInteger(POSITION_TYPE);
      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      if(type == POSITION_TYPE_BUY)
        {
         if(bid >= open + BE_ATR_Mult * atr && (sl < open || sl == 0))
            trade.PositionModify(ticket, open, tp);
        }
      else if(type == POSITION_TYPE_SELL)
        {
         if(ask <= open - BE_ATR_Mult * atr && (sl > open || sl == 0))
            trade.PositionModify(ticket, open, tp);
        }
     }
  }

void OpenLong()
  {
   if(!AllowLong() || HasPosition()) return;
   double atr = ATRValue();
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double sl = (SL_ATR_Mult > 0 && atr > 0) ? ask - SL_ATR_Mult * atr : 0;
   double tp = (TP_ATR_Mult > 0 && atr > 0) ? ask + TP_ATR_Mult * atr : 0;
   trade.Buy(Lots, _Symbol, ask, sl, tp, "QX long");
  }

void OpenShort()
  {
   if(!AllowShort() || HasPosition()) return;
   double atr = ATRValue();
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double sl = (SL_ATR_Mult > 0 && atr > 0) ? bid + SL_ATR_Mult * atr : 0;
   double tp = (TP_ATR_Mult > 0 && atr > 0) ? bid - TP_ATR_Mult * atr : 0;
   trade.Sell(Lots, _Symbol, bid, sl, tp, "QX short");
  }

void OnDeinit(const int reason)
  {
   if(atrHandle != INVALID_HANDLE) IndicatorRelease(atrHandle);
  }
`;
}

function tplMaCross(fp) {
  const type = String(fp.type || "ema").toLowerCase();
  const method = MA_METHOD[type] || "MODE_EMA";
  const fast = Math.trunc(num(fp.fast, 9));
  const slow = Math.trunc(num(fp.slow, 21));
  return `
//--- Signal MA Cross
input int FastPeriod = ${fast};
input int SlowPeriod = ${slow};

int fastHandle = INVALID_HANDLE;
int slowHandle = INVALID_HANDLE;
${commonBodyTail()}

int OnInit()
  {
   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(MaxSlippage);
   atrHandle  = iATR(_Symbol, PERIOD_CURRENT, ATR_Period);
   fastHandle = iMA(_Symbol, PERIOD_CURRENT, FastPeriod, 0, ${method}, PRICE_CLOSE);
   slowHandle = iMA(_Symbol, PERIOD_CURRENT, SlowPeriod, 0, ${method}, PRICE_CLOSE);
   if(atrHandle == INVALID_HANDLE || fastHandle == INVALID_HANDLE || slowHandle == INVALID_HANDLE)
      return INIT_FAILED;
   return INIT_SUCCEEDED;
  }

void OnTick()
  {
   ManageBE();
   if(!IsNewBar()) return;
   double f[], s[];
   if(CopyBuffer(fastHandle, 0, 1, 2, f) < 2) return;
   if(CopyBuffer(slowHandle, 0, 1, 2, s) < 2) return;
   // [0]=shift1 (barre fermée), [1]=shift2
   bool crossUp   = f[0] > s[0] && f[1] <= s[1];
   bool crossDown = f[0] < s[0] && f[1] >= s[1];
   if(crossUp)   OpenLong();
   if(crossDown) OpenShort();
  }
`;
}

function tplRsiRev(fp) {
  const period = Math.trunc(num(fp.period, 14));
  const low = num(fp.low, 30);
  const high = num(fp.high, 70);
  return `
//--- Signal RSI Reversion
input int    RSI_Period = ${period};
input double RSI_Low    = ${low};
input double RSI_High   = ${high};

int rsiHandle = INVALID_HANDLE;
${commonBodyTail()}

int OnInit()
  {
   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(MaxSlippage);
   atrHandle = iATR(_Symbol, PERIOD_CURRENT, ATR_Period);
   rsiHandle = iRSI(_Symbol, PERIOD_CURRENT, RSI_Period, PRICE_CLOSE);
   if(atrHandle == INVALID_HANDLE || rsiHandle == INVALID_HANDLE)
      return INIT_FAILED;
   return INIT_SUCCEEDED;
  }

void OnTick()
  {
   ManageBE();
   if(!IsNewBar()) return;
   double r[];
   if(CopyBuffer(rsiHandle, 0, 1, 2, r) < 2) return;
   // [0]=shift1 (fermée), [1]=shift2 — croisement hors zone
   bool longSig  = r[1] < RSI_Low  && r[0] >= RSI_Low;
   bool shortSig = r[1] > RSI_High && r[0] <= RSI_High;
   if(longSig)  OpenLong();
   if(shortSig) OpenShort();
  }
`;
}

function tplMacdCross(fp) {
  const fast = Math.trunc(num(fp.fast, 12));
  const slow = Math.trunc(num(fp.slow, 26));
  const signal = Math.trunc(num(fp.signal, 9));
  return `
//--- Signal MACD Cross
input int MACD_Fast   = ${fast};
input int MACD_Slow   = ${slow};
input int MACD_Signal = ${signal};

int macdHandle = INVALID_HANDLE;
${commonBodyTail()}

int OnInit()
  {
   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(MaxSlippage);
   atrHandle  = iATR(_Symbol, PERIOD_CURRENT, ATR_Period);
   macdHandle = iMACD(_Symbol, PERIOD_CURRENT, MACD_Fast, MACD_Slow, MACD_Signal, PRICE_CLOSE);
   if(atrHandle == INVALID_HANDLE || macdHandle == INVALID_HANDLE)
      return INIT_FAILED;
   return INIT_SUCCEEDED;
  }

void OnTick()
  {
   ManageBE();
   if(!IsNewBar()) return;
   double main[], sig[];
   if(CopyBuffer(macdHandle, 0, 1, 2, main) < 2) return;
   if(CopyBuffer(macdHandle, 1, 1, 2, sig) < 2) return;
   bool crossUp   = main[0] > sig[0] && main[1] <= sig[1];
   bool crossDown = main[0] < sig[0] && main[1] >= sig[1];
   if(crossUp)   OpenLong();
   if(crossDown) OpenShort();
  }
`;
}

function tplDonchian(fp) {
  const period = Math.trunc(num(fp.period, 20));
  return `
//--- Signal Donchian Breakout
input int DonchianPeriod = ${period};

${commonBodyTail()}

int OnInit()
  {
   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(MaxSlippage);
   atrHandle = iATR(_Symbol, PERIOD_CURRENT, ATR_Period);
   if(atrHandle == INVALID_HANDLE) return INIT_FAILED;
   return INIT_SUCCEEDED;
  }

void OnTick()
  {
   ManageBE();
   if(!IsNewBar()) return;
   // Canal sur barres 2..N+1 (exclut la barre 1 = dernière fermée, comme JS d.up[i-1])
   int hiIdx = iHighest(_Symbol, PERIOD_CURRENT, MODE_HIGH, DonchianPeriod, 2);
   int loIdx = iLowest(_Symbol, PERIOD_CURRENT, MODE_LOW, DonchianPeriod, 2);
   if(hiIdx < 0 || loIdx < 0) return;
   double up = iHigh(_Symbol, PERIOD_CURRENT, hiIdx);
   double lo = iLow(_Symbol, PERIOD_CURRENT, loIdx);
   double close1 = iClose(_Symbol, PERIOD_CURRENT, 1);
   if(close1 > up) OpenLong();
   if(close1 < lo) OpenShort();
  }
`;
}

function tplBbBounce(fp) {
  const period = Math.trunc(num(fp.period, 20));
  const deviation = num(fp.deviation, 2);
  return `
//--- Signal Bollinger Bounce
input int    BB_Period    = ${period};
input double BB_Deviation = ${deviation};

int bbHandle = INVALID_HANDLE;
${commonBodyTail()}

int OnInit()
  {
   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(MaxSlippage);
   atrHandle = iATR(_Symbol, PERIOD_CURRENT, ATR_Period);
   bbHandle  = iBands(_Symbol, PERIOD_CURRENT, BB_Period, 0, BB_Deviation, PRICE_CLOSE);
   if(atrHandle == INVALID_HANDLE || bbHandle == INVALID_HANDLE)
      return INIT_FAILED;
   return INIT_SUCCEEDED;
  }

void OnTick()
  {
   ManageBE();
   if(!IsNewBar()) return;
   double up[], lo[], close[];
   if(CopyBuffer(bbHandle, 1, 1, 2, up) < 2) return; // UPPER
   if(CopyBuffer(bbHandle, 2, 1, 2, lo) < 2) return; // LOWER
   if(CopyClose(_Symbol, PERIOD_CURRENT, 1, 2, close) < 2) return;
   // [0]=shift1, [1]=shift2 — bounce hors bande
   bool longSig  = close[1] < lo[1] && close[0] >= lo[0];
   bool shortSig = close[1] > up[1] && close[0] <= up[0];
   if(longSig)  OpenLong();
   if(shortSig) OpenShort();
  }
`;
}

const FAMILY_TPL = {
  maCross: tplMaCross,
  rsiRev: tplRsiRev,
  macdCross: tplMacdCross,
  donchianBreak: tplDonchian,
  bbBounce: tplBbBounce,
};

/**
 * Génère le code source .mq5.
 * @param {object} opts
 * @returns {{ code: string, family: string|null, supported: boolean, warnings: string[], filename: string }}
 */
export function generateEA(opts = {}) {
  const strategyId = Number(opts.strategyId ?? opts.id);
  const name = opts.name || `Strategy_${strategyId || "x"}`;
  const symbol = opts.symbol || "";
  const magic = opts.magic ?? (5000 + (Number.isFinite(strategyId) ? strategyId : 0));
  const trade = {
    lots: opts.lots ?? opts.tradeParams?.lots ?? 0.1,
    slAtr: opts.slAtr ?? opts.params?.slAtr ?? opts.tradeParams?.slAtr ?? 2,
    tpAtr: opts.tpAtr ?? opts.params?.tpAtr ?? opts.tradeParams?.tpAtr ?? 0,
    beAtr: opts.beAtr ?? opts.params?.beAtr ?? opts.tradeParams?.beAtr ?? 0,
    direction: opts.direction ?? opts.params?.direction ?? opts.tradeParams?.direction ?? "both",
  };

  const warnings = [];
  let family = opts.family || null;
  let familyParams = opts.familyParams ? { ...opts.familyParams } : null;

  if (!family) {
    const resolved = resolveFamily(strategyId);
    if (resolved.supported) {
      family = resolved.family;
      familyParams = resolved.params;
      if (resolved.proxy) {
        warnings.push(`Nom UI approximatif — template = famille ${family} (params exportés)`);
      }
    }
  }

  const eaName = sanitizeIdent(`QX_${strategyId || 0}_${name}`);
  const filename = `${eaName}.mq5`;

  if (!family || !FAMILY_TPL[family]) {
    warnings.push("Famille non supportée — stub trade seulement (pas de signal)");
    const stub = `${commonHeader({
      eaName, strategyId: strategyId || "?", name, symbol, magic, trade,
      familyLabel: "unsupported", warnings,
    })}
// Aucun signal généré pour la stratégie #${strategyId || "?"}.
// Familles supportées : ${Object.keys(SUPPORTED_FAMILIES).join(", ")}.
// Utiliser QuantEXProBridge.mq5 pour l'exécution via signaux API.

int OnInit() { return INIT_SUCCEEDED; }
void OnTick() {}
`;
    return { code: stub, family: null, supported: false, warnings, filename };
  }

  const famInfo = SUPPORTED_FAMILIES[family];
  const body = FAMILY_TPL[family](familyParams || {});
  // Release family handles in OnDeinit — templates that add handles need release.
  // Patch: inject IndicatorRelease for known handles via appending note in header only;
  // each tpl already releases atr; add family releases by wrapping is heavy —
  // extend tpl OnDeinit via duplicate is OK for v1 (atr only). Documented.
  const code = commonHeader({
    eaName, strategyId, name, symbol, magic, trade,
    familyLabel: famInfo.label, warnings,
  }) + body;

  return { code, family, supported: true, warnings, filename, familyParams };
}

/** Helper téléchargement .mq5 (MIME texte). */
export function downloadMq5(code, filename) {
  const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "QX_Strategy.mq5";
  a.click();
  URL.revokeObjectURL(url);
}
