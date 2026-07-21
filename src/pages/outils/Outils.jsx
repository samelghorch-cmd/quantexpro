// OUTILS : VPIN, Analyse Quant, Logs. (Quant Toolbox et Performance réutilisent les pages existantes.)
import { useMemo } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { IND } from "../../engine/indicators.js";
import { LineChart } from "../../components/charts/LineChart.jsx";
import { Panel, MetricCard, MetricGrid, DataTable, Badge, SimBadge, fmt, fmtPct } from "../../components/shared/ui.jsx";
import { T } from "../../components/shared/theme.js";

export function VPINPage() {
  const { bars } = usePipeline();
  const vpin = useMemo(() => {
    const closes = bars.map((b) => b.c), vols = bars.map((b) => b.v);
    const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
    return IND.vpin(closes, vols, avgVol * 5, 20);
  }, [bars]);
  const valid = vpin.filter((v) => !Number.isNaN(v));
  const last = valid[valid.length - 1];
  const avg = valid.reduce((a, b) => a + b, 0) / (valid.length || 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="VPIN — Volume-Synchronized Probability of Informed Trading" right={<SimBadge />}>
        <MetricGrid min={150}>
          <MetricCard label="VPIN actuel" value={fmt(last, 3)} color={last > 0.3 ? T.red : T.green} />
          <MetricCard label="VPIN moyen" value={fmt(avg, 3)} />
          <MetricCard label="Max" value={fmt(Math.max(...valid), 3)} color={T.red} />
          <MetricCard label="Buckets calculés" value={valid.length} />
        </MetricGrid>
        <div style={{ marginTop: 6, fontSize: 10.5, color: T.textFaint }}>Toxicité du flux d'ordres (Easley/López de Prado/O'Hara). VPIN élevé = probabilité de trading informé / risque de retournement.</div>
      </Panel>
      <Panel title="VPIN dans le temps"><LineChart series={[{ data: vpin, color: T.pink }, { data: vpin.map(() => 0.3), color: T.red, width: 1 }]} height={200} /></Panel>
    </div>
  );
}

export function AnalyseQuantPage() {
  const { bars, ctx } = usePipeline();
  const stats = useMemo(() => {
    const closes = bars.map((b) => b.c);
    const rets = [];
    for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length);
    let m3 = 0, m4 = 0;
    rets.forEach((r) => { const d = r - mean; m3 += d ** 3; m4 += d ** 4; });
    m3 /= rets.length; m4 /= rets.length;
    const hurst = ctx.hurst100[ctx.hurst100.length - 1];
    return { mean: mean * 10000, vol: sd * Math.sqrt(252 * 78) * 100, skew: m3 / sd ** 3, kurt: m4 / sd ** 4 - 3, hurst, adx: ctx.adx14.adx[ctx.adx14.adx.length - 1] };
  }, [bars, ctx]);
  return (
    <Panel title="Analyse Quant — statistiques de marché" right={<SimBadge />}>
      <MetricGrid min={150}>
        <MetricCard label="Rendement moy. (bps/barre)" value={fmt(stats.mean, 2)} color={stats.mean >= 0 ? T.green : T.red} />
        <MetricCard label="Volatilité annualisée %" value={fmt(stats.vol, 1)} />
        <MetricCard label="Skewness" value={fmt(stats.skew)} color={stats.skew >= 0 ? T.green : T.red} />
        <MetricCard label="Kurtosis excès" value={fmt(stats.kurt)} color={stats.kurt > 1 ? T.red : T.text} />
        <MetricCard label="Hurst (100)" value={fmt(stats.hurst)} color={stats.hurst > 0.55 ? T.green : stats.hurst < 0.45 ? T.red : T.yellow} hint=">0.5 tendance, <0.5 mean-reversion" />
        <MetricCard label="ADX (14)" value={fmt(stats.adx, 0)} color={stats.adx > 25 ? T.green : T.textDim} />
      </MetricGrid>
    </Panel>
  );
}

export function LogsPage() {
  const { logs } = usePipeline();
  const columns = [
    { key: "t", label: "Horodatage", render: (r) => new Date(r.t).toLocaleTimeString("fr-FR") },
    { key: "module", label: "Module", render: (r) => <Badge color={T.blue}>{r.module}</Badge> },
    { key: "message", label: "Message", render: (r) => r.message },
  ];
  return (
    <Panel title="Logs système" right={<span style={{ fontSize: 11, color: T.textDim }}>{logs.length} entrées</span>}>
      <DataTable columns={columns} rows={logs} maxHeight={540} />
      {logs.length === 0 && <div style={{ marginTop: 8, fontSize: 11, color: T.textFaint }}>Les actions du pipeline (FAO, Quant Optim, Validator, Reco Finale…) apparaissent ici.</div>}
    </Panel>
  );
}
