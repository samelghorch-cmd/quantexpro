// Couche de données de marché réelles — Binance (crypto) + Yahoo Finance (tout le reste),
// gratuit, sans clé. Normalise vers le format OHLCV interne {t,o,h,l,c,v}.
// CORS Yahoo contourné par un proxy (/api/yf) : Vite en dev, Cloudflare Function en prod.
import { aggregateBars } from "./syntheticData.js";
import { cleanBars, applyAdjustment } from "./dataQuality.js";
import { idbGet, idbPut, idbAll, idbDelete, idbClear, storageEstimate } from "./dataStore.js";

// ---- Catalogue de symboles par classe d'actif ----
export const ASSET_CLASSES = [
  {
    id: "crypto", label: "Crypto",
    symbols: [
      { key: "BTC", label: "Bitcoin", provider: "binance", ticker: "BTCUSDT" },
      { key: "ETH", label: "Ethereum", provider: "binance", ticker: "ETHUSDT" },
      { key: "SOL", label: "Solana", provider: "binance", ticker: "SOLUSDT" },
      { key: "BNB", label: "BNB", provider: "binance", ticker: "BNBUSDT" },
      { key: "XRP", label: "XRP", provider: "binance", ticker: "XRPUSDT" },
    ],
  },
  {
    id: "indices", label: "Indices",
    symbols: [
      { key: "SPX", label: "S&P 500", provider: "yahoo", ticker: "^GSPC" },
      { key: "NDX", label: "Nasdaq 100", provider: "yahoo", ticker: "^NDX" },
      { key: "DJI", label: "Dow Jones", provider: "yahoo", ticker: "^DJI" },
      { key: "RUT", label: "Russell 2000", provider: "yahoo", ticker: "^RUT" },
      { key: "DAX", label: "DAX", provider: "yahoo", ticker: "^GDAXI" },
    ],
  },
  {
    id: "forex", label: "Forex",
    symbols: [
      { key: "EURUSD", label: "EUR/USD", provider: "yahoo", ticker: "EURUSD=X" },
      { key: "GBPUSD", label: "GBP/USD", provider: "yahoo", ticker: "GBPUSD=X" },
      { key: "USDJPY", label: "USD/JPY", provider: "yahoo", ticker: "USDJPY=X" },
      { key: "AUDUSD", label: "AUD/USD", provider: "yahoo", ticker: "AUDUSD=X" },
      { key: "USDCAD", label: "USD/CAD", provider: "yahoo", ticker: "USDCAD=X" },
    ],
  },
  {
    id: "stocks", label: "Actions",
    symbols: [
      { key: "AAPL", label: "Apple", provider: "yahoo", ticker: "AAPL" },
      { key: "MSFT", label: "Microsoft", provider: "yahoo", ticker: "MSFT" },
      { key: "NVDA", label: "Nvidia", provider: "yahoo", ticker: "NVDA" },
      { key: "TSLA", label: "Tesla", provider: "yahoo", ticker: "TSLA" },
      { key: "AMZN", label: "Amazon", provider: "yahoo", ticker: "AMZN" },
    ],
  },
  {
    id: "metals", label: "Métaux",
    symbols: [
      { key: "GOLD", label: "Or (Gold)", provider: "yahoo", ticker: "GC=F" },
      { key: "SILVER", label: "Argent (Silver)", provider: "yahoo", ticker: "SI=F" },
      { key: "COPPER", label: "Cuivre (Copper)", provider: "yahoo", ticker: "HG=F" },
      { key: "PLATINUM", label: "Platine", provider: "yahoo", ticker: "PL=F" },
    ],
  },
  {
    id: "energy", label: "Énergie",
    symbols: [
      { key: "WTI", label: "Pétrole WTI", provider: "yahoo", ticker: "CL=F" },
      { key: "BRENT", label: "Pétrole Brent", provider: "yahoo", ticker: "BZ=F" },
      { key: "NATGAS", label: "Gaz naturel", provider: "yahoo", ticker: "NG=F" },
    ],
  },
];

export const ALL_SYMBOLS = ASSET_CLASSES.flatMap((c) => c.symbols.map((s) => ({ ...s, classId: c.id, classLabel: c.label })));
export function findSymbol(key) { return ALL_SYMBOLS.find((s) => s.key === key); }

// Timeframe interne (facteur de barres 5m) → intervalles fournisseurs.
// 1=5m, 3=15m, 12=1h, 48=4h, 288=1d
export const TF_MAP = {
  1:   { label: "5m",  binance: "5m",  yahoo: "5m",  yahooRange: "1mo",  aggYahoo: 1 },
  3:   { label: "15m", binance: "15m", yahoo: "15m", yahooRange: "1mo",  aggYahoo: 1 },
  12:  { label: "1h",  binance: "1h",  yahoo: "60m", yahooRange: "2y",   aggYahoo: 1 },
  48:  { label: "4h",  binance: "4h",  yahoo: "60m", yahooRange: "2y",   aggYahoo: 4 }, // Yahoo n'a pas 4h → agrège 1h ×4
  288: { label: "1d",  binance: "1d",  yahoo: "1d",  yahooRange: "10y",  aggYahoo: 1 },
};

// ---- Cache IndexedDB (gros quota, multi-années, pré-téléchargement hors-ligne) ----
const cacheId = (provider, ticker, tf) => `${provider}:${ticker}:${tf}`;

