// Statistical Edge — Module 1 : grille 10 métriques sur indicateurs + export CSV.
import { useMemo, useState } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import {
  runStatisticalEdge,
  metricsToCSV,
  seriesToCSV,
  defaultIndicatorSeries,
} from "../../engine/statisticalEdge.js";
import { downloadCSV } from "../../engine/exportUtils.js";
import { LineChart } from "../../components/charts/LineChart.jsx";
import { Panel, Button, Badge, Field, NumberInput, MetricCard, MetricGrid, DataTable, fmt, fmtPct } from "../../components/shared/ui.jsx";
import { T } from "../../components/shared/theme.js";

const scoreColor = (s) => (s >= 60 ? T.green : s >= 40 ? T.yellow : T.red);

export function StatisticalEdgePage() {
  const { bars, ctx, assetKey, symbol, usingReal } = usePipeline();
  const [horizon, setHorizon] = useState(5);
  const [windowN, setWindowN] = useState(0); // 0 = toute la série
  const [selected, setSelected] = useState(null);
  const [auto, setAuto] = useState(true);

  const catalog = useMemo(() => defaultIndicatorSeries(ctx), [ctx]);

  const report = useMemo(() => {
    if (!bars?.length || !ctx) return null;
    return runStatisticalEdge(bars, ctx, {
      horizon,
      window: windowN > 0 ? windowN : null,
    });
  }, [bars, ctx, horizon, windowN, auto]); // auto force refresh intent

  const rows = report?.rows || [];
  const selName = selected || rows[0]?.name || null;
  const selSeries = selName ? catalog[selName] : null;

  const columns = [
    { key: "rank", label: "#", render: (_, i) => i + 1 },
    { key: "name", label: "Indicateur", render: (r) => r.name },
    { key: "noise", label: "Bruit", align: "right", render: (r) => fmt(r.noise, 3), color: (r) => (r.noise > 0.7 ? T.red : T.text) },
    { key: "persist", label: "Persist. H", align: "right", render: (r) => fmt(r.persist, 3), color: (r) => (r.persist > 0.55 ? T.green : r.persist < 0.45 ? T.red : T.yellow) },
    { key: "cross", label: "Croisem./100", align: "right", render: (r) => fmt(r.crossovers, 1) },
    { key: "corrR", label: "Corr Rdt", align: "right", render: (r) => fmt(r.corrRet, 3), color: (r) => (Math.abs(r.corrRet) > 0.05 ? (r.corrRet > 0 ? T.green : T.red) : T.textDim) },
    { key: "lag", label: "Lag", align: "right", render: (r) => r.lag },
    { key: "ic", label: "IC", align: "right", render: (r) => fmt(r.ic, 4), color: (r) => (Math.abs(r.ic) > 0.05 ? (r.ic > 0 ? T.green : T.red) : T.textDim) },
    { key: "hit", label: "Hit %", align: "right", render: (r) => fmt(r.hit, 1) },
    { key: "edge", label: "Edge Net", align: "right", render: (r) => fmt(r.edgeNet, 2), color: (r) => (r.edgeNet > 0 ? T.green : T.red) },
    { key: "n", label: "N", align: "right", render: (r) => r.n },
    { key: "z", label: "Z / %ile", align: "right", render: (r) => `${fmt(r.zScore, 2)} / ${fmt(r.percentile, 0)}` },
    { key: "score", label: "Score", align: "right", render: (r) => fmt(r.score, 0), color: (r) => scoreColor(r.score) },
  ];

  const exportMetrics = () => downloadCSV(metricsToCSV(rows), `stat_edge_metrics_${assetKey || symbol}.csv`);
  const exportSeries = () => downloadCSV(seriesToCSV(bars, catalog), `stat_edge_series_${assetKey || symbol}.csv`);

  const top = rows[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Statistical Edge — Module 1</div>
            <div style={{ fontSize: 12, color: T.textDim, marginTop: 4, lineHeight: 1.5 }}>
              Grille de <b style={{ color: T.orange }}>10 métriques</b> sur chaque indicateur (bruit, Hurst, croisements,
              corr, lag, IC, hit, edge net, N, Z/%ile) vs rendement futur à t+k.
              Actif : <b>{assetKey || symbol}</b> · {usingReal ? "données réelles" : "synthétique"}.
            </div>
          </div>
          <Badge color={auto ? T.green : T.yellow}>{auto ? "Auto" : "Manuel"}</Badge>
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 14, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Panel title="Paramètres">
            <Field label="Horizon k (barres)">
              <NumberInput value={horizon} min={1} max={50} onChange={setHorizon} />
            </Field>
            <div style={{ height: 8 }} />
            <Field label="Fenêtre N (0 = tout)">
              <NumberInput value={windowN} min={0} step={50} onChange={setWindowN} />
            </Field>
            <div style={{ height: 8 }} />
            <Button onClick={() => setAuto((a) => !a)} style={{ width: "100%" }}>
              Basculer {auto ? "Manuel" : "Auto"}
            </Button>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <Button primary onClick={exportMetrics} disabled={!rows.length}>CSV MÉTRIQUES</Button>
              <Button onClick={exportSeries} disabled={!bars?.length}>CSV SÉRIES</Button>
            </div>
          </Panel>

          {top && (
            <Panel title="Meilleur edge">
              <MetricGrid min={110}>
                <MetricCard label="Indicateur" value={top.name} color={T.orange} />
                <MetricCard label="Score" value={fmt(top.score, 0)} color={scoreColor(top.score)} />
                <MetricCard label="IC" value={fmt(top.ic, 4)} color={top.ic > 0 ? T.green : T.red} />
                <MetricCard label="Edge Net" value={fmtPct(top.edgeNet)} color={top.edgeNet > 0 ? T.green : T.red} />
              </MetricGrid>
            </Panel>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Panel title={`Grille d'évaluation (${rows.length} indicateurs)`}>
            <DataTable
              columns={columns}
              rows={rows}
              maxHeight={420}
              selectedIdx={selName ? rows.findIndex((r) => r.name === selName) : 0}
              onRowClick={(r) => setSelected(r.name)}
            />
            <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint, lineHeight: 1.45 }}>
              H&gt;0.5 tendance · H&lt;0.5 mean-reversion · |IC|&gt;0.05 = signal exploitable · Edge Net = Hit − 50 %.
              Clique une ligne pour visualiser la série.
            </div>
          </Panel>

          {selSeries && (
            <Panel title={`Série — ${selName}`}>
              <LineChart series={[{ data: selSeries, color: T.orange, width: 1.5 }]} height={180} />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
