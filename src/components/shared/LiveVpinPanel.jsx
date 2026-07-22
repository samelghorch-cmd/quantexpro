// Panneau VPIN temps réel (WebSocket Binance) — réutilisable partout.
// Crypto uniquement : pour les autres actifs, il n'existe pas de flux tick gratuit fiable.
import { useState } from "react";
import { useBinanceVpinFeed } from "../../hooks/useBinanceVpinFeed.js";
import { Panel, MetricCard, MetricGrid, ScoreGauge, Badge, Button, fmt } from "./ui.jsx";
import { T } from "./theme.js";

export function LiveVpinPanel({ ticker, label, window = 50 }) {
  const [on, setOn] = useState(false);
  const feed = useBinanceVpinFeed(ticker, { enabled: on && !!ticker, window });

  if (!ticker) {
    return (
      <Panel title="VPIN Live — temps réel">
        <div style={{ padding: 16, fontSize: 12.5, color: T.textDim, lineHeight: 1.6 }}>
          Flux tick live disponible <b style={{ color: T.orange }}>uniquement sur crypto</b> (WebSocket Binance, sans clé). Bascule en mode Réel et choisis BTC/ETH/SOL… pour activer le VPIN en direct.
        </div>
      </Panel>
    );
  }

  const cdfPct = Number.isNaN(feed.cdf) ? NaN : feed.cdf * 100;
  return (
    <Panel title={`VPIN Live — ${label || ticker} (Binance WebSocket)`} right={
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Badge color={feed.connected ? T.green : on ? T.yellow : T.textFaint}>{feed.connected ? "● EN DIRECT" : on ? "connexion…" : "○ arrêté"}</Badge>
        <Button onClick={() => setOn((o) => !o)}>{on ? "⏹ Stop" : "● Connecter"}</Button>
      </div>
    }>
      {!on ? (
        <div style={{ padding: 12, fontSize: 12, color: T.textDim }}>Connecte-toi au flux d'ordres réel de Binance pour voir la toxicité VPIN se mettre à jour tick par tick (classification acheteur/vendeur réelle).</div>
      ) : (
        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <ScoreGauge score={cdfPct} label="CDF VPIN" size={92} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: feed.tox.color, fontFamily: T.mono, marginBottom: 8 }}>{feed.tox.label}</div>
            <MetricGrid min={110}>
              <MetricCard label="VPIN" value={fmt(feed.vpin, 3)} color={feed.cdf >= 0.9 ? T.red : feed.cdf >= 0.7 ? T.yellow : T.green} />
              <MetricCard label="CDF" value={Number.isNaN(cdfPct) ? "—" : `${cdfPct.toFixed(0)}%`} color={feed.tox.color} />
              <MetricCard label="Prix" value={fmt(feed.lastPrice, 2)} color={T.orange} />
              <MetricCard label="Trades/s" value={fmt(feed.tps, 0)} sub={`${feed.buckets} buckets`} />
            </MetricGrid>
          </div>
        </div>
      )}
      {feed.error && <div style={{ marginTop: 8, fontSize: 10.5, color: T.red }}>⚠️ {feed.error} (réseau/pare-feu ? le WebSocket Binance peut être bloqué).</div>}
      <div style={{ marginTop: 8, fontSize: 10, color: T.textFaint, lineHeight: 1.5 }}>Classification order-flow réelle via le flag maker de chaque trade agrégé. Amorçage depuis les klines 1m. Au-delà du 90ᵉ percentile = flux toxique.</div>
    </Panel>
  );
}
