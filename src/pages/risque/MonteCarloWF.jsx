// Monte Carlo + Walk-Forward — réutilise les moteurs v4 sur le dernier backtest.
import { useState, useCallback } from "react";
import { usePipeline, usePersistentState } from "../../state/PipelineContext.jsx";
import { monteCarlo } from "../../engine/montecarlo.ts";
import { walkForward } from "../../engine/walkforward.ts";
import { MCEnvelope } from "../../components/charts/MCEnvelope.tsx";
import { Panel, Button, Field, NumberInput, MetricCard, MetricGrid, DataTable, SimBadge, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.tsx";
import { StrategyPicker } from "../../components/shared/StrategyPicker.tsx";
import { T } from "../../components/shared/theme.ts";

function NoBt() { return <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Lance d'abord un backtest (onglet Backtest) — ce module s'appuie dessus.</div></Panel>; }

export function MonteCarloPage() {
  const { pipeline } = usePipeline();
  const [nSims, setNSims] = useState(500);
  const [mc, setMc] = usePersistentState("montecarlo:result", null);
  const bt = pipeline.lastBacktest;

  const run = useCallback(() => {
    if (!bt) return;
    setMc(monteCarlo(bt.res.trades, bt.params.capital, nSims));
  }, [bt, nSims]);

  if (!bt) return <NoBt />;
  const s = mc?.stats;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Panel title="Monte Carlo (permutation des trades)" right={<div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}><SimBadge /><Field label="Simulations"><NumberInput value={nSims} step={100} onChange={setNSims} /></Field><Button primary onClick={run} style={{ alignSelf: "flex-end" }}>▶ Simuler</Button></div>}>
        <div style={{ fontSize: 11, color: T.textDim }}>Stratégie : {bt.strat.name} · {bt.res.trades.length} trades réordonnés {nSims}×.</div>
      </Panel>
      {s && (
        <>
          <Panel title="Distribution des équités finales">
            <MetricGrid min={130}>
              <MetricCard label="P05" value={fmtUsd(s.p05)} color={T.red} />
              <MetricCard label="P50 (médiane)" value={fmtUsd(s.p50)} color={T.yellow} />
              <MetricCard label="P95" value={fmtUsd(s.p95)} color={T.green} />
              <MetricCard label="Moyenne" value={fmtUsd(s.mean)} />
              <MetricCard label="DD médian" value={fmtPct(s.ddP50 * 100)} />
              <MetricCard label="DD P95" value={fmtPct(s.ddP95 * 100)} color={T.red} />
              <MetricCard label="Proba de perte" value={fmtPct(s.probLoss * 100)} color={s.probLoss < 0.3 ? T.green : T.red} />
            </MetricGrid>
          </Panel>
          <Panel title={`${mc.curves.length} chemins Monte Carlo`}><MCEnvelope curves={mc.curves} initial={bt.params.capital} height={260} /></Panel>
        </>
      )}
    </div>
  );
}

export function WalkForwardPage() {
  const { bars, ctx, library, symbol, pipeline } = usePipeline();
  const [stratId, setStratId] = useState(pipeline.selectedStrategyId || 3);
  const [nWin, setNWin] = useState(5);
  const [wf, setWf] = usePersistentState("walkforward:result", null);

  const run = useCallback(() => {
    const strat = library.find((x) => x.id === stratId);
    if (!strat) return;
    const opt = { contract: symbol, contracts: 1, useAtrStop: true, atrMult: 2, direction: "both", capital: 100000 };
    setWf(walkForward(bars, ctx, strat.eval, opt, nWin, 0.7));
  }, [library, stratId, bars, ctx, symbol, nWin]);

  const columns = [
    { key: "window", label: "Fenêtre", render: (r) => `#${r.window}` },
    { key: "isTrades", label: "IS Trades", align: "right", render: (r) => r.is.trades },
    { key: "isPnl", label: "IS PnL", align: "right", render: (r) => fmtUsd(r.is.pnl), color: (r) => r.is.pnl >= 0 ? T.green : T.red },
    { key: "isSharpe", label: "IS Sharpe", align: "right", render: (r) => fmt(r.is.sharpe) },
    { key: "oosTrades", label: "OOS Trades", align: "right", render: (r) => r.oos.trades },
    { key: "oosPnl", label: "OOS PnL", align: "right", render: (r) => fmtUsd(r.oos.pnl), color: (r) => r.oos.pnl >= 0 ? T.green : T.red },
    { key: "oosSharpe", label: "OOS Sharpe", align: "right", render: (r) => fmt(r.oos.sharpe), color: (r) => r.oos.sharpe >= 0 ? T.green : T.red },
    { key: "eff", label: "WF Efficiency", align: "right", render: (r) => r.is.pnl > 0 ? fmtPct((r.oos.pnl / r.is.pnl) * 100) : "—" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Panel title="Stratégie"><StrategyPicker value={stratId} onChange={setStratId} compact /></Panel>
        <Panel title="Walk-Forward">
          <Field label="Nombre de fenêtres"><NumberInput value={nWin} onChange={setNWin} /></Field>
          <Button primary onClick={run} style={{ width: "100%", marginTop: 12 }}>▶ Lancer Walk-Forward</Button>
          <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>Split glissant IS 70% / OOS 30% par fenêtre.</div>
        </Panel>
      </div>
      <Panel title="Résultats IS / OOS" right={wf && <SimBadge />}><DataTable columns={columns} rows={wf || []} maxHeight={480} /></Panel>
    </div>
  );
}
