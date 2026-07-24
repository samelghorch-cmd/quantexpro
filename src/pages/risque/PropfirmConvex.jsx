// Propfirm Convex — Monte-Carlo d'un challenge prop firm, sensibilité au risk scale.
import { useState, useCallback } from "react";
import { usePipeline, usePersistentState } from "../../state/PipelineContext.jsx";
import { runPropfirmConvex, tradesToDailyPnL } from "../../engine/propfirmConvex.ts";
import { runBacktestExt } from "../../engine/backtestExtended.ts";
import { Panel, Button, Field, NumberInput, MetricCard, MetricGrid, DataTable, SimBadge, fmt, fmtPct, fmtUsd, fmtInt } from "../../components/shared/ui.jsx";
import { StrategyPicker } from "../../components/shared/StrategyPicker.jsx";
import { NextStepBar } from "../../components/shared/NextStepBar.jsx";
import { T } from "../../components/shared/theme.js";

export function PropfirmConvexPage() {
  const { bars, ctx, library, symbol, pipeline } = usePipeline();
  const [stratId, setStratId] = useState(pipeline.selectedStrategyId || 3);
  const [ch, setCh] = useState({ accountSize: 100000, target: 10, maxDailyLoss: 5, maxTotalLoss: 10, maxDays: 30 });
  const [nPaths, setNPaths] = useState(5000);
  const [res, setRes] = usePersistentState("propfirm:result", null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setCh((c) => ({ ...c, [k]: v }));

  const run = useCallback(() => {
    const strat = library.find((s) => s.id === stratId);
    if (!strat) return;
    setBusy(true);
    setTimeout(() => {
      const params = pipeline.strategyParams
        ? { ...pipeline.strategyParams, contract: symbol }
        : { slAtr: 2, tpAtr: 0, beAtr: 0, direction: "both", contract: symbol, capital: ch.accountSize };
      const bt = runBacktestExt(bars, ctx, strat.eval, params);
      const daily = tradesToDailyPnL(bt.trades);
      const out = runPropfirmConvex(daily, {
        accountSize: ch.accountSize, target: ch.target / 100, maxDailyLoss: ch.maxDailyLoss / 100,
        maxTotalLoss: ch.maxTotalLoss / 100, maxDays: ch.maxDays,
      }, { nPaths });
      setRes(out ? { ...out, strat, nDays: daily.length } : null);
      setBusy(false);
    }, 20);
  }, [library, stratId, ch, nPaths, bars, ctx, symbol, pipeline.strategyParams]);

  const columns = [
    { key: "scale", label: "Risk Scale", render: (r) => `${r.scale}×`, color: (r) => r.scale === 1 ? T.orange : T.text },
    { key: "passRate", label: "PASS %", align: "right", render: (r) => fmtPct(r.passRate), color: (r) => r.passRate >= 50 ? T.green : r.passRate >= 25 ? T.yellow : T.red },
    { key: "timeP50", label: "Time P50 (j)", align: "right", render: (r) => Number.isFinite(r.timeP50) ? fmtInt(r.timeP50) : "—" },
    { key: "timeP90", label: "Time P90 (j)", align: "right", render: (r) => Number.isFinite(r.timeP90) ? fmtInt(r.timeP90) : "—" },
    { key: "ddP95", label: "DD P95 %", align: "right", render: (r) => fmtPct(r.ddP95), color: () => T.red },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
      <div style={{ gridColumn: "1 / -1" }}><NextStepBar current="propfirm" /></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Panel title="Stratégie"><StrategyPicker value={stratId} onChange={setStratId} compact /></Panel>
        <Panel title="Challenge">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Account $"><NumberInput value={ch.accountSize} step={10000} onChange={(v) => set("accountSize", v)} /></Field>
            <Field label="Target %"><NumberInput value={ch.target} onChange={(v) => set("target", v)} /></Field>
            <Field label="Max Daily Loss %"><NumberInput value={ch.maxDailyLoss} onChange={(v) => set("maxDailyLoss", v)} /></Field>
            <Field label="Max Total Loss %"><NumberInput value={ch.maxTotalLoss} onChange={(v) => set("maxTotalLoss", v)} /></Field>
            <Field label="Max Days"><NumberInput value={ch.maxDays} onChange={(v) => set("maxDays", v)} /></Field>
            <Field label="Chemins MC"><NumberInput value={nPaths} step={1000} onChange={setNPaths} /></Field>
          </div>
          <Button primary onClick={run} disabled={busy} style={{ width: "100%", marginTop: 12 }}>{busy ? "Simulation…" : `▶ Simuler ${nPaths} chemins`}</Button>
        </Panel>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {!res && <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Simule un challenge FTMO-like par Monte-Carlo pour obtenir PASS %, coût pour passer, budget P90 et sensibilité au risk scale.</div></Panel>}
        {res && (
          <>
            <Panel title={`Résultat challenge · ${res.strat.name}`} right={<SimBadge />}>
              <MetricGrid min={140}>
                <MetricCard label="PASS %" value={fmtPct(res.passRate)} color={res.passRate >= 50 ? T.green : res.passRate >= 25 ? T.yellow : T.red} />
                <MetricCard label="Time-to-Pass P50" value={Number.isFinite(res.timeP50) ? `${fmtInt(res.timeP50)} j` : "—"} />
                <MetricCard label="Time-to-Pass P90" value={Number.isFinite(res.timeP90) ? `${fmtInt(res.timeP90)} j` : "—"} />
                <MetricCard label="DD P95" value={fmtPct(res.ddP95)} color={T.red} />
                <MetricCard label="Tentatives moy." value={Number.isFinite(res.expectedAttempts) ? fmt(res.expectedAttempts, 1) : "∞"} hint="Espérance loi géométrique" />
                <MetricCard label="Cost-to-Pass" value={Number.isFinite(res.costToPass) ? fmtUsd(res.costToPass) : "∞"} color={T.orange} hint={`Frais ${fmtUsd(res.feePerAttempt)}/tentative`} />
                <MetricCard label="Budget P90" value={Number.isFinite(res.budgetP90) ? fmtUsd(res.budgetP90) : "∞"} sub={`${Number.isFinite(res.attemptsP90) ? res.attemptsP90 : "∞"} tentatives`} color={T.orange} />
                <MetricCard label="Jours PnL dispo" value={fmtInt(res.nDays)} />
              </MetricGrid>
            </Panel>
            <Panel title="Sensibilité au Risk Scale">
              <DataTable columns={columns} rows={res.scaleResults} maxHeight={260} />
              <div style={{ marginTop: 8, fontSize: 10.5, color: T.textFaint }}>
                Le risk scale multiplie la taille de position. Plus de risque = passage plus rapide mais DD P95 plus élevé (convexité du challenge).
              </div>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
