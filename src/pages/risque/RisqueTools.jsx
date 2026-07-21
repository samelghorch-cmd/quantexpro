// Kelly/EV, Robustesse, Audit, Historique — outils de risque sur le dernier backtest.
import { useMemo, useState } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { drawdownDistribution, varCvar } from "../../engine/quantToolbox/index.js";
import { deflatedSharpe } from "../../engine/backtestMetrics.js";
import { Panel, MetricCard, MetricGrid, DataTable, Badge, Select, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.jsx";
import { Histogram } from "../../components/charts/Histogram.jsx";
import { T } from "../../components/shared/theme.js";

function NoBt() { return <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Lance d'abord un backtest — ces outils l'analysent.</div></Panel>; }

export function KellyEvPage() {
  const { pipeline } = usePipeline();
  const bt = pipeline.lastBacktest;
  if (!bt) return <NoBt />;
  const r = bt.res;
  const kellyFull = r.kelly * 100;
  const payoff = r.avgLoss ? r.avgWin / r.avgLoss : 0;         // R:R réel (gain moyen / perte moyenne)
  const breakevenWR = payoff > 0 ? 100 / (1 + payoff) : NaN;   // winrate minimal pour être à l'équilibre
  const edge = r.winRate - breakevenWR;                        // marge réelle = winrate − seuil
  const scenarios = [0.25, 0.5, 1, 1.5, 2].map((f) => ({
    frac: f, sizing: Math.max(0, kellyFull * f),
    label: f === 0.5 ? "Half-Kelly (recommandé)" : f === 1 ? "Full Kelly" : `${f}× Kelly`,
  }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title={`Kelly / Espérance · ${bt.strat.name}`}>
        <MetricGrid min={150}>
          <MetricCard label="Kelly complet %" value={fmtPct(kellyFull)} color={T.orange} hint="W − (1−W)/R" />
          <MetricCard label="Half-Kelly %" value={fmtPct(r.kellyHalf)} color={T.green} />
          <MetricCard label="Expectancy R" value={fmt(r.expectancyR)} color={r.expectancyR >= 0 ? T.green : T.red} />
          <MetricCard label="EV / Trade" value={fmtUsd(r.evTrade)} color={r.evTrade >= 0 ? T.green : T.red} />
          <MetricCard label="Win Rate" value={fmtPct(r.winRate)} />
          <MetricCard label="Payoff (R)" value={fmt(payoff)} hint="Gain moyen ÷ perte moyenne (le R:R réellement réalisé)." />
          <MetricCard label="Winrate seuil (BE)" value={fmtPct(breakevenWR)} color={T.yellow} hint="Winrate minimal pour être à l'équilibre à ce payoff = 1/(1+R)." />
          <MetricCard label="Edge (WR − seuil)" value={fmtPct(edge)} color={edge > 0 ? T.green : T.red} hint="La seule chose qui compte : de combien ton winrate dépasse le seuil imposé par ton R:R." />
        </MetricGrid>
        <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint, lineHeight: 1.5 }}>
          Le winrate seul ne veut rien dire : à un payoff de {fmt(payoff)}R, il faut <b style={{ color: T.yellow }}>{fmtPct(breakevenWR)}</b> de réussite <i>juste pour ne pas perdre</i>. Un système à 40 % de winrate avec un payoff de 2R est gagnant ; un système à 70 % avec un payoff de 0,3R est perdant. Ce qui compte, c'est l'<b>edge</b> ({fmtPct(edge)}) et l'espérance ({fmt(r.expectancyR)}R/trade).
        </div>
      </Panel>
      <Panel title="Scénarios de sizing">
        <DataTable columns={[
          { key: "label", label: "Fraction", render: (x) => x.label, color: (x) => x.frac === 0.5 ? T.green : T.text },
          { key: "frac", label: "×", align: "right", render: (x) => `${x.frac}×` },
          { key: "sizing", label: "% du capital / trade", align: "right", render: (x) => fmtPct(x.sizing), color: () => T.orange },
        ]} rows={scenarios} maxHeight={240} />
        <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>Le sizing Kelly suppose des trades i.i.d. — le Half-Kelly réduit la variance au prix d'un rendement légèrement inférieur.</div>
      </Panel>
    </div>
  );
}

