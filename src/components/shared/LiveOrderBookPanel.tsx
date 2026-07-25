// Carnet L2 Binance live (@depth + @bookTicker) — remplace le mock quand crypto.
import { useState } from "react";
import { useBinanceOrderBook } from "../../hooks/useBinanceOrderBook.ts";
import { Panel, Button, Badge, MetricCard, MetricGrid, fmt, fmtPct } from "./ui.tsx";
import { T } from "./theme.ts";
import type { BookLevel } from "../../engine/binanceOrderBook.ts";

interface MockBookData {
  bids: BookLevel[];
  asks: BookLevel[];
  mid: number;
  spreadBps?: number;
}

function BookSide({ rows, side, maxSize }: { rows: BookLevel[]; side: "ask" | "bid"; maxSize: number }) {
  const color = side === "ask" ? T.red : T.green;
  const ordered = side === "ask" ? [...rows].reverse() : rows;
  return ordered.map((r, i) => {
    const w = maxSize > 0 ? (r.size / maxSize) * 100 : 0;
    return (
      <div key={`${side}-${i}`} style={{ display: "flex", justifyContent: "space-between", padding: "3px 8px", position: "relative" }}>
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: `${Math.min(100, w * 2.5)}%`, background: `${color}18` }} />
        <span style={{ color, zIndex: 1, fontFamily: T.mono }}>{r.price.toFixed(r.price >= 100 ? 2 : 4)}</span>
        <span style={{ color: T.textDim, zIndex: 1, fontFamily: T.mono }}>{fmt(r.size, 4)}</span>
      </div>
    );
  });
}

export function LiveOrderBookPanel({
  ticker,
  label,
  levels = 20,
  mockBook = null,
}: {
  ticker: string | null;
  label?: string;
  levels?: number;
  mockBook?: MockBookData | null;
}) {
  const [on, setOn] = useState(false);
  const feed = useBinanceOrderBook(ticker, { enabled: on && !!ticker, levels });

  if (!ticker) {
    return (
      <Panel title="Order Book L2" right={mockBook ? <Badge color={T.yellow}>SIMULÉ</Badge> : null}>
        <div style={{ padding: 12, fontSize: 12, color: T.textDim, lineHeight: 1.5, marginBottom: mockBook ? 10 : 0 }}>
          Carnet L2 réel via WebSocket Binance (<code>@depth</code> + <code>@bookTicker</code>) —
          disponible sur <b style={{ color: T.orange }}>crypto</b> (BTC/ETH/SOL…). Choisis un actif Binance en mode Réel.
        </div>
        {mockBook && <MockBook book={mockBook} />}
      </Panel>
    );
  }

  const book: MockBookData | typeof feed | null = feed.connected && feed.bids?.length
    ? feed
    : mockBook;
  const maxSize = book
    ? Math.max(...[...(book.bids || []), ...(book.asks || [])].map((x) => x.size || 0), 1)
    : 1;
  const live = on && feed.connected && feed.real;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel
        title={`Order Book L2 — ${label || ticker}`}
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge color={live ? T.green : on ? T.yellow : T.textFaint}>
              {live ? "● BINANCE LIVE" : on ? "connexion…" : "○ arrêté"}
            </Badge>
            <Button onClick={() => setOn((o) => !o)}>{on ? "⏹ Stop" : "● Connecter"}</Button>
          </div>
        }
      >
        {feed.error && (
          <div style={{ marginBottom: 8, fontSize: 11, color: T.red }}>{feed.error}</div>
        )}
        {!book ? (
          <div style={{ padding: 20, textAlign: "center", color: T.textDim, fontSize: 12 }}>
            Connecte le flux pour recevoir le carnet.
          </div>
        ) : (
          <div style={{ fontFamily: T.mono, fontSize: 12 }}>
            <BookSide rows={(book.asks || []).slice(0, levels)} side="ask" maxSize={maxSize} />
            <div style={{ padding: "6px 8px", textAlign: "center", color: T.orange, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
              mid {Number.isFinite(book.mid) ? book.mid.toFixed(book.mid >= 100 ? 2 : 4) : "—"}
              {Number.isFinite(book.spreadBps) && (
                <span style={{ color: T.textDim, marginLeft: 10 }}>spread {fmt(book.spreadBps as number, 2)} bps</span>
              )}
            </div>
            <BookSide rows={(book.bids || []).slice(0, levels)} side="bid" maxSize={maxSize} />
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>
          Sources : <code>@depth{levels}@100ms</code> + <code>@bookTicker</code> · msgs {feed.msgs || 0}
          {!live && mockBook ? " · affichage fallback simulé" : ""}
        </div>
      </Panel>

      {live && (
        <Panel title="Spread & déséquilibre (réels)">
          <MetricGrid min={110}>
            <MetricCard label="Best Bid" value={fmt(feed.bestBid, feed.bestBid >= 100 ? 2 : 4)} color={T.green} />
            <MetricCard label="Best Ask" value={fmt(feed.bestAsk, feed.bestAsk >= 100 ? 2 : 4)} color={T.red} />
            <MetricCard label="Spread" value={Number.isFinite(feed.spread) ? fmt(feed.spread, 4) : "—"} color={T.orange} />
            <MetricCard label="Spread bps" value={Number.isFinite(feed.spreadBps) ? fmt(feed.spreadBps, 2) : "—"} color={T.orange} />
            <MetricCard label="Imbalance" value={Number.isFinite(feed.imbalance) ? fmtPct(feed.imbalance) : "—"} color={feed.imbalance >= 0 ? T.green : T.red} />
            <MetricCard label="Bid vol" value={fmt(feed.bidVol, 3)} color={T.green} />
            <MetricCard label="Ask vol" value={fmt(feed.askVol, 3)} color={T.red} />
          </MetricGrid>
        </Panel>
      )}
    </div>
  );
}

function MockBook({ book }: { book: MockBookData }) {
  const maxSize = Math.max(...[...book.bids, ...book.asks].map((x) => x.size), 1);
  return (
    <div style={{ fontFamily: T.mono, fontSize: 12 }}>
      <BookSide rows={book.asks} side="ask" maxSize={maxSize} />
      <div style={{ padding: "6px 8px", textAlign: "center", color: T.orange, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
        mid {book.mid.toFixed(2)} · <span style={{ color: T.yellow }}>SIMULÉ</span>
      </div>
      <BookSide rows={book.bids} side="bid" maxSize={maxSize} />
    </div>
  );
}
