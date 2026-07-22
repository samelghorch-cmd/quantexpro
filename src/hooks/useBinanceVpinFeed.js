// VPIN en TEMPS RÉEL via le flux WebSocket Binance @aggTrade.
// Chaque trade agrégé fournit prix (p), quantité (q) et le flag maker (m) :
//   m === false → l'acheteur est TAKER → achat agressif · m === true → vente agressive.
// → classification order-flow RÉELLE, tick par tick (aucune estimation BVC).
// On accumule en buckets à volume constant, VPIN = déséquilibre moyen glissant, CDF = percentile.
// Warm start : on amorce la distribution depuis les klines 1m récentes (taker-buy k[9]).
import { useEffect, useRef, useState } from "react";
import { toxicityLevel } from "../engine/vpin.js";

const WS_BASE = "wss://stream.binance.com:9443/ws";
const REST_KLINES = "https://api.binance.com/api/v3/klines";

export function useBinanceVpinFeed(ticker, { enabled = false, window = 50, cdfWindow = 250 } = {}) {
  const [state, setState] = useState({ connected: false, vpin: NaN, cdf: NaN, tox: toxicityLevel(NaN), lastPrice: NaN, tps: 0, buckets: 0, error: null });

  // Refs de calcul (ne déclenchent pas de rendu)
  const bucketVol = useRef(0);
  const acc = useRef({ buy: 0, sell: 0, vol: 0 });
  const imbalances = useRef([]);   // OI par bucket
  const history = useRef([]);      // VPIN passés → CDF
  const lastPrice = useRef(NaN);
  const tradeCount = useRef(0);
  const lastFlush = useRef(0);
  const nBuckets = useRef(0);
  const tpsAt = useRef(0);    // début de la fenêtre trades/s
  const tpsBase = useRef(0);  // compteur au début de la fenêtre
  const tpsVal = useRef(0);   // dernière valeur trades/s

  useEffect(() => {
    if (!enabled || !ticker) { setState((s) => ({ ...s, connected: false })); return; }

    let ws = null, alive = true, refreshTimer = null;
    // reset état de calcul à chaque (re)connexion
    acc.current = { buy: 0, sell: 0, vol: 0 };
    imbalances.current = []; history.current = []; nBuckets.current = 0; tradeCount.current = 0;
    tpsAt.current = 0; tpsBase.current = 0; tpsVal.current = 0;

    const flush = (force = false) => {
      const now = Date.now();
      if (!force && now - lastFlush.current < 400) return; // throttle rendu
      lastFlush.current = now;
      // trades/s sur fenêtre glissante ~1s (piloté par les messages, robuste au StrictMode)
      if (tpsAt.current === 0) { tpsAt.current = now; tpsBase.current = tradeCount.current; }
      else if (now - tpsAt.current >= 1000) {
        tpsVal.current = Math.round((tradeCount.current - tpsBase.current) / ((now - tpsAt.current) / 1000));
        tpsAt.current = now; tpsBase.current = tradeCount.current;
      }
      const slice = imbalances.current.slice(-window);
      const vpin = slice.length >= window ? slice.reduce((a, b) => a + b, 0) / window : NaN;
      let cdf = NaN;
      if (!Number.isNaN(vpin) && history.current.length) {
        const hist = history.current.slice(-cdfWindow);
        cdf = hist.filter((h) => h <= vpin).length / hist.length;
      }
      setState((s) => ({ ...s, vpin, cdf, tox: toxicityLevel(cdf), lastPrice: lastPrice.current, buckets: nBuckets.current, tps: tpsVal.current }));
    };

    const onBucketClosed = () => {
      const v = bucketVol.current || 1;
      const oi = Math.abs(acc.current.buy - acc.current.sell) / v;
      imbalances.current.push(oi);
      nBuckets.current++;
      if (imbalances.current.length >= window) {
        const slice = imbalances.current.slice(-window);
        history.current.push(slice.reduce((a, b) => a + b, 0) / window);
        if (history.current.length > cdfWindow * 2) history.current = history.current.slice(-cdfWindow);
      }
      acc.current = { buy: 0, sell: 0, vol: 0 };
      flush();
    };

    // ---- Warm start : dimensionne le bucket + amorce la distribution depuis les klines 1m ----
    const warmStart = async () => {
      try {
        const r = await fetch(`${REST_KLINES}?symbol=${ticker}&interval=1m&limit=500`);
        if (!r.ok) return;
        const kl = await r.json();
        const vols = kl.map((k) => +k[5]).filter((v) => v > 0).sort((a, b) => a - b);
        bucketVol.current = vols.length ? vols[Math.floor(vols.length / 2)] : 0; // médiane du volume 1m
        // chaque bougie 1m ≈ un bucket : OI = |2·takerBuy − v| / v
        for (const k of kl) {
          const v = +k[5], vb = +k[9];
          if (v <= 0) continue;
          imbalances.current.push(Math.min(1, Math.abs(2 * vb - v) / v));
          if (imbalances.current.length >= window) {
            const slice = imbalances.current.slice(-window);
            history.current.push(slice.reduce((a, b) => a + b, 0) / window);
          }
        }
        nBuckets.current = imbalances.current.length;
        lastPrice.current = kl.length ? +kl[kl.length - 1][4] : NaN;
        flush(true);
      } catch { /* pas de warm start → le live construira la distribution */ }
    };

    const connect = () => {
      try {
        ws = new WebSocket(`${WS_BASE}/${ticker.toLowerCase()}@aggTrade`);
      } catch (e) { setState((s) => ({ ...s, error: String(e), connected: false })); return; }

      ws.onopen = () => alive && setState((s) => ({ ...s, connected: true, error: null }));
      ws.onerror = () => alive && setState((s) => ({ ...s, error: "flux WS indisponible" }));
      ws.onclose = () => { if (alive) { setState((s) => ({ ...s, connected: false })); if (enabled) setTimeout(() => alive && connect(), 3000); } };
      ws.onmessage = (ev) => {
        let d; try { d = JSON.parse(ev.data); } catch { return; }
        const q = +d.q, price = +d.p;
        if (!(q > 0)) return;
        if (d.m) acc.current.sell += q; else acc.current.buy += q; // m=true → vente agressive
        acc.current.vol += q;
        lastPrice.current = price;
        tradeCount.current++;
        if (bucketVol.current > 0) {
          while (acc.current.vol >= bucketVol.current) {
            // ferme un bucket ; on répartit le trop-plein sur le suivant proportionnellement
            const over = acc.current.vol - bucketVol.current;
            const frac = over / (q || 1);
            const carryBuy = d.m ? 0 : q * frac, carrySell = d.m ? q * frac : 0;
            acc.current.buy -= carryBuy; acc.current.sell -= carrySell;
            onBucketClosed();
            acc.current.buy = carryBuy; acc.current.sell = carrySell; acc.current.vol = over;
            if (over < bucketVol.current) break;
          }
        }
        flush();
      };
    };

    warmStart().finally(() => alive && connect());
    // Rafraîchit l'affichage chaque seconde même si les trades ralentissent (met aussi à jour trades/s).
    refreshTimer = setInterval(() => flush(true), 1000);

    return () => {
      alive = false;
      clearInterval(refreshTimer);
      if (ws) { ws.onclose = null; try { ws.close(); } catch { /* noop */ } }
    };
  }, [ticker, enabled, window, cdfWindow]);

  return state;
}