export function RobustessePage() {
  const { pipeline } = usePipeline();
  const [nTrials, setNTrials] = useState(100);
  const bt = pipeline.lastBacktest;
  const pnls = useMemo(() => (bt ? bt.res.trades.map((t) => t.pnl) : []), [bt]);
  const dd = useMemo(() => (bt ? drawdownDistribution(bt.res.equityCurve) : null), [bt]);
  const vc = useMemo(() => (bt ? varCvar(pnls) : null), [bt, pnls]);
  const ds = useMemo(() => deflatedSharpe(pnls, Number(nTrials)), [pnls, nTrials]);
  if (!bt) return <NoBt />;
  const dsrPct = Number.isNaN(ds.dsr) ? NaN : ds.dsr * 100;
  const dsrColor = dsrPct >= 95 ? T.green : dsrPct >= 90 ? T.yellow : T.red;
  const dsrVerdict = dsrPct >= 95 ? "SOLIDE" : dsrPct >= 90 ? "LIMITE" : "PROBABLEMENT SUR-OPTIMISÉ";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Deflated Sharpe Ratio — garde-fou anti-overfitting" right={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: T.textDim }}>Nb de configs testées</span>
          <Select value={String(nTrials)} onChange={(x) => setNTrials(Number(x))} options={[{ value: "1", label: "1 (aucun tri)" }, { value: "10", label: "10" }, { value: "100", label: "100" }, { value: "1000", label: "1 000" }, { value: "10000", label: "10 000" }]} />
        </div>
      }>
        <MetricGrid min={150}>
          <MetricCard label="Sharpe observé (par trade)" value={fmt(ds.sr, 3)} />
          <MetricCard label="Sharpe seuil (max sous H0)" value={fmt(ds.srStar, 3)} color={T.yellow} hint="Sharpe max attendu par pure chance sur N essais." />
          <MetricCard label="Deflated Sharpe Ratio" value={Number.isNaN(dsrPct) ? "—" : `${dsrPct.toFixed(1)}%`} color={dsrColor} hint="Probabilité que le Sharpe soit réel après N essais." />
          <MetricCard label="Verdict" value={dsrVerdict} color={dsrColor} />
        </MetricGrid>
        <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint, lineHeight: 1.5 }}>
          C'est ce qui sépare un quant d'un trader : quand ton Usine teste <b style={{ color: T.orange }}>{Number(nTrials).toLocaleString("fr-FR")}</b> configurations, le meilleur Sharpe est mécaniquement gonflé par la chance. Le DSR (López de Prado 2014) déflate le seuil de significativité par le Sharpe maximum attendu sous l'hypothèse « aucun edge », en tenant compte de la longueur d'historique, du skew et du kurtosis. Un DSR &lt; 90 % = le résultat ne survit probablement pas au biais de sélection.
        </div>
      </Panel>
      <Panel title="Robustesse — Drawdown Distribution">
        {dd && (
          <MetricGrid min={140}>
            <MetricCard label="Max DD %" value={fmtPct(dd.maxDD)} color={T.red} />
            <MetricCard label="Ulcer Index" value={fmt(dd.ulcer)} hint="RMS des drawdowns" />
            <MetricCard label="Calmar" value={fmt(dd.calmar)} color={dd.calmar >= 2 ? T.green : T.yellow} />
            <MetricCard label="Recovery moy. (barres)" value={fmt(dd.avgRecoveryBars, 0)} />
            <MetricCard label="Durée max DD (barres)" value={fmt(dd.maxDDLenBars, 0)} />
          </MetricGrid>
        )}
      </Panel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Panel title="Distribution des drawdowns">
          {dd && <Histogram data={dd.dds.map((d) => -d * 100)} bins={24} color={T.red} />}
        </Panel>
        <Panel title="VaR / CVaR (par trade)">
          {vc && (
            <MetricGrid min={130}>
              <MetricCard label="VaR 95% (hist)" value={fmtUsd(vc.histVar)} color={T.red} />
              <MetricCard label="CVaR 95% (hist)" value={fmtUsd(vc.histCvar)} color={T.red} />
              <MetricCard label="VaR paramétrique" value={fmtUsd(vc.paramVar)} />
              <MetricCard label="VaR Cornish-Fisher" value={fmtUsd(vc.cfVar)} hint="Ajusté skew/kurt" />
              <MetricCard label="Skewness" value={fmt(vc.skew)} />
              <MetricCard label="Kurtosis excès" value={fmt(vc.kurt)} />
            </MetricGrid>
          )}
        </Panel>
      </div>
    </div>
  );
}

