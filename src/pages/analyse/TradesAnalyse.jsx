// Trades & Analyse — décomposition heure/DOW/session, streaks, VaR/CVaR, du dernier backtest.
import { usePipeline } from "../../state/PipelineContext.jsx";
import { analyzeTrades } from "../../engine/analytics.ts";
import { Heatmap } from "../../components/charts/Heatmap.tsx";
import { Histogram } from "../../components/charts/Histogram.tsx";
import { Panel, MetricCard, MetricGrid, fmt, fmtUsd, fmtInt } from "../../components/shared/ui.tsx";
import { T, sideColor } from "../../components/shared/theme.ts";

function NoBacktest() {
  return <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Lance d'abord un backtest (onglet Backtest) — ce module analyse ses trades.</div></Panel>;
}

export function TradesPage() {
  const { pipeline } = usePipeline();
  const bt = pipeline.lastBacktest;
  if (!bt) return <NoBacktest />;
  const trades = bt.res.trades;
  const columns = ["#", "Entrée", "Sortie", "Sens", "Barres", "Raison", "PnL"];
  return (
    <Panel title={`Trades · ${bt.strat.name}`} right={<span style={{ fontSize: 11, color: T.textDim }}>{trades.length} trades</span>}>
      <div style={{ maxHeight: 560, overflow: "auto", fontFamily: T.mono, fontSize: 11 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{columns.map((h) => <th key={h} style={{ textAlign: "left", padding: "5px 10px", color: T.textDim, position: "sticky", top: 0, background: T.panel, fontSize: 10 }}>{h}</th>)}</tr></thead>
          <tbody>
            {trades.map((t, i) => (
              <tr key={i}>
                <td style={{ padding: "3px 10px", color: T.textFaint }}>{i + 1}</td>
                <td style={{ padding: "3px 10px" }}>{new Date(t.entryTime).toISOString().slice(5, 16).replace("T", " ")}</td>
                <td style={{ padding: "3px 10px" }}>{new Date(t.exitTime).toISOString().slice(5, 16).replace("T", " ")}</td>
                <td style={{ padding: "3px 10px", color: sideColor(t.side) }}>{t.side === 1 ? "LONG" : "SHORT"}</td>
                <td style={{ padding: "3px 10px", color: T.textDim }}>{t.bars}</td>
                <td style={{ padding: "3px 10px", color: T.textDim }}>{t.reason}</td>
                <td style={{ padding: "3px 10px", color: t.pnl >= 0 ? T.green : T.red }}>{fmtUsd(t.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function AnalysePage() {
  const { pipeline, bars } = usePipeline();
  const bt = pipeline.lastBacktest;
  if (!bt) return <NoBacktest />;
  const a = analyzeTrades(bt.res.trades, bars);
  if (!a) return <NoBacktest />;

  const hourRow = a.byHour.map((h) => h.n ? h.pnl : NaN);
  const dowRow = a.byDow.map((d) => d.n ? d.pnl : NaN);
  const DOW = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Statistiques clés">
        <MetricGrid min={140}>
          <MetricCard label="Max Win Streak" value={fmtInt(a.maxWinStreak)} color={T.green} />
          <MetricCard label="Max Loss Streak" value={fmtInt(a.maxLossStreak)} color={T.red} />
          <MetricCard label="PnL moyen" value={fmtUsd(a.mean)} color={a.mean >= 0 ? T.green : T.red} />
          <MetricCard label="Écart-type" value={fmtUsd(a.stdDev)} />
          <MetricCard label="VaR 95%" value={fmtUsd(a.var95)} color={T.red} />
          <MetricCard label="CVaR 95%" value={fmtUsd(a.cvar95)} color={T.red} />
          <MetricCard label="Meilleur" value={fmtUsd(a.best)} color={T.green} />
          <MetricCard label="Pire" value={fmtUsd(a.worst)} color={T.red} />
        </MetricGrid>
      </Panel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Panel title="PnL par heure (UTC)"><div style={{ overflowX: "auto" }}><Heatmap matrix={[hourRow]} rowLabels={["PnL"]} colLabels={a.byHour.map((_, i) => String(i))} cellW={26} title="" /></div></Panel>
        <Panel title="PnL par jour de semaine"><div style={{ overflowX: "auto" }}><Heatmap matrix={[dowRow]} rowLabels={["PnL"]} colLabels={DOW} cellW={44} title="" /></div></Panel>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Panel title="Distribution PnL"><Histogram data={bt.res.trades.map((t) => t.pnl)} bins={30} /></Panel>
        <Panel title="PnL par session">
          <MetricGrid min={120}>
            {Object.entries(a.bySession).map(([k, v]) => <MetricCard key={k} label={k.toUpperCase()} value={fmtUsd(v.pnl)} sub={`${v.n} trades`} color={v.pnl >= 0 ? T.green : T.red} />)}
          </MetricGrid>
        </Panel>
      </div>
    </div>
  );
}
