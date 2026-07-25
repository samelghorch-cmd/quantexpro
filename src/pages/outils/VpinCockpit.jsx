// Cockpit VPIN Live — toxicité du flux d'ordres en TEMPS RÉEL sur plusieurs cryptos.
// Une toxicité qui monte simultanément sur BTC/ETH/SOL = stress de marché généralisé.
import { useState } from "react";
import { useBinanceVpinFeed } from "../../hooks/useBinanceVpinFeed.ts";
import { Panel, Button, Badge, ScoreGauge, fmt } from "../../components/shared/ui.tsx";
import { T } from "../../components/shared/theme.ts";

const ASSETS = [
  { t: "BTCUSDT", l: "Bitcoin" },
  { t: "ETHUSDT", l: "Ethereum" },
  { t: "SOLUSDT", l: "Solana" },
  { t: "BNBUSDT", l: "BNB" },
  { t: "XRPUSDT", l: "XRP" },
];

function VpinTile({ ticker, label, enabled }) {
  const feed = useBinanceVpinFeed(ticker, { enabled, window: 30 });
  const cdfPct = Number.isNaN(feed.cdf) ? NaN : feed.cdf * 100;
  const tox = feed.tox;
  const toxic = tox.level === "toxic";
  return (
    <div style={{
      background: T.panelAlt, border: `1px solid ${enabled ? tox.color + "66" : T.border}`,
      borderLeft: `3px solid ${enabled ? tox.color : T.border}`, borderRadius: 10, padding: 14,
      boxShadow: toxic ? `0 0 18px ${T.red}55` : "none", transition: "box-shadow .3s, border-color .3s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <b style={{ fontSize: 14 }}>{label}</b>
        <Badge color={feed.connected ? T.green : enabled ? T.yellow : T.textFaint}>{feed.connected ? "● live" : enabled ? "…" : "○"}</Badge>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <ScoreGauge score={cdfPct} label="CDF" size={72} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: tox.color, fontFamily: T.mono }}>{enabled ? tox.label : "—"}</div>
          <div style={{ fontSize: 11.5, color: T.textDim, fontFamily: T.mono, marginTop: 4, lineHeight: 1.5 }}>
            VPIN <b style={{ color: T.text }}>{fmt(feed.vpin, 3)}</b><br />
            Prix <b style={{ color: T.orange }}>{fmt(feed.lastPrice, 2)}</b><br />
            <span style={{ color: T.textFaint }}>{fmt(feed.tps, 0)} tr/s</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function VpinCockpitPage() {
  const [on, setOn] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Cockpit VPIN Live — toxicité multi-actifs (Binance WebSocket)" right={
        <Button primary onClick={() => setOn((o) => !o)}>{on ? "⏹ Tout arrêter" : "● Connecter tout"}</Button>
      }>
        <div style={{ fontSize: 11.5, color: T.textDim, lineHeight: 1.6 }}>
          Toxicité du flux d'ordres (VPIN, classification acheteur/vendeur réelle) en direct sur plusieurs cryptos. Quand la CDF grimpe <b style={{ color: T.orange }}>simultanément</b> (plusieurs tuiles rouges), c'est un signe de stress de marché généralisé — configuration d'avant-krach. Chaque tuile passe au rouge et pulse au-delà du 99ᵉ percentile. ⚠️ Signal de risque, pas un conseil d'investissement.
        </div>
      </Panel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {ASSETS.map((a) => <VpinTile key={a.t} ticker={a.t} label={a.l} enabled={on} />)}
      </div>
    </div>
  );
}
