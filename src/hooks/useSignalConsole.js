// P4-SIGNAL-WS — hook console (mode local pipeline + WS /stream/bars).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiBaseUrl, getApiKey } from "../engine/apiClient.js";
import {
  DEFAULT_SIGNAL_SLOTS,
  barsWebSocketUrl,
  resolveStreamTf,
  parseBarClosedMessage,
  evaluateSlots,
  consensusFromSignals,
  pushRing,
  makeSignalSnapshotEvent,
  makeBarClosedEvent,
} from "../engine/signalConsole.ts";

/**
 * @param {{
 *   library: object[],
 *   ctx: object|null,
 *   bars: object[],
 *   symbol?: string,
 *   tfFactor?: number,
 *   slots?: number[],
 * }} opts
 */
export function useSignalConsole({
  library,
  ctx,
  bars,
  symbol,
  tfFactor = 3,
  slots = DEFAULT_SIGNAL_SLOTS,
} = {}) {
  const [mode, setMode] = useState("local"); // local | ws
  const [wsStatus, setWsStatus] = useState("idle"); // idle | connecting | live | error | closed
  const [wsError, setWsError] = useState(null);
  const [events, setEvents] = useState([]);
  const [barTicks, setBarTicks] = useState(0);
  const wsRef = useRef(null);
  const lastSigKey = useRef("");

  const i = bars?.length ? bars.length - 1 : -1;

  const signals = useMemo(
    () => evaluateSlots(library, ctx, i, slots),
    [library, ctx, i, slots, barTicks],
  );
  const consensus = useMemo(() => consensusFromSignals(signals), [signals]);

  const pushSnapshot = useCallback(
    (source) => {
      const key = `${source}:${i}:${signals.map((s) => `${s.id}:${s.long}:${s.short}`).join("|")}`;
      if (key === lastSigKey.current && source === "local") return;
      lastSigKey.current = key;
      const ev = makeSignalSnapshotEvent(signals, { source, symbol, ts: Date.now() });
      setEvents((ring) => pushRing(ring, ev));
    },
    [signals, symbol, i],
  );

  // Mode local : snapshot à chaque changement de barre / signaux
  useEffect(() => {
    if (mode !== "local") return;
    if (i < 1 || !ctx) return;
    pushSnapshot("local");
  }, [mode, i, ctx, pushSnapshot]);

  const disconnectWs = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
      } catch { /* noop */ }
      wsRef.current = null;
    }
    setWsStatus((s) => (s === "live" || s === "connecting" ? "closed" : s));
  }, []);

  const connectWs = useCallback(() => {
    disconnectWs();
    const base = getApiBaseUrl();
    const key = getApiKey();
    if (!base || !key) {
      setWsError("Configure URL API + clé (Data Manager)");
      setWsStatus("error");
      return;
    }
    const tf = resolveStreamTf(tfFactor);
    let url;
    try {
      url = barsWebSocketUrl(base, tf, key);
    } catch (e) {
      setWsError(e.message || String(e));
      setWsStatus("error");
      return;
    }
    setWsStatus("connecting");
    setWsError(null);
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setWsStatus("live");
    ws.onmessage = (msg) => {
      const parsed = parseBarClosedMessage(msg.data);
      if (!parsed || parsed.type !== "bar.closed") return;
      setEvents((ring) => pushRing(ring, makeBarClosedEvent(parsed, { source: "ws" })));
      setBarTicks((n) => n + 1);
      // Ré-évalue slots sur ctx pipeline courant (journal unifié)
      const sigs = evaluateSlots(library, ctx, bars?.length ? bars.length - 1 : -1, slots);
      setEvents((ring) =>
        pushRing(ring, makeSignalSnapshotEvent(sigs, { source: "ws", symbol: parsed.symbol || symbol })),
      );
    };
    ws.onerror = () => {
      setWsError("Erreur WebSocket (bus désactivé ? API down ?)");
      setWsStatus("error");
    };
    ws.onclose = () => {
      setWsStatus((s) => (s === "error" ? "error" : "closed"));
      wsRef.current = null;
    };
  }, [disconnectWs, tfFactor, library, ctx, bars, slots, symbol]);

  useEffect(() => {
    if (mode === "ws") connectWs();
    else disconnectWs();
    return () => disconnectWs();
  }, [mode, connectWs, disconnectWs]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return {
    mode,
    setMode,
    wsStatus,
    wsError,
    events,
    signals,
    consensus,
    clearEvents,
    reconnect: connectWs,
    streamTf: resolveStreamTf(tfFactor),
  };
}
