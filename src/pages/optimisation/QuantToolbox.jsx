// Quant Toolbox — GARCH, HMM, VaR/CVaR, XGBoost heuristique, Autoencoder, Drawdown Dist, Trade Clustering.
import { useState, useMemo } from "react";
import { usePipeline } from "../../state/PipelineContext.tsx";
import { garchVol, hmmRegimes, varCvar, boostedStumps, pcaAnomaly, drawdownDistribution, tradeClustering } from "../../engine/quantToolbox/index.ts";
import { LineChart } from "../../components/charts/LineChart.jsx";
import { Panel, Tabs, MetricCard, MetricGrid, Badge, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.tsx";
import { T } from "../../components/shared/theme.ts";

export function QuantToolboxPage() {
  const [tab, setTab] = useState("garch");
  return (
    <div>
      <Tabs tabs={[
        { id: "garch", label: "GARCH" }, { id: "hmm", label: "HMM 3 états" }, { id: "var", label: "VaR / CVaR" },
        { id: "xgb", label: "XGBoost (heuristique)" }, { id: "ae", label: "Autoencoder" },
        { id: "dd", label: "Drawdown Dist." }, { id: "clust", label: "Trade Clustering" },
      ]} active={tab} onChange={setTab} />
      <div style={{ marginTop: 14 }}>
        {tab === "garch" && <GarchTab />}
        {tab === "hmm" && <HmmTab />}
        {tab === "var" && <VarTab />}
        {tab === "xgb" && <XgbTab />}
        {tab === "ae" && <AeTab />}
        {tab === "dd" && <DdTab />}
        {tab === "clust" && <ClustTab />}
      </div>
    </div>
  );
}

function useReturns() {
  const { bars } = usePipeline();
  return useMemo(() => {
    const r = [];
    for (let i = 1; i < bars.length; i++) r.push(Math.log(bars[i].c / bars[i - 1].c));
    return r;
  }, [bars]);
}

function GarchTab() {
  const returns = useReturns();
  const g = useMemo(() => garchVol(returns), [returns]);
  if (!g) return <Panel><div style={{ padding: 20, color: T.textDim }}>Pas assez de données.</div></Panel>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="GARCH(1,1) — volatilité conditionnelle" right={<Badge color={T.yellow}>Approximation JS</Badge>}>
        <MetricGrid min={130}>
          <MetricCard label="ω (omega)" value={fmt(g.omega, 6)} />
          <MetricCard label="α (alpha)" value={fmt(g.alpha, 3)} />
          <MetricCard label="β (beta)" value={fmt(g.beta, 3)} />
          <MetricCard label="Persistance α+β" value={fmt(g.persistence, 3)} color={g.persistence < 1 ? T.green : T.red} />
          <MetricCard label="Vol inconditionnelle" value={fmtPct(g.uncondVol * 100, 3)} />
        </MetricGrid>
      </Panel>
      <Panel title="Volatilité conditionnelle estimée"><LineChart series={[{ data: g.vol.map((v) => v * 100), color: T.pink }]} height={200} /></Panel>
    </div>
  );
}

function HmmTab() {
  const returns = useReturns();
  const h = useMemo(() => hmmRegimes(returns), [returns]);
  if (!h) return <Panel><div style={{ padding: 20, color: T.textDim }}>Pas assez de données.</div></Panel>;
  const total = h.counts.reduce((a, b) => a + b, 0) || 1;
  const colors = [T.green, T.blue, T.red, T.yellow];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="HMM 4 régimes (Trend / Range / Vol / Choppy)" right={<Badge color={T.yellow}>Approximation JS</Badge>}>
        <MetricGrid min={140}>
          {h.labels.map((lab, i) => (
            <MetricCard key={lab} label={lab} value={fmtPct((h.counts[i] / total) * 100)} sub={`vol≈${fmt(h.sigma[i], 5)}`} color={colors[i]} />
          ))}
        </MetricGrid>
        <div style={{ marginTop: 8, fontSize: 12, color: T.textDim }}>
          Courant : <b style={{ color: colors[h.current] }}>{h.currentLabel}</b>
        </div>
      </Panel>
      <Panel title="Séquence (0=Trend … 3=Choppy)"><LineChart series={[{ data: h.states, color: T.orange, width: 1 }]} height={140} /></Panel>
    </div>
  );
}

function VarTab() {
  const { pipeline, bars } = usePipeline();
  const returns = useReturns();
  const pnls = pipeline.lastBacktest ? pipeline.lastBacktest.res.trades.map((t) => t.pnl) : returns.map((r) => r * 100000);
  const vc = useMemo(() => varCvar(pnls), [pnls]);
  if (!vc) return <Panel><div style={{ padding: 20, color: T.textDim }}>Pas assez de données.</div></Panel>;
  return (
    <Panel title="VaR / CVaR multi-méthodes" right={<span style={{ fontSize: 11, color: T.textDim }}>{pipeline.lastBacktest ? "sur les trades du backtest" : "sur les rendements du marché"}</span>}>
      <MetricGrid min={150}>
        <MetricCard label="VaR 95% historique" value={fmtUsd(vc.histVar)} color={T.red} />
        <MetricCard label="CVaR 95% historique" value={fmtUsd(vc.histCvar)} color={T.red} />
        <MetricCard label="VaR paramétrique" value={fmtUsd(vc.paramVar)} />
        <MetricCard label="VaR Cornish-Fisher" value={fmtUsd(vc.cfVar)} hint="Ajusté skew/kurtosis" />
        <MetricCard label="Skewness" value={fmt(vc.skew)} />
        <MetricCard label="Kurtosis excès" value={fmt(vc.kurt)} />
      </MetricGrid>
    </Panel>
  );
}

