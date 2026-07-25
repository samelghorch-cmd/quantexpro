// Sensitivity 2D, Pareto Front, Cross-TF, Cross-Symbol, Pairs Trading.
import { useState, useCallback, useMemo } from "react";
import { usePipeline, usePersistentState } from "../../state/PipelineContext.tsx";
import { runSensitivity2D, paretoFront, runCrossTF, runCrossSymbol, runPairsTrading } from "../../engine/analyticsAdvanced.ts";
import { generateBasket, SYNTH_ASSETS } from "../../engine/multiAssetSynthetic.ts";
import { runFAO } from "../../engine/fao.ts";
import { Heatmap } from "../../components/charts/Heatmap.jsx";
import { LineChart } from "../../components/charts/LineChart.jsx";
import { Panel, Button, Field, Select, DataTable, SimBadge, MetricCard, MetricGrid, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.tsx";
import { StrategyPicker } from "../../components/shared/StrategyPicker.tsx";
import { T } from "../../components/shared/theme.ts";

export function Sensitivity2DPage() {
  const { bars, ctx, library, symbol, pipeline } = usePipeline();
  const [stratId, setStratId] = useState(pipeline.selectedStrategyId || 3);
  const [metric, setMetric] = useState("sharpe");
  const [res, setRes] = usePersistentState("sensitivity:result", null);
  const run = useCallback(() => {
    const strat = library.find((s) => s.id === stratId);
    if (!strat) return;
    setRes(runSensitivity2D(bars, ctx, strat, { metric, contract: symbol }));
  }, [library, stratId, metric, bars, ctx, symbol]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Panel title="Stratégie"><StrategyPicker value={stratId} onChange={setStratId} compact /></Panel>
        <Panel title="Grille 2D (SL × TP)">
          <Field label="Métrique"><Select value={metric} onChange={setMetric} options={[{ value: "sharpe", label: "Sharpe" }, { value: "totalPnL", label: "PnL" }, { value: "profitFactor", label: "Profit Factor" }, { value: "winRate", label: "Win Rate" }]} /></Field>
          <Button primary onClick={run} style={{ width: "100%", marginTop: 12 }}>▶ Calculer la surface</Button>
        </Panel>
      </div>
      <Panel title="Surface de sensibilité (SL vertical × TP horizontal)" right={res && <SimBadge />}>
        {!res && <div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Calcule la surface pour voir la robustesse de la stratégie aux paramètres.</div>}
        {res && <div style={{ overflowX: "auto" }}><Heatmap matrix={res.grid} rowLabels={res.valuesY.map((v) => `TP${v}`)} colLabels={res.valuesX.map((v) => `SL${v}`)} cellW={54} cellH={30} title={`Métrique : ${res.metric}`} /></div>}
      </Panel>
    </div>
  );
}

export function ParetoPage() {
  const { bars, ctx, library, symbol, pipeline } = usePipeline();
  const [stratId, setStratId] = useState(pipeline.selectedStrategyId || 3);
  const [data, setData] = usePersistentState("pareto:result", null);
  const run = useCallback(() => {
    const strat = library.find((s) => s.id === stratId);
    if (!strat) return;
    const fao = runFAO(bars, ctx, strat, { nSamples: 120, contract: symbol });
    const points = fao.combos.map((c) => ({ label: `SL${c.params.slAtr}/TP${c.params.tpAtr}`, ret: c.totalPnLPct, risk: c.maxDD * 100, sharpe: c.sharpe, pf: c.profitFactor }));
    setData(paretoFront(points));
  }, [library, stratId, bars, ctx, symbol]);

  const chart = useMemo(() => {
    if (!data) return null;
    const all = [...data.front, ...data.dominated];
    const maxRisk = Math.max(...all.map((p) => p.risk), 1);
    const maxRet = Math.max(...all.map((p) => p.ret), 1);
    const minRet = Math.min(...all.map((p) => p.ret), 0);
    return { all, maxRisk, maxRet, minRet };
  }, [data]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Panel title="Stratégie"><StrategyPicker value={stratId} onChange={setStratId} compact /></Panel>
        <Panel title="Pareto Rendement / Risque"><Button primary onClick={run} style={{ width: "100%" }}>▶ Calculer la frontière</Button><div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>Maximise le rendement, minimise le drawdown. Les points non dominés forment la frontière.</div></Panel>
      </div>
      <Panel title="Frontière de Pareto" right={data && <SimBadge />}>
        {!chart && <div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Génère un nuage de setups et extrais la frontière efficiente.</div>}
        {chart && (
          <svg viewBox="0 0 600 360" style={{ width: "100%", background: T.panelAlt, borderRadius: 8 }}>
            <text x={300} y={352} fill={T.textDim} fontSize={11} textAnchor="middle">Risque (Max DD %) →</text>
            <text x={12} y={180} fill={T.textDim} fontSize={11} textAnchor="middle" transform="rotate(-90 12 180)">← Rendement %</text>
            {chart.all.map((p, i) => {
              const x = 40 + (p.risk / chart.maxRisk) * 520;
              const y = 330 - ((p.ret - chart.minRet) / (chart.maxRet - chart.minRet || 1)) * 300;
              const onFront = data.front.includes(p);
              return <circle key={i} cx={x} cy={y} r={onFront ? 5 : 3} fill={onFront ? T.orange : T.textFaint} opacity={onFront ? 1 : 0.5} />;
            })}
            {data.front.map((p, i) => {
              if (i === 0) return null;
              const prev = data.front[i - 1];
              const x1 = 40 + (prev.risk / chart.maxRisk) * 520, y1 = 330 - ((prev.ret - chart.minRet) / (chart.maxRet - chart.minRet || 1)) * 300;
              const x2 = 40 + (p.risk / chart.maxRisk) * 520, y2 = 330 - ((p.ret - chart.minRet) / (chart.maxRet - chart.minRet || 1)) * 300;
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={T.orange} strokeWidth={1.5} strokeDasharray="3 3" />;
            })}
          </svg>
        )}
        {data && <div style={{ marginTop: 8, fontSize: 11, color: T.textDim }}>{data.front.length} setups sur la frontière · {data.dominated.length} dominés</div>}
      </Panel>
    </div>
  );
}

export function CrossTFPage() {
  const { rawBars, library, symbol, pipeline } = usePipeline();
  const [stratId, setStratId] = useState(pipeline.selectedStrategyId || 3);
  const [res, setRes] = usePersistentState("crosstf:result", null);
  const run = useCallback(() => {
    const strat = library.find((s) => s.id === stratId);
    if (!strat) return;
    setRes(runCrossTF(rawBars, strat, { slAtr: 2, tpAtr: 0, direction: "both", contract: symbol, capital: 100000 }));
  }, [library, stratId, rawBars, symbol]);
  const columns = [
    { key: "tf", label: "Timeframe", render: (r) => r.tf, color: () => T.orange },
    { key: "nTrades", label: "Trades", align: "right", render: (r) => r.nTrades },
    { key: "winRate", label: "WR%", align: "right", render: (r) => fmt(r.winRate, 1), color: (r) => r.winRate >= 50 ? T.green : T.red },
    { key: "pf", label: "PF", align: "right", render: (r) => fmt(r.pf) },
    { key: "sharpe", label: "Sharpe", align: "right", render: (r) => fmt(r.sharpe), color: (r) => r.sharpe >= 1 ? T.green : T.red },
    { key: "maxDD", label: "MaxDD", align: "right", render: (r) => fmtPct(r.maxDD * 100) },
    { key: "totalPnL", label: "PnL", align: "right", render: (r) => fmtUsd(r.totalPnL), color: (r) => r.totalPnL >= 0 ? T.green : T.red },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Panel title="Stratégie"><StrategyPicker value={stratId} onChange={setStratId} compact /></Panel>
        <Panel title="Cross-TF Stability"><Button primary onClick={run} style={{ width: "100%" }}>▶ Tester 5m/15m/1h/4h</Button><div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>Une stratégie robuste conserve un Sharpe positif à travers les timeframes.</div></Panel>
      </div>
      <Panel title="Stabilité multi-timeframe" right={res && <SimBadge />}><DataTable columns={columns} rows={res || []} maxHeight={300} /></Panel>
    </div>
  );
}

export function CrossSymbolPage() {
  const { library, seed, pipeline } = usePipeline();
  const [stratId, setStratId] = useState(pipeline.selectedStrategyId || 3);
  const [res, setRes] = usePersistentState("crosssymbol:result", null);
  const run = useCallback(() => {
    const strat = library.find((s) => s.id === stratId);
    if (!strat) return;
    const basket = generateBasket(1200, seed);
    setRes(runCrossSymbol(basket.series, strat, { slAtr: 2, tpAtr: 0, direction: "both", contract: "MES", capital: 100000 }));
  }, [library, stratId, seed]);
  const columns = [
    { key: "symbol", label: "Actif (synth.)", render: (r) => r.symbol, color: () => T.orange },
    { key: "nTrades", label: "Trades", align: "right", render: (r) => r.nTrades },
    { key: "winRate", label: "WR%", align: "right", render: (r) => fmt(r.winRate, 1), color: (r) => r.winRate >= 50 ? T.green : T.red },
    { key: "pf", label: "PF", align: "right", render: (r) => fmt(r.pf) },
    { key: "sharpe", label: "Sharpe", align: "right", render: (r) => fmt(r.sharpe), color: (r) => r.sharpe >= 0 ? T.green : T.red },
    { key: "totalPnL", label: "PnL", align: "right", render: (r) => fmtUsd(r.totalPnL), color: (r) => r.totalPnL >= 0 ? T.green : T.red },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Panel title="Stratégie"><StrategyPicker value={stratId} onChange={setStratId} compact /></Panel>
        <Panel title="Cross-Symbol"><Button primary onClick={run} style={{ width: "100%" }}>▶ Tester sur le panier</Button><div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>Panier synthétique multi-marché (9 actifs corrélés). Données SIMULÉES.</div></Panel>
      </div>
      <Panel title="Généralisation multi-actifs" right={res && <SimBadge />}><DataTable columns={columns} rows={res || []} maxHeight={340} /></Panel>
    </div>
  );
}

export function PairsPage() {
  const { seed } = usePipeline();
  const [pair, setPair] = useState(["SYN-EQ1", "SYN-EQ2"]);
  const [res, setRes] = usePersistentState("pairs:result", null);
  const run = useCallback(() => {
    const basket = generateBasket(1200, seed);
    setRes(runPairsTrading(basket.series[pair[0]], basket.series[pair[1]], { window: 50, entryZ: 2, exitZ: 0.5 }));
  }, [seed, pair]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
      <Panel title="Paire (synthétique)">
        <Field label="Actif A"><Select value={pair[0]} onChange={(v) => setPair([v, pair[1]])} options={SYNTH_ASSETS.map((a) => a.sym)} /></Field>
        <div style={{ height: 8 }} />
        <Field label="Actif B"><Select value={pair[1]} onChange={(v) => setPair([pair[0], v])} options={SYNTH_ASSETS.map((a) => a.sym)} /></Field>
        <Button primary onClick={run} style={{ width: "100%", marginTop: 12 }}>▶ Analyser la paire</Button>
      </Panel>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {res && (
          <Panel title="Statistiques de la paire" right={<SimBadge />}>
            <MetricGrid min={130}>
              <MetricCard label="Hedge Ratio β" value={fmt(res.beta)} color={T.orange} />
              <MetricCard label="Corrélation" value={fmt(res.correlation)} />
              <MetricCard label="Trades" value={res.trades.length} />
              <MetricCard label="Win Rate" value={fmtPct(res.winRate)} color={res.winRate >= 50 ? T.green : T.red} />
              <MetricCard label="PnL (spread)" value={fmt(res.totalPnL)} color={res.totalPnL >= 0 ? T.green : T.red} />
            </MetricGrid>
          </Panel>
        )}
        {res && <Panel title="Z-Score du spread (entrée ±2, sortie ±0.5)"><LineChart series={[{ data: res.z, color: T.orange }]} height={200} showZero /></Panel>}
        {!res && <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Sélectionne deux actifs du panier et analyse le spread / z-score.</div></Panel>}
      </div>
    </div>
  );
}
