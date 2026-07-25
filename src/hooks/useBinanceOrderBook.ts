// Carnet L2 temps réel Binance — @depth20@100ms + @bookTicker (spread réel).
import { useEffect, useRef, useState } from "react";
import {
  binanceDepthStreamUrl,
  unwrapCombinedMessage,
  isDepthPayload,
  isBookTickerPayload,
  parseDepthSnapshot,
  parseBookTicker,
  mergeBookState,
  type BookLevel,
  type BookTicker,
  type DepthBook,
} from "../engine/binanceOrderBook.ts";

export interface OrderBookState {
  connected: boolean;
  real: boolean;
  bids: BookLevel[];
  asks: BookLevel[];
  mid: number;
  spread: number;
  spreadBps: number;
  imbalance: number;
  bestBid: number;
  bestAsk: number;
  bestBidSize: number;
  bestAskSize: number;
  bidVol: number;
  askVol: number;
  updatedAt: number | null;
  error: string | null;
  msgs: number;
}

export interface UseBinanceOrderBookOpts {
  enabled?: boolean;
  levels?: number;
}

const empty = (): OrderBookState => ({
  connected: false,
  real: false,
  bids: [],
  asks: [],
  mid: NaN,
  spread: NaN,
  spreadBps: NaN,
  imbalance: NaN,
  bestBid: NaN,
  bestAsk: NaN,
  bestBidSize: NaN,
  bestAskSize: NaN,
  bidVol: 0,
  askVol: 0,
  updatedAt: null,
  error: null,
  msgs: 0,
});

export function useBinanceOrderBook(
  ticker: string | null | undefined,
  { enabled = false, levels = 20 }: UseBinanceOrderBookOpts = {},
): OrderBookState {
  const [state, setState] = useState<OrderBookState>(empty);
  const depthRef = useRef<DepthBook | null>(null);
  const tickerRef = useRef<BookTicker | null>(null);
  const lastFlush = useRef(0);
  const msgCount = useRef(0);

  useEffect(() => {
    if (!enabled || !ticker) {
      setState(empty());
      depthRef.current = null;
      tickerRef.current = null;
      return;
    }

    let ws: WebSocket | null = null;
    let alive = true;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    depthRef.current = null;
    tickerRef.current = null;
    msgCount.current = 0;

    const publish = (force = false) => {
      const now = Date.now();
      if (!force && now - lastFlush.current < 150) return;
      lastFlush.current = now;
      if (!depthRef.current && !tickerRef.current) return;
      const snap = mergeBookState(depthRef.current, tickerRef.current);
      setState((s) => ({
        ...s,
        ...snap,
        connected: true,
        error: null,
        msgs: msgCount.current,
      }));
    };

    const connect = () => {
      const url = binanceDepthStreamUrl(ticker, levels);
      try {
        ws = new WebSocket(url);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        setState((s) => ({ ...s, error: err, connected: false }));
        return;
      }
      ws.onopen = () => alive && setState((s) => ({ ...s, connected: true, error: null }));
      ws.onerror = () => alive && setState((s) => ({ ...s, error: "flux WS L2 indisponible" }));
      ws.onclose = () => {
        if (!alive) return;
        setState((s) => ({ ...s, connected: false }));
        if (enabled) setTimeout(() => alive && connect(), 3000);
      };
      ws.onmessage = (ev) => {
        let raw: unknown;
        try { raw = JSON.parse(String(ev.data)); } catch { return; }
        const wrapped = unwrapCombinedMessage(raw);
        if (!wrapped) return;
        const { data } = wrapped;
        msgCount.current++;
        if (isDepthPayload(data)) {
          depthRef.current = parseDepthSnapshot(data as Parameters<typeof parseDepthSnapshot>[0], levels);
        } else if (isBookTickerPayload(data)) {
          tickerRef.current = parseBookTicker(data as Parameters<typeof parseBookTicker>[0]);
        }
        publish();
      };
    };

    connect();
    refreshTimer = setInterval(() => publish(true), 1000);

    return () => {
      alive = false;
      if (refreshTimer) clearInterval(refreshTimer);
      if (ws) {
        ws.onclose = null;
        try { ws.close(); } catch { /* noop */ }
      }
    };
  }, [ticker, enabled, levels]);

  return state;
}