export function AuditPage() {
  const { pipeline } = usePipeline();
  const bt = pipeline.lastBacktest;
  if (!bt) return <NoBt />;
  const r = bt.res;
  const checks = [
    { name: "Nombre de trades ≥ 30", pass: r.nTrades >= 30, val: r.nTrades },
    { name: "Profit Factor ≥ 1.3", pass: r.profitFactor >= 1.3, val: fmt(r.profitFactor) },
    { name: "Sharpe ≥ 1.0", pass: r.sharpe >= 1, val: fmt(r.sharpe) },
    { name: "Max DD ≤ 20%", pass: r.maxDD <= 0.2, val: fmtPct(r.maxDD * 100) },
    { name: "Win Rate ≥ 40%", pass: r.winRate >= 40, val: fmtPct(r.winRate) },
    { name: "Expectancy R > 0", pass: r.expectancyR > 0, val: fmt(r.expectancyR) },
    { name: "Sortino ≥ 1.2", pass: r.sortino >= 1.2, val: fmt(r.sortino) },
    { name: "Calmar ≥ 1.5", pass: r.calmar >= 1.5, val: fmt(r.calmar) },
  ];
  const passed = checks.filter((c) => c.pass).length;
  return (
    <Panel title={`Audit qualité · ${bt.strat.name}`} right={<Badge color={passed >= 6 ? T.green : passed >= 4 ? T.yellow : T.red}>{passed}/{checks.length} critères</Badge>}>
      {checks.map((c) => (
        <div key={c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 4px", borderBottom: `1px solid ${T.borderSoft}` }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: c.pass ? T.green : T.red, fontSize: 16 }}>{c.pass ? "✓" : "✗"}</span>
            <span style={{ fontSize: 13 }}>{c.name}</span>
          </span>
          <span style={{ fontFamily: T.mono, fontSize: 13, color: c.pass ? T.green : T.red }}>{c.val}</span>
        </div>
      ))}
    </Panel>
  );
}

export function HistoriquePage() {
  const { journal } = usePipeline();
  const columns = [
    { key: "t", label: "Horodatage", render: (r) => new Date(r.t).toLocaleTimeString("fr-FR") },
    { key: "type", label: "Type", render: (r) => <Badge color={T.blue}>{r.type}</Badge> },
    { key: "strat", label: "Stratégie", render: (r) => r.strat || "—" },
    { key: "trades", label: "Trades", align: "right", render: (r) => r.trades ?? "—" },
    { key: "pnl", label: "PnL", align: "right", render: (r) => r.pnl != null ? fmtUsd(r.pnl) : "—", color: (r) => (r.pnl ?? 0) >= 0 ? T.green : T.red },
    { key: "sharpe", label: "Sharpe", align: "right", render: (r) => r.sharpe != null ? fmt(r.sharpe) : "—" },
  ];
  return (
    <Panel title="Historique des exécutions" right={<span style={{ fontSize: 11, color: T.textDim }}>{journal.length} entrées</span>}>
      <DataTable columns={columns} rows={journal} maxHeight={520} />
    </Panel>
  );
}
