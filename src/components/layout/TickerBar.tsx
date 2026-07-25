// P4-FEEDS — bandeau ticker simulé + statut multi-feeds réels.
import { useCallback, useEffect, useRef, useState } from "react";
import { T } from "../shared/theme.ts";
import { seededRandom } from "../../engine/random.ts";
import {
  probeAllFeeds,
  feedStatusTone,
  summarizeFeeds,
  type FeedHealth,
  type FeedStatus,
  type FeedTone,
} from "../../engine/feedStatus.ts";

interface Instrument {
  sym: string;
  base: number;
  vol: number;
  price: number;
  chg: number;
}

const INSTRUMENTS: Omit<Instrument, "price" | "chg">[] = [
  { sym: "BTC", base: 62000, vol: 0.004 }, { sym: "ETH", base: 3400, vol: 0.005 },
  { sym: "SOL", base: 145, vol: 0.008 }, { sym: "EUR/USD", base: 1.083, vol: 0.0008 },
  { sym: "GBP/USD", base: 1.264, vol: 0.0009 }, { sym: "USD/JPY", base: 151.2, vol: 0.001 },
  { sym: "AUD/USD", base: 0.657, vol: 0.001 }, { sym: "S&P 500", base: 5240, vol: 0.0015 },
  { sym: "NASDAQ 100", base: 18300, vol: 0.002 }, { sym: "Russell 2K", base: 2080, vol: 0.0025 },
  { sym: "Gold", base: 2320, vol: 0.0015 }, { sym: "Silver", base: 27.4, vol: 0.003 },
  { sym: "WTI Oil", base: 81.5, vol: 0.004 }, { sym: "DXY", base: 104.2, vol: 0.0006 },
  { sym: "20Y Treas", base: 98.4, vol: 0.001 }, { sym: "High Yield", base: 76.8, vol: 0.0012 },
  { sym: "VIX", base: 14.2, vol: 0.02 },
];

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
  const [prices, setPrices] = useState<Instrument[]>(() => INSTRUMENTS.map((x) => ({ ...x, price: x.base, chg: 0 })));
  const [feeds, setFeeds] = useState<FeedStatus[]>([]);
  const [probing, setProbing] = useState(false);
  const rnd = useRef(seededRandom(7)).current;

  useEffect(() => {
    const id = setInterval(() => {
      setPrices((prev) => prev.map((x) => {
        const shock = (rnd() - 0.5) * 2 * x.vol;
        const price = x.price * (1 + shock);
        const chg = ((price - x.base) / x.base) * 100;
        return { ...x, price, chg };
      }));
    }, 1500);
    return () => clearInterval(id);
  }, [rnd]);

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

  const fmtP = (p: number) => p >= 1000 ? p.toLocaleString("en-US", { maximumFractionDigits: 0 }) : p >= 10 ? p.toFixed(2) : p.toFixed(4);
  const summary = summarizeFeeds(feeds);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, background: T.bg1, borderBottom: `1px solid ${T.border}`, height: 30, overflow: "hidden", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 10px", height: "100%", borderRight: `1px solid ${T.border}`, flexShrink: 0, background: T.panel }}>
        <span title="Ce bandeau décoratif est une marche aléatoire — il ne reflète JAMAIS le marché réel." style={{ fontSize: 9, fontWeight: 700, color: T.yellow, border: `1px solid ${T.yellow}55`, borderRadius: 4, padding: "1px 5px", letterSpacing: 0.4 }}>TICKER SIMULÉ</span>
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
