// Bougies en TEMPS RÉEL via le flux WebSocket Binance @kline (crypto uniquement).
// Warm-start depuis l'historique réel déjà chargé (pipeline.bars), puis met à jour la
// bougie en cours / ajoute les nouvelles à la clôture. Aucune donnée inventée.
import { useEffect, useRef, useState } from "react";

const WS_BASE = "wss://stream.binance.com:9443/ws";

// Facteur de timeframe du pipeline → intervalle Binance.
const TF_TO_BINANCE: Record<number, string> = { 1: "5m", 3: "15m", 12: "1h", 48: "4h", 288: "1d" };

export interface LiveBar { o: number; h: number; l: number; c: number; v: number; t: number; }
export interface LiveBarsState {
  bars: LiveBar[];
  connected: boolean;
  last: LiveBar | null;
  error: string | null;
}
export interface UseBinanceLiveBarsOpts {
  ticker?: string | null;   // ex. "BTCUSDT" (null hors-crypto → désactivé)
  tf: number;               // facteur pipeline (1,3,12,48,288)
  warmBars?: LiveBar[];     // historique réel pour amorcer
  enabled?: boolean;
  max?: number;             // taille max de la fenêtre affichée
}

export function useBinanceLiveBars({ ticker, tf, warmBars = [], enabled = true, max = 500 }: UseBinanceLiveBarsOpts): LiveBarsState {
  const seed = warmBars.slice(-max);
  const [state, setState] = useState<LiveBarsState>({ bars: seed, connected: false, last: seed[seed.length - 1] || null, error: null });
  const barsRef = useRef<LiveBar[]>(seed);
  const interval = TF_TO_BINANCE[tf];
  const active = enabled && !!ticker && !!interval;

  // Re-amorce depuis l'historique réel quand l'actif/TF change.
  useEffect(() => {
    barsRef.current = (warmBars || []).slice(-max);
    setState((s) => ({ ...s, bars: barsRef.current, last: barsRef.current[barsRef.current.length - 1] || null }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, tf]);

  useEffect(() => {
    if (!active) { setState((s) => ({ ...s, connected: false })); return; }
    let ws: WebSocket | null = null;
    let alive = true;
    try {
      ws = new WebSocket(`${WS_BASE}/${ticker!.toLowerCase()}@kline_${interval}`);
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) }));
      return;
    }
    ws.onopen = () => { if (alive) setState((s) => ({ ...s, connected: true, error: null })); };
    ws.onclose = () => { if (alive) setState((s) => ({ ...s, connected: false })); };
    ws.onerror = () => { if (alive) setState((s) => ({ ...s, error: "Flux temps réel Binance indisponible" })); };
    ws.onmessage = (ev: MessageEvent) => {
      if (!alive) return;
      let msg: { k?: { t: number; o: string; h: string; l: string; c: string; v: string } };
      try { msg = JSON.parse(ev.data as string); } catch { return; }
      const k = msg.k;
      if (!k) return;
      const bar: LiveBar = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
      const arr = barsRef.current;
      const last = arr[arr.length - 1];
      if (last && last.t === bar.t) arr[arr.length - 1] = bar;                 // bougie en cours → maj
      else if (!last || bar.t > last.t) { arr.push(bar); if (arr.length > max) arr.shift(); } // nouvelle bougie
      const next = arr.slice();
      barsRef.current = next;
      setState((s) => ({ ...s, bars: next, last: bar }));
    };
    return () => { alive = false; try { ws?.close(); } catch { /* noop */ } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, tf, active, interval, max]);

  return state;
}
