// P4-FEEDS — bandeau ticker simulé + statut multi-feeds réels.
import { useCallback, useEffect, useState } from "react";
import { T } from "../shared/theme.ts";
import {
  probeAllFeeds,
  feedStatusTone,
  summarizeFeeds,
  type FeedHealth,
  type FeedStatus,
  type FeedTone,
} from "../../engine/feedStatus.ts";

interface Instrument { sym: string; price: number; chg: number; }

// Prix RÉELS : crypto via Binance (24h ticker), le reste via Yahoo Finance (v8 chart).
const CRYPTO = [
  { sym: "BTC", q: "BTCUSDT" }, { sym: "ETH", q: "ETHUSDT" }, { sym: "SOL", q: "SOLUSDT" },
];
const YAHOO = [
  { sym: "EUR/USD", q: "EURUSD=X" }, { sym: "GBP/USD", q: "GBPUSD=X" }, { sym: "USD/JPY", q: "USDJPY=X" }, { sym: "AUD/USD", q: "AUDUSD=X" },
  { sym: "S&P 500", q: "^GSPC" }, { sym: "NASDAQ 100", q: "^NDX" }, { sym: "Russell 2K", q: "^RUT" },
  { sym: "Gold", q: "GC=F" }, { sym: "Silver", q: "SI=F" }, { sym: "WTI Oil", q: "CL=F" },
  { sym: "DXY", q: "DX-Y.NYB" }, { sym: "US 10Y", q: "^TNX" }, { sym: "High Yield", q: "HYG" }, { sym: "VIX", q: "^VIX" },
];
const ORDER: string[] = [...CRYPTO, ...YAHOO].map((x) => x.sym);

const TONE: Record<FeedTone, string> = {
  green: T.green,
  red: T.red,
  yellow: T.yellow,
  dim: T.textFaint,
};

function statusLabel(st: FeedHealth) {
  if (st === "ok") return "OK";
  if (st === "down") return "DOWN";
  if (st === "unconfigured") return "CFG";
  if (st === "scoped_out") return "N/A";
  return "?";
}

export function TickerBar() {
  const [prices, setPrices] = useState<Instrument[]>(() => ORDER.map((sym) => ({ sym, price: 0, chg: 0 })));
  const [feeds, setFeeds] = useState<FeedStatus[]>([]);
  const [probing, setProbing] = useState(false);

  // Récupère les prix RÉELS (Binance crypto + Yahoo v8 pour le reste). Rafraîchit toutes les 30 s.
  const loadQuotes = useCallback(async () => {
    const next: Record<string, { price: number; chg: number }> = {};
    try {
      const qs = encodeURIComponent(JSON.stringify(CRYPTO.map((c) => c.q)));
      const arr = await (await fetch(`/api/binance/ticker/24hr?symbols=${qs}`)).json();
      if (Array.isArray(arr)) for (const c of CRYPTO) {
        const row = arr.find((x: { symbol?: string }) => x.symbol === c.q) as { lastPrice?: string; priceChangePercent?: string } | undefined;
        if (row) next[c.sym] = { price: +(row.lastPrice ?? 0), chg: +(row.priceChangePercent ?? 0) };
      }
    } catch { /* garde les valeurs précédentes */ }
    await Promise.all(YAHOO.map(async (y) => {
      try {
        const j = await (await fetch(`/api/yf/v8/finance/chart/${encodeURIComponent(y.q)}?range=5d&interval=1d`)).json();
        const m = j?.chart?.result?.[0]?.meta;
        const price = m?.regularMarketPrice;
        const prev = m?.chartPreviousClose ?? price;
        if (price != null) next[y.sym] = { price, chg: prev ? ((price - prev) / prev) * 100 : 0 };
      } catch { /* garde les valeurs précédentes */ }
    }));
    setPrices((prev) => prev.map((x) => next[x.sym] ? { sym: x.sym, ...next[x.sym] } : x));
  }, []);

  useEffect(() => {
    loadQuotes();
    const id = setInterval(loadQuotes, 30_000);
    return () => clearInterval(id);
  }, [loadQuotes]);

  const refreshFeeds = useCallback(async () => {
    setProbing(true);
    try {
      const all = await probeAllFeeds();
      setFeeds(all);
    } catch {
      /* fail-soft */
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    refreshFeeds();
    const id = setInterval(refreshFeeds, 60_000);
    return () => clearInterval(id);
  }, [refreshFeeds]);

  const fmtP = (p: number) => p === 0 ? "…" : p >= 1000 ? p.toLocaleString("en-US", { maximumFractionDigits: 0 }) : p >= 10 ? p.toFixed(2) : p.toFixed(4);
  const summary = summarizeFeeds(feeds);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, background: T.bg1, borderBottom: `1px solid ${T.border}`, height: 30, overflow: "hidden", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 10px", height: "100%", borderRight: `1px solid ${T.border}`, flexShrink: 0, background: T.panel }}>
        <span title="Prix réels — crypto via Binance, indices/forex/matières/taux via Yahoo Finance. Rafraîchi toutes les 30 s." style={{ fontSize: 9, fontWeight: 700, color: T.green, border: `1px solid ${T.green}55`, borderRadius: 4, padding: "1px 5px", letterSpacing: 0.4 }}>TICKER RÉEL</span>
      </div>

      <div
        title={`Feeds live: ${summary.liveOk} OK · ${summary.down || 0} down · ${summary.needsConfig} à configurer · institutionnels hors scope`}
        style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 8px", height: "100%", borderRight: `1px solid ${T.border}`, flexShrink: 0, background: T.bg0 }}
      >
        {feeds.length === 0 ? (
          <span style={{ fontSize: 9, color: T.textFaint }}>{probing ? "feeds…" : "feeds —"}</span>
        ) : (
          feeds.filter((f) => f.status !== "scoped_out").map((f) => {
            const color = TONE[feedStatusTone(f.status)] || T.textFaint;
            return (
              <span
                key={f.id}
                title={`${f.label}: ${f.status}${f.detail ? ` — ${f.detail}` : ""}${f.latencyMs != null ? ` (${f.latencyMs}ms)` : ""}`}
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color,
                  border: `1px solid ${color}44`,
                  borderRadius: 3,
                  padding: "0 4px",
                  letterSpacing: 0.2,
                  cursor: "default",
                }}
              >
                {f.label}:{statusLabel(f.status)}
              </span>
            );
          })
        )}
        <button
          type="button"
          onClick={refreshFeeds}
          disabled={probing}
          title="Rafraîchir les probes feeds"
          style={{
            fontSize: 9,
            background: "transparent",
            border: `1px solid ${T.border}`,
            color: T.textDim,
            borderRadius: 3,
            padding: "0 4px",
            cursor: probing ? "wait" : "pointer",
          }}
        >
          ↻
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", overflow: "hidden", whiteSpace: "nowrap", flex: 1 }}>
        <div style={{ display: "inline-flex", animation: "ticker 60s linear infinite", gap: 0 }}>
          {[...prices, ...prices].map((x, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 14px", fontSize: 11, fontFamily: T.mono, borderRight: `1px solid ${T.borderSoft}` }}>
              <span style={{ color: T.textDim }}>{x.sym}</span>
              <span style={{ color: T.text }}>{fmtP(x.price)}</span>
              <span style={{ color: x.chg >= 0 ? T.green : T.red }}>{x.chg >= 0 ? "▲" : "▼"}{Math.abs(x.chg).toFixed(2)}%</span>
            </span>
          ))}
        </div>
      </div>
      <style>{`@keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
    </div>
  );
}
