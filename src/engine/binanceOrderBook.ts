// Carnet L2 Binance — parse @depth (partiel) + @bookTicker (spread réel).
// Logique pure testable hors WebSocket.

export interface BookLevel {
  price: number;
  size: number;
}

export interface DepthBook {
  bids: BookLevel[];
  asks: BookLevel[];
  lastUpdateId: number | null;
  source: "depth";
}

export interface BookTicker {
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  symbol: string | null;
  updateId: number | null;
  source: "bookTicker";
}

export interface BookMetrics {
  mid: number;
  spread: number;
  spreadBps: number;
  bidVol: number;
  askVol: number;
  imbalance: number;
  bestBid: number;
  bestAsk: number;
  bestBidSize: number;
  bestAskSize: number;
}

type DepthRaw = {
  bids?: string[][];
  asks?: string[][];
  lastUpdateId?: number;
  u?: number;
};

type TickerRaw = {
  b?: string;
  B?: string;
  a?: string;
  A?: string;
  s?: string;
  u?: number;
};

/** Snapshot depth Binance → carnet normalisé. */
export function parseDepthSnapshot(raw: DepthRaw | null | undefined, levels = 20): DepthBook {
  const toSide = (rows: string[][] | undefined, desc: boolean): BookLevel[] => {
    const out: BookLevel[] = [];
    for (const row of rows || []) {
      const price = Number(row[0]);
      const size = Number(row[1]);
      if (!(price > 0) || !(size >= 0)) continue;
      out.push({ price, size });
    }
    out.sort((a, b) => (desc ? b.price - a.price : a.price - b.price));
    return out.slice(0, levels);
  };
  const bids = toSide(raw?.bids, true);
  const asks = toSide(raw?.asks, false);
  return {
    bids,
    asks,
    lastUpdateId: raw?.lastUpdateId ?? raw?.u ?? null,
    source: "depth",
  };
}

/** bookTicker → best bid/ask + sizes. */
export function parseBookTicker(raw: TickerRaw | null | undefined): BookTicker | null {
  const bid = Number(raw?.b);
  const ask = Number(raw?.a);
  const bidSize = Number(raw?.B);
  const askSize = Number(raw?.A);
  if (!(bid > 0) || !(ask > 0)) return null;
  return {
    bid,
    ask,
    bidSize: Number.isFinite(bidSize) ? bidSize : NaN,
    askSize: Number.isFinite(askSize) ? askSize : NaN,
    symbol: raw?.s || null,
    updateId: raw?.u ?? null,
    source: "bookTicker",
  };
}

/** Mid / spread (absolu + bps) / imbalance volume top-N. */
export function bookMetrics(
  book: { bids?: BookLevel[]; asks?: BookLevel[] } | null | undefined,
  ticker: BookTicker | null = null,
): BookMetrics {
  const bestBid = book?.bids?.[0]?.price;
  const bestAsk = book?.asks?.[0]?.price;
  const mid = Number.isFinite(bestBid) && Number.isFinite(bestAsk)
    ? ((bestBid as number) + (bestAsk as number)) / 2
    : (ticker?.bid && ticker?.ask ? (ticker.bid + ticker.ask) / 2 : NaN);
  const spread = Number.isFinite(bestBid) && Number.isFinite(bestAsk)
    ? (bestAsk as number) - (bestBid as number)
    : (ticker ? ticker.ask - ticker.bid : NaN);
  const spreadBps = Number.isFinite(mid) && mid > 0 && Number.isFinite(spread)
    ? (spread / mid) * 1e4
    : NaN;

  const bidVol = (book?.bids || []).reduce((s, x) => s + (x.size || 0), 0);
  const askVol = (book?.asks || []).reduce((s, x) => s + (x.size || 0), 0);
  const tot = bidVol + askVol;
  const imbalance = tot > 0 ? ((bidVol - askVol) / tot) * 100 : NaN;

  return {
    mid,
    spread,
    spreadBps,
    bidVol,
    askVol,
    imbalance,
    bestBid: bestBid ?? ticker?.bid ?? NaN,
    bestAsk: bestAsk ?? ticker?.ask ?? NaN,
    bestBidSize: book?.bids?.[0]?.size ?? ticker?.bidSize ?? NaN,
    bestAskSize: book?.asks?.[0]?.size ?? ticker?.askSize ?? NaN,
  };
}

/** Fusionne depth + bookTicker en un snapshot d'affichage. */
export function mergeBookState(
  depth: DepthBook | null | undefined,
  ticker: BookTicker | null | undefined,
) {
  const book = depth
    ? { bids: [...(depth.bids || [])], asks: [...(depth.asks || [])], lastUpdateId: depth.lastUpdateId }
    : { bids: [] as BookLevel[], asks: [] as BookLevel[], lastUpdateId: null as number | null };

  if (ticker && book.bids.length && book.asks.length) {
    book.bids[0] = {
      price: ticker.bid,
      size: Number.isFinite(ticker.bidSize) ? ticker.bidSize : book.bids[0].size,
    };
    book.asks[0] = {
      price: ticker.ask,
      size: Number.isFinite(ticker.askSize) ? ticker.askSize : book.asks[0].size,
    };
  } else if (ticker && book.bids.length === 0) {
    book.bids = [{ price: ticker.bid, size: ticker.bidSize || 0 }];
    book.asks = [{ price: ticker.ask, size: ticker.askSize || 0 }];
  }

  const metrics = bookMetrics(book, ticker ?? null);
  return {
    ...book,
    ...metrics,
    ticker,
    real: true as const,
    updatedAt: Date.now(),
  };
}

/** Message combined stream Binance → { stream, data }. */
export function unwrapCombinedMessage(msg: unknown): { stream: string; data: unknown } | null {
  if (!msg || typeof msg !== "object") return null;
  const m = msg as { stream?: unknown; data?: unknown };
  if (m.stream && m.data) return { stream: String(m.stream), data: m.data };
  return { stream: "", data: msg };
}

export function isDepthPayload(data: unknown): boolean {
  return Boolean(data && typeof data === "object" && (Array.isArray((data as DepthRaw).bids) || Array.isArray((data as DepthRaw).asks)));
}

export function isBookTickerPayload(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as TickerRaw;
  return d.b != null && d.a != null && d.B != null;
}

export function binanceDepthStreamUrl(ticker: string | null | undefined, levels = 20): string {
  const sym = String(ticker || "").toLowerCase();
  const lv = levels === 5 || levels === 10 || levels === 20 ? levels : 20;
  const streams = `${sym}@depth${lv}@100ms/${sym}@bookTicker`;
  return `wss://stream.binance.com:9443/stream?streams=${streams}`;
}