function XgbTab() {
  const { ctx, bars } = usePipeline();
  const model = useMemo(() => {
    const features = [], labels = [];
    for (let i = 50; i < bars.length - 5; i++) {
      const row = [ctx.rsi[14][i], ctx.adx14.adx[i], ctx.z[20][i], ctx.macd["12_26_9"].hist[i], ctx.cci[20][i], ctx.roc[10][i]];
      if (row.some((v) => v == null || Number.isNaN(v))) continue;
      features.push(row);
      labels.push(bars[i + 5].c - bars[i].c);
    }
    return boostedStumps(features, labels, 30, 0.3);
  }, [ctx, bars]);
  const featNames = ["RSI14", "ADX14", "Z-Score20", "MACD hist", "CCI20", "ROC10"];
  if (!model) return <Panel><div style={{ padding: 20, color: T.textDim }}>Pas assez de données.</div></Panel>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Prédicteur de direction (stumps boostés)" right={<Badge color={T.yellow}>Heuristique JS — pas un vrai XGBoost</Badge>}>
        <MetricGrid min={140}>
          <MetricCard label="Accuracy in-sample" value={fmtPct(model.accuracy)} color={model.accuracy >= 55 ? T.green : T.yellow} />
          <MetricCard label="Nb de stumps" value={model.nStumps} />
        </MetricGrid>
      </Panel>
      <Panel title="Importance des features">
        {model.importance.map((imp, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}><span>{featNames[i]}</span><span style={{ fontFamily: T.mono, color: T.orange }}>{fmtPct(imp * 100)}</span></div>
            <div style={{ background: T.bg0, borderRadius: 4, height: 6, overflow: "hidden" }}><div style={{ width: `${imp * 100}%`, height: "100%", background: T.orange }} /></div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function AeTab() {
  const { ctx, bars } = usePipeline();
  const ae = useMemo(() => {
    const data = [];
    for (let i = 50; i < bars.length; i++) {
      const row = [ctx.rsi[14][i], ctx.adx14.adx[i], ctx.atr14[i], ctx.z[20][i]];
      if (row.some((v) => v == null || Number.isNaN(v))) continue;
      data.push(row);
    }
    return pcaAnomaly(data, 2);
  }, [ctx, bars]);
  if (!ae) return <Panel><div style={{ padding: 20, color: T.textDim }}>Pas assez de données.</div></Panel>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Détection d'anomalies (PCA + erreur de reconstruction)" right={<Badge color={T.yellow}>Approximation statistique</Badge>}>
        <MetricGrid min={140}>
          <MetricCard label="Anomalies détectées" value={ae.anomalies.length} color={T.red} />
          <MetricCard label="Seuil (μ+2σ)" value={fmt(ae.threshold, 3)} />
          <MetricCard label="Erreur moyenne" value={fmt(ae.meanErr, 3)} />
        </MetricGrid>
      </Panel>
      <Panel title="Erreur de reconstruction par barre"><LineChart series={[{ data: ae.errors, color: T.blue }, { data: ae.errors.map(() => ae.threshold), color: T.red, width: 1 }]} height={200} /></Panel>
    </div>
  );
}

function DdTab() {
  const { pipeline } = usePipeline();
  const bt = pipeline.lastBacktest;
  const dd = useMemo(() => bt ? drawdownDistribution(bt.res.equityCurve) : null, [bt]);
  if (!bt) return <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Lance un backtest pour la distribution des drawdowns.</div></Panel>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Drawdown Distribution">
        <MetricGrid min={140}>
          <MetricCard label="Max DD %" value={fmtPct(dd.maxDD)} color={T.red} />
          <MetricCard label="Ulcer Index" value={fmt(dd.ulcer)} />
          <MetricCard label="Calmar" value={fmt(dd.calmar)} />
          <MetricCard label="Recovery moy." value={fmt(dd.avgRecoveryBars, 0)} sub="barres" />
          <MetricCard label="Durée max DD" value={fmt(dd.maxDDLenBars, 0)} sub="barres" />
        </MetricGrid>
      </Panel>
      <Panel title="Histogramme des drawdowns">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 160, padding: 10 }}>
          {dd.buckets.map((b, i) => {
            const max = Math.max(...dd.buckets);
            return <div key={i} style={{ flex: 1, background: T.red, opacity: 0.4 + (i / dd.buckets.length) * 0.6, height: `${(b / max) * 100}%`, borderRadius: "3px 3px 0 0" }} title={`${b} barres`} />;
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.textFaint }}><span>0%</span><span>Max DD</span></div>
      </Panel>
    </div>
  );
}

function ClustTab() {
  const { pipeline } = usePipeline();
  const bt = pipeline.lastBacktest;
  const tc = useMemo(() => bt ? tradeClustering(bt.res.trades.map((t) => t.pnl)) : null, [bt]);
  if (!bt || !tc) return <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Lance un backtest (≥5 trades) pour l'analyse de clustering.</div></Panel>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Trade Clustering (autocorrélation des gains/pertes)">
        <MetricGrid min={150}>
          <MetricCard label="Autocorr lag-1" value={fmt(tc.lag1)} color={Math.abs(tc.lag1) < 0.2 ? T.green : T.red} hint="Proche de 0 = indépendant" />
          <MetricCard label="Runs observés" value={tc.runs} />
          <MetricCard label="Runs attendus" value={fmt(tc.expectedRuns, 1)} />
          <MetricCard label="Cluster Score" value={fmtPct(tc.clusterScore * 100)} color={tc.clusterScore > 0.7 ? T.green : T.yellow} />
        </MetricGrid>
      </Panel>
      <Panel title="Fonction d'autocorrélation (ACF)"><LineChart series={[{ data: tc.acf, color: T.orange }]} height={160} showZero /></Panel>
    </div>
  );
}
