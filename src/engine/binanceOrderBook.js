// Carnet L2 Binance — parse @depth (partiel) + @bookTicker (spread réel).
// Logique pure testable hors WebSocket.

/**
 * Convertit un snapshot depth Binance (bids/asks = [price, qty] string[]) en carnet normalisé.
 * @param {{ bids?: string[][], asks?: string[][], lastUpdateId?: number }} raw
 * @param {number} [levels=20]
 */
export function parseDepthSnapshot(raw, levels = 20) {
  const toSide = (rows, desc) => {
    const out = [];
    for (const row of rows || []) {
      const price = Number(row[0]);
      const size = Number(row[1]);
      if (!(price > 0) || !(size >= 0)) continue;
      out.push({ price, size });
    }
    out.sort((a, b) => (desc ? b.price - a.price : a.price - b.price));
    return out.slice(0, levels);
  };
  // Bids: prix décroissant (meilleur en premier) · Asks: croissant
  const bids = toSide(raw?.bids, true);
  const asks = toSide(raw?.asks, false);
  return {
    bids,
    asks,
    lastUpdateId: raw?.lastUpdateId ?? raw?.u ?? null,
    source: "depth",
  };
}

/**
 * bookTicker → best bid/ask + sizes.
 * @param {{ b?: string, B?: string, a?: string, A?: string, s?: string, u?: number }} raw
 */
export function parseBookTicker(raw) {
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
export function bookMetrics(book, ticker = null) {
  const bestBid = book?.bids?.[0]?.price;
  const bestAsk = book?.asks?.[0]?.price;
  const mid = Number.isFinite(bestBid) && Number.isFinite(bestAsk)
    ? (bestBid + bestAsk) / 2
    : (ticker?.bid && ticker?.ask ? (ticker.bid + ticker.ask) / 2 : NaN);
  const spread = Number.isFinite(bestBid) && Number.isFinite(bestAsk)
    ? bestAsk - bestBid
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

/**
 * Fusionne depth + bookTicker en un snapshot d'affichage.
 * Prefer depth levels ; override top-of-book sizes/prices from ticker si présent.
 */
export function mergeBookState(depth, ticker) {
  const book = depth
    ? { bids: [...(depth.bids || [])], asks: [...(depth.asks || [])], lastUpdateId: depth.lastUpdateId }
    : { bids: [], asks: [], lastUpdateId: null };

  if (ticker && book.bids.length && book.asks.length) {
    // Aligne le top sur le bookTicker (spread réel le plus frais)
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

  const metrics = bookMetrics(book, ticker);
  return {
    ...book,
    ...metrics,
    ticker,
    real: true,
    updatedAt: Date.now(),
  };
}

/** Message combined stream Binance → { stream, data }. */
export function unwrapCombinedMessage(msg) {
  if (!msg || typeof msg !== "object") return null;
  if (msg.stream && msg.data) return { stream: String(msg.stream), data: msg.data };
  // flux simple (pas combined)
  return { stream: "", data: msg };
}

export function isDepthPayload(data) {
  return data && (Array.isArray(data.bids) || Array.isArray(data.asks));
}

export function isBookTickerPayload(data) {
  return data && data.b != null && data.a != null && data.B != null;
}

export function binanceDepthStreamUrl(ticker, levels = 20) {
  const sym = String(ticker || "").toLowerCase();
  const lv = levels === 5 || levels === 10 || levels === 20 ? levels : 20;
  // combined : depth partiel 100ms + bookTicker
  const streams = `${sym}@depth${lv}@100ms/${sym}@bookTicker`;
  return `wss://stream.binance.com:9443/stream?streams=${streams}`;
}
