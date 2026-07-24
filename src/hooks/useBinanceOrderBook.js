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
} from "../engine/binanceOrderBook.js";

const empty = () => ({
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

/**
 * @param {string|null} ticker — ex. BTCUSDT
 * @param {{ enabled?: boolean, levels?: number }} opts
 */
export function useBinanceOrderBook(ticker, { enabled = false, levels = 20 } = {}) {
  const [state, setState] = useState(empty);
  const depthRef = useRef(null);
  const tickerRef = useRef(null);
  const lastFlush = useRef(0);
  const msgCount = useRef(0);

  useEffect(() => {
    if (!enabled || !ticker) {
      setState(empty());
      depthRef.current = null;
      tickerRef.current = null;
      return;
    }

    let ws = null;
    let alive = true;
    let refreshTimer = null;
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
        setState((s) => ({ ...s, error: String(e.message || e), connected: false }));
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
        let raw;
        try { raw = JSON.parse(ev.data); } catch { return; }
        const wrapped = unwrapCombinedMessage(raw);
        if (!wrapped) return;
        const { data } = wrapped;
        msgCount.current++;
        if (isDepthPayload(data)) {
          depthRef.current = parseDepthSnapshot(data, levels);
        } else if (isBookTickerPayload(data)) {
          tickerRef.current = parseBookTicker(data);
        }
        publish();
      };
    };

    connect();
    refreshTimer = setInterval(() => publish(true), 1000);

    return () => {
      alive = false;
      clearInterval(refreshTimer);
      if (ws) {
        ws.onclose = null;
        try { ws.close(); } catch { /* noop */ }
      }
    };
  }, [ticker, enabled, levels]);

  return state;
}
