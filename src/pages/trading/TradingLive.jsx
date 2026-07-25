// Modules TRADING "live" (démo synthétique) : Chart Live, Cockpit, Master Cockpit, Orchestrateur, News React, Live Optim.
import { useState, useMemo, useCallback } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { useSyntheticLiveFeed } from "../../hooks/useSyntheticLiveFeed.ts";
import { buildContext } from "../../engine/context.ts";
import { runFAO } from "../../engine/fao.ts";
import { CandlestickChart } from "../../components/charts/CandlestickChart.jsx";
import { Panel, Button, Badge, SimBadge, MetricCard, MetricGrid, DataTable, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.jsx";
import { T, sideColor } from "../../components/shared/theme.ts";

function LiveControls({ feed }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <SimBadge />
      <Button onClick={() => feed.setPlaying((p) => !p)}>{feed.playing ? "⏸ Pause" : "▶ Play"}</Button>
      <Button onClick={() => feed.setIdx((i) => Math.min(feed.idx + 20, 100000))}>⏭ +20</Button>
      <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.mono }}>bar {feed.idx}</span>
    </div>
  );
}

export function ChartLivePage() {
  const { bars } = usePipeline();
  const feed = useSyntheticLiveFeed(bars, { autoStart: true });
  const ctx = useMemo(() => feed.visible.length > 60 ? buildContext(feed.visible) : null, [feed.visible]);
  const overlays = useMemo(() => ctx ? [
    { name: "EMA20", data: ctx.ema[20], color: T.blue, width: 1.5 },
    { name: "EMA50", data: ctx.ema[50], color: T.purple, width: 1.5 },
    { name: "VWAP", data: ctx.vwap, color: T.yellow, width: 1.5 },
  ] : [], [ctx]);
  return (
    <Panel title="Chart Live (rejeu synthétique)" right={<LiveControls feed={feed} />}>
      {ctx ? <CandlestickChart bars={feed.visible} ctx={ctx} overlays={overlays} signals={[]} height={480} /> : <div style={{ padding: 20, color: T.textDim }}>Chargement du flux…</div>}
      <div style={{ marginTop: 8, fontSize: 11, color: T.textDim }}>Dernier prix : <b style={{ color: T.text, fontFamily: T.mono }}>{feed.last?.c.toFixed(2)}</b></div>
    </Panel>
  );
}

function CockpitBase({ title, master }) {
  const { bars, ctx, library, symbol } = usePipeline();
  const feed = useSyntheticLiveFeed(bars, { autoStart: true });
  const slots = master ? [1, 3, 21, 31, 24, 55] : [3, 21, 31];
  const liveCtx = useMemo(() => feed.visible.length > 60 ? buildContext(feed.visible) : ctx, [feed.visible, ctx]);
  const i = feed.visible.length - 1;

  const signals = slots.map((id) => {
    const s = library.find((x) => x.id === id);
    if (!s || i < 1) return { id, name: s?.name, long: false, short: false };
    const sig = s.eval(liveCtx, i);
    return { id, name: s.name, long: sig.long, short: sig.short };
  });
  const nLong = signals.filter((s) => s.long).length;
  const nShort = signals.filter((s) => s.short).length;

  const overlays = useMemo(() => liveCtx ? [
    { name: "EMA20", data: liveCtx.ema[20], color: T.blue, width: 1.5 },
    { name: "VWAP", data: liveCtx.vwap, color: T.yellow, width: 1.5 },
  ] : [], [liveCtx]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: master ? "1fr 320px" : "1fr 280px", gap: 14, alignItems: "start" }}>
      <Panel title={title} right={<LiveControls feed={feed} />}>
        {liveCtx && <CandlestickChart bars={feed.visible} ctx={liveCtx} overlays={overlays} signals={[]} height={master ? 460 : 380} />}
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
        {master && <Panel title="État marché"><MetricGrid min={110}><MetricCard label="Prix" value={feed.last?.c.toFixed(2)} /><MetricCard label="ATR14" value={liveCtx ? fmt(liveCtx.atr14[i]) : "—"} /><MetricCard label="RSI14" value={liveCtx ? fmt(liveCtx.rsi[14][i], 0) : "—"} /><MetricCard label="ADX14" value={liveCtx ? fmt(liveCtx.adx14.adx[i], 0) : "—"} /></MetricGrid></Panel>}
      </div>
    </div>
  );
}

export function CockpitPage() { return <CockpitBase title="Cockpit" master={false} />; }
export function MasterCockpitPage() { return <CockpitBase title="Master Cockpit" master={true} />; }

export function OrchestrateurPage() {
  const { bars, ctx, library } = usePipeline();
  const slots = [1, 3, 4, 21, 31, 24, 55, 94];
  const i = bars.length - 1;
  const rows = slots.map((id) => {
    const s = library.find((x) => x.id === id);
    let longCount = 0, shortCount = 0;
    for (let k = Math.max(1, bars.length - 200); k < bars.length; k++) {
      const sig = s.eval(ctx, k);
      if (sig.long) longCount++; if (sig.short) shortCount++;
    }
    const cur = i >= 1 ? s.eval(ctx, i) : { long: false, short: false };
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
    <Panel title="Orchestrateur multi-stratégies" right={<SimBadge />}>
      <DataTable columns={columns} rows={rows} maxHeight={420} />
      <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>Coordonne plusieurs stratégies en parallèle. État live évalué sur la dernière barre du marché synthétique.</div>
    </Panel>
  );
}

export function NewsReactPage() {
  const { bars } = usePipeline();
  // Détecte les chocs de volatilité déjà encodés dans le générateur synthétique.
  const events = useMemo(() => {
    const evs = [];
    for (let i = 1; i < bars.length; i++) {
      const range = (bars[i].h - bars[i].l) / bars[i].c;
      const prevRange = (bars[i - 1].h - bars[i - 1].l) / bars[i - 1].c;
      if (range > prevRange * 3 && range > 0.008) {
        evs.push({ i, t: bars[i].t, range: range * 100, dir: bars[i].c > bars[i].o ? "hausse" : "baisse", move: ((bars[i].c - bars[i].o) / bars[i].o) * 100 });
      }
    }
    return evs.slice(-40).reverse();
  }, [bars]);
  const columns = [
    { key: "t", label: "Barre", render: (r) => new Date(r.t).toISOString().slice(5, 16).replace("T", " ") },
    { key: "range", label: "Amplitude %", align: "right", render: (r) => fmtPct(r.range, 2), color: () => T.yellow },
    { key: "dir", label: "Direction", render: (r) => <Badge color={r.dir === "hausse" ? T.green : T.red}>{r.dir}</Badge> },
    { key: "move", label: "Mouvement %", align: "right", render: (r) => fmtPct(r.move, 2), color: (r) => r.move >= 0 ? T.green : T.red },
  ];
  return (
    <Panel title="News React — chocs de volatilité détectés" right={<SimBadge />}>
      <div style={{ fontSize: 11, color: T.textDim, marginBottom: 10 }}>Détecte les spikes de volatilité (proxy d'événements news) encodés dans le marché synthétique. {events.length} événements sur la période.</div>
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
      <div style={{ fontSize: 11, color: T.textDim, marginBottom: 10 }}>Rejoue une passe FAO allégée à chaque cycle (simule une ré-optimisation périodique sur le flux).</div>
      <DataTable columns={columns} rows={runs} maxHeight={360} />
    </Panel>
  );
}
