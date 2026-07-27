// Modules TRADING : Chart Live / Cockpit / Master Cockpit sont désormais RÉELS — flux
// Binance temps réel (crypto) via useBinanceLiveBars + chart TradingView, repli historique
// réel hors-crypto. Orchestrateur / News React / Live Optim restent sur l'historique réel.
import { useState, useMemo, useCallback } from "react";
import { usePipeline } from "../../state/PipelineContext.tsx";
import { useBinanceLiveBars } from "../../hooks/useBinanceLiveBars.ts";
import { buildContext } from "../../engine/context.ts";
import { runFAO } from "../../engine/fao.ts";
import { TvCandleChart } from "../../components/charts/TvCandleChart.tsx";
import { Panel, Button, Badge, SimBadge, MetricCard, MetricGrid, DataTable, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.tsx";
import { T, sideColor } from "../../components/shared/theme.ts";

// Flux courant : Binance temps réel si l'actif est crypto, sinon historique réel du pipeline.
function useLiveFeed() {
  const { bars, dataMeta, tf } = usePipeline();
  const sym = dataMeta?.symbol;
  const isCrypto = sym?.provider === "binance";
  const live = useBinanceLiveBars({ ticker: isCrypto ? sym.ticker : null, tf, warmBars: bars, enabled: isCrypto });
  return { isCrypto, liveBars: isCrypto ? live.bars : bars, connected: live.connected, last: isCrypto ? live.last : (bars[bars.length - 1] || null) };
}

function LiveBadge({ isCrypto, connected }) {
  if (!isCrypto) return <Badge color={T.textDim}>historique réel</Badge>;
  return <Badge color={connected ? T.green : T.yellow}>{connected ? "● LIVE Binance" : "connexion…"}</Badge>;
}

export function ChartLivePage() {
  const { assetKey } = usePipeline();
  const { isCrypto, liveBars, connected, last } = useLiveFeed();
  return (
    <Panel title={`Chart Live · ${assetKey}`} right={<LiveBadge isCrypto={isCrypto} connected={connected} />}>
      <TvCandleChart bars={liveBars} height={480} />
      <div style={{ marginTop: 8, fontSize: 11, color: T.textDim }}>
        Dernier prix : <b style={{ color: T.text, fontFamily: T.mono }}>{last?.c != null ? last.c.toFixed(2) : "—"}</b>
        {!isCrypto && <span style={{ color: T.textFaint }}> · Flux temps réel dispo sur la crypto (Binance). Pour {assetKey}, pas de flux intraday gratuit — dernier historique réel affiché (interactif).</span>}
      </div>
    </Panel>
  );
}

function CockpitBase({ title, master }) {
  const { library } = usePipeline();
  const { isCrypto, liveBars, connected, last } = useLiveFeed();
  const slots = master ? [1, 3, 21, 31, 24, 55] : [3, 21, 31];
  const liveCtx = useMemo(() => liveBars.length > 60 ? buildContext(liveBars) : null, [liveBars]);
  const i = liveBars.length - 1;

  const signals = slots.map((id) => {
    const s = library.find((x) => x.id === id);
    if (!s || i < 1 || !liveCtx) return { id, name: s?.name, long: false, short: false };
    const sig = s.eval(liveCtx, i);
    return { id, name: s.name, long: sig.long, short: sig.short };
  });
  const nLong = signals.filter((s) => s.long).length;
  const nShort = signals.filter((s) => s.short).length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: master ? "1fr 320px" : "1fr 280px", gap: 14, alignItems: "start" }}>
      <Panel title={title} right={<LiveBadge isCrypto={isCrypto} connected={connected} />}>
        <TvCandleChart bars={liveBars} height={master ? 460 : 380} />
      </Panel>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Panel title="Confluence live">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: T.greenSoft, border: `1px solid ${T.green}44`, borderRadius: 8, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.textDim }}>LONG</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: T.green }}>{nLong}<span style={{ fontSize: 13 }}>/{slots.length}</span></div>
            </div>
            <div style={{ background: T.redSoft, border: `1px solid ${T.red}44`, borderRadius: 8, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.textDim }}>SHORT</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: T.red }}>{nShort}<span style={{ fontSize: 13 }}>/{slots.length}</span></div>
            </div>
          </div>
        </Panel>
        <Panel title={`Slots (${slots.length})`}>
          {signals.map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${T.borderSoft}`, fontSize: 11.5 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>#{s.id} {s.name}</span>
              <span>{s.long ? <Badge color={T.long}>LONG</Badge> : s.short ? <Badge color={T.short}>SHORT</Badge> : <span style={{ color: T.textFaint }}>—</span>}</span>
            </div>
          ))}
        </Panel>
        {master && <Panel title="État marché"><MetricGrid min={110}><MetricCard label="Prix" value={last?.c != null ? last.c.toFixed(2) : "—"} /><MetricCard label="ATR14" value={liveCtx ? fmt(liveCtx.atr14[i]) : "—"} /><MetricCard label="RSI14" value={liveCtx ? fmt(liveCtx.rsi[14][i], 0) : "—"} /><MetricCard label="ADX14" value={liveCtx ? fmt(liveCtx.adx14.adx[i], 0) : "—"} /></MetricGrid></Panel>}
      </div>
    </div>
  );
}

export function CockpitPage() { return <CockpitBase title="Cockpit" master={false} />; }
export function MasterCockpitPage() { return <CockpitBase title="Master Cockpit" master={true} />; }

export function OrchestrateurPage() {
  const { library } = usePipeline();
  const { isCrypto, liveBars, connected } = useLiveFeed();
  const liveCtx = useMemo(() => liveBars.length > 60 ? buildContext(liveBars) : null, [liveBars]);
  const slots = [1, 3, 4, 21, 31, 24, 55, 94];
  const i = liveBars.length - 1;
  const rows = slots.map((id) => {
    const s = library.find((x) => x.id === id);
    if (!s || !liveCtx) return { id, name: s?.name, cat: s?.cat, longCount: 0, shortCount: 0, state: "FLAT" };
    let longCount = 0, shortCount = 0;
    for (let k = Math.max(1, liveBars.length - 200); k < liveBars.length; k++) {
      const sig = s.eval(liveCtx, k);
      if (sig.long) longCount++; if (sig.short) shortCount++;
    }
    const cur = i >= 1 ? s.eval(liveCtx, i) : { long: false, short: false };
    return { id, name: s.name, cat: s.cat, longCount, shortCount, state: cur.long ? "LONG" : cur.short ? "SHORT" : "FLAT" };
  });
  const columns = [
    { key: "id", label: "#", render: (r) => r.id },
    { key: "name", label: "Stratégie", render: (r) => r.name },
    { key: "state", label: "État live", render: (r) => <Badge color={r.state === "LONG" || r.state === "SHORT" ? sideColor(r.state) : T.textFaint}>{r.state}</Badge> },
    { key: "longCount", label: "Signaux L (200b)", align: "right", render: (r) => r.longCount, color: () => T.green },
    { key: "shortCount", label: "Signaux S (200b)", align: "right", render: (r) => r.shortCount, color: () => T.red },
  ];
  return (
    <Panel title="Orchestrateur multi-stratégies" right={<LiveBadge isCrypto={isCrypto} connected={connected} />}>
      <DataTable columns={columns} rows={rows} maxHeight={420} />
      <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>Coordonne plusieurs stratégies en parallèle. État évalué sur la dernière bougie {isCrypto ? "temps réel (Binance)" : "réelle"}.</div>
    </Panel>
  );
}

export function NewsReactPage() {
  const { isCrypto, liveBars, connected } = useLiveFeed();
  // Détecte les chocs de volatilité (proxy d'événements « news ») sur les données réelles.
  const events = useMemo(() => {
    const evs = [];
    for (let i = 1; i < liveBars.length; i++) {
      const range = (liveBars[i].h - liveBars[i].l) / liveBars[i].c;
      const prevRange = (liveBars[i - 1].h - liveBars[i - 1].l) / liveBars[i - 1].c;
      if (range > prevRange * 3 && range > 0.008) {
        evs.push({ i, t: liveBars[i].t, range: range * 100, dir: liveBars[i].c > liveBars[i].o ? "hausse" : "baisse", move: ((liveBars[i].c - liveBars[i].o) / liveBars[i].o) * 100 });
      }
    }
    return evs.slice(-40).reverse();
  }, [liveBars]);
  const columns = [
    { key: "t", label: "Barre", render: (r) => new Date(r.t).toISOString().slice(5, 16).replace("T", " ") },
    { key: "range", label: "Amplitude %", align: "right", render: (r) => fmtPct(r.range, 2), color: () => T.yellow },
    { key: "dir", label: "Direction", render: (r) => <Badge color={r.dir === "hausse" ? T.green : T.red}>{r.dir}</Badge> },
    { key: "move", label: "Mouvement %", align: "right", render: (r) => fmtPct(r.move, 2), color: (r) => r.move >= 0 ? T.green : T.red },
  ];
  return (
    <Panel title="News React — chocs de volatilité détectés" right={<LiveBadge isCrypto={isCrypto} connected={connected} />}>
      <div style={{ fontSize: 11, color: T.textDim, marginBottom: 10 }}>Détecte les spikes de volatilité (proxy d'événements « news ») sur les données {isCrypto ? "temps réel" : "réelles"}. {events.length} événements sur la période.</div>
      <DataTable columns={columns} rows={events} maxHeight={380} />
    </Panel>
  );
}

export function LiveOptimPage() {
  const { bars, ctx, library, symbol } = usePipeline();
  const [stratId] = useState(3);
  const [runs, setRuns] = useState([]);
  const tick = useCallback(() => {
    const strat = library.find((s) => s.id === stratId);
    const seed = Math.floor(Math.random() * 100000);
    const res = runFAO(bars, ctx, strat, { nSamples: 40, contract: symbol, seed });
    setRuns((r) => [{ t: Date.now(), best: res.best, n: res.combos.length }, ...r].slice(0, 12));
  }, [library, stratId, bars, ctx, symbol]);
  const columns = [
    { key: "t", label: "Heure", render: (r) => new Date(r.t).toLocaleTimeString("fr-FR") },
    { key: "sl", label: "Best SL/TP", render: (r) => `${r.best.params.slAtr}/${r.best.params.tpAtr || "—"}` },
    { key: "expectancyR", label: "Exp.R", align: "right", render: (r) => fmt(r.best.expectancyR), color: (r) => r.best.expectancyR >= 0 ? T.green : T.red },
    { key: "sharpe", label: "Sharpe", align: "right", render: (r) => fmt(r.best.sharpe) },
    { key: "pnl", label: "PnL", align: "right", render: (r) => fmtUsd(r.best.totalPnL), color: (r) => r.best.totalPnL >= 0 ? T.green : T.red },
  ];
  return (
    <Panel title="Live Optim — ré-optimisation continue" right={<div style={{ display: "flex", gap: 8 }}><SimBadge /><Button primary onClick={tick}>▶ Cycle d'optim</Button></div>}>
      <div style={{ fontSize: 11, color: T.textDim, marginBottom: 10 }}>Rejoue une passe FAO allégée à chaque cycle sur les <b style={{ color: T.textDim }}>données réelles</b> courantes ({symbol}) — simule une ré-optimisation périodique (à la demande).</div>
      <DataTable columns={columns} rows={runs} maxHeight={360} />
    </Panel>
  );
}