async function readCache(provider, ticker, tf) {
  try {
    const rec = await idbGet(cacheId(provider, ticker, tf));
    if (!rec) return null;
    return { bars: rec.bars, report: rec.report };
  } catch { return null; }
}
async function writeCache(provider, ticker, tf, payload, meta) {
  try {
    await idbPut({ id: cacheId(provider, ticker, tf), bars: payload.bars, report: payload.report, meta: { ...meta, ts: Date.now(), count: payload.bars.length } });
  } catch { /* IDB indisponible → pas de cache */ }
}

// ---- Fournisseurs ----
const BINANCE_BATCHES = { 288: 12, 48: 8, 12: 8, 3: 3, 1: 2 }; // profondeur par timeframe

async function fetchBinance(ticker, tf) {
  const interval = TF_MAP[tf].binance;
  // pagination pour couvrir plusieurs années (max 1000 bars / requête)
  const maxBatches = BINANCE_BATCHES[tf] || 2;
  let all = [];
  let endTime = Date.now();
  for (let b = 0; b < maxBatches; b++) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${ticker}&interval=${interval}&limit=1000&endTime=${endTime}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Binance ${r.status}`);
    const data = await r.json();
    if (!data.length) break;
    all = data.concat(all);
    endTime = data[0][0] - 1;
    if (data.length < 1000) break;
  }
  // k[9] = taker buy base volume (achats agressifs) → classification order-flow RÉELLE (pas d'estimation).
  return all.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5], vBuy: +k[9] }));
}

async function fetchYahoo(ticker, tf) {
  const { yahoo: interval, yahooRange: range, aggYahoo } = TF_MAP[tf];
  const url = `/api/yf/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  if (!res || !res.timestamp) throw new Error("Yahoo: pas de données");
  const q = res.indicators.quote[0];
  const adj = res.indicators.adjclose?.[0]?.adjclose; // prix ajustés splits/dividendes (daily)
  let bars = [];
  const adjArr = [];
  for (let i = 0; i < res.timestamp.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if ([o, h, l, c].some((v) => v == null)) continue;
    bars.push({ t: res.timestamp[i] * 1000, o, h, l, c, v: q.volume[i] || 0 });
    adjArr.push(adj ? adj[i] : c);
  }
  if (adj) bars = applyAdjustment(bars, adjArr); // corrige splits/dividendes
  return aggYahoo > 1 ? aggregateBars(bars, aggYahoo) : bars;
}

// ---- API publique ----
export async function fetchCandles(symbolKey, tf, { force = false } = {}) {
  const sym = findSymbol(symbolKey);
  if (!sym) throw new Error(`Symbole inconnu : ${symbolKey}`);
  if (!force) {
    const cached = await readCache(sym.provider, sym.ticker, tf);
    if (cached) return { bars: cached.bars, symbol: sym, cached: true, report: cached.report };
  }
  const raw = sym.provider === "binance" ? await fetchBinance(sym.ticker, tf) : await fetchYahoo(sym.ticker, tf);
  const { bars, report } = cleanBars(raw, { assetClass: sym.classId }); // nettoyage qualité
  if (bars.length) await writeCache(sym.provider, sym.ticker, tf, { bars, report }, { symbolKey, label: sym.label, classLabel: sym.classLabel, provider: sym.provider, ticker: sym.ticker, tf });
  return { bars, symbol: sym, cached: false, report };
}

// ---- Import de séries externes profondes (Dukascopy 15-20 ans, cf. tools/dukascopy) ----
// Écrit des barres OHLCV sous le cacheId canonique du symbole → l'app (backtests, Usine, Data
// Manager) les utilise exactement comme une série chargée. Format attendu : bars = [{t,o,h,l,c,v}].
// Note : 500 Go de ticks ne tiennent pas dans le navigateur ; on n'importe ici que l'OHLCV agrégé
// (léger : ~20 ans en 1h ≈ quelques Mo), produit en local par le script Node d'ingestion.
export async function importSeries(symbolKey, tf, bars, { provider } = {}) {
  const sym = findSymbol(symbolKey);
  if (!sym) throw new Error(`Symbole inconnu : ${symbolKey} (doit exister dans ASSET_CLASSES)`);
  if (!Array.isArray(bars) || !bars.length) throw new Error("Aucune barre à importer");
  const { bars: clean, report } = cleanBars(bars, { assetClass: sym.classId });
  await writeCache(sym.provider, sym.ticker, tf, { bars: clean, report },
    { symbolKey, label: sym.label, classLabel: sym.classLabel, provider: provider || "dukascopy", ticker: sym.ticker, tf, source: provider || "dukascopy" });
  return { count: clean.length, report, span: clean.length ? [clean[0].t, clean[clean.length - 1].t] : null };
}

// ---- Helpers Data Manager ----
export async function listCachedSeries() {
  try {
    const all = await idbAll();
    return all.map((r) => ({
      id: r.id, ...r.meta,
      bars: r.bars.length,
      span: r.bars.length ? [r.bars[0].t, r.bars[r.bars.length - 1].t] : null,
      health: r.report?.health, gaps: r.report?.gaps,
      bytes: JSON.stringify(r.bars).length,
    })).sort((a, b) => (a.label || "").localeCompare(b.label || "") || (a.tf - b.tf));
  } catch { return []; }
}
export async function deleteCachedSeries(id) { try { await idbDelete(id); } catch { /* noop */ } }
export async function clearMarketCache() { try { await idbClear(); } catch { /* noop */ } }
export { storageEstimate };
