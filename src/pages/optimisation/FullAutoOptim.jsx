// Full Auto Optim (FAO) — tête du pipeline scientifique.
import { useState, useCallback } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { runFAO } from "../../engine/fao.js";
import { Panel, Button, Field, NumberInput, DataTable, MetricCard, MetricGrid, SimBadge, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.jsx";
import { StrategyPicker } from "../../components/shared/StrategyPicker.jsx";
import { PipelineStepper } from "../../components/shared/PipelineStepper.jsx";
import { T } from "../../components/shared/theme.js";

export function FullAutoOptimPage() {
  const { bars, ctx, library, symbol, tf, dataMode, pipeline, setPipe, log, attachToActive } = usePipeline();
  const [stratId, setStratId] = useState(pipeline.selectedStrategyId || 3);
  const [cfg, setCfg] = useState({ nSamples: 150, minWR: 35, maxDD: 40 });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  const run = useCallback(() => {
    const strat = library.find((s) => s.id === stratId);
    if (!strat) return;
    setBusy(true);
    setTimeout(() => {
      const res = runFAO(bars, ctx, strat, { nSamples: cfg.nSamples, minWR: cfg.minWR, maxDD: cfg.maxDD, contract: symbol });
      setPipe({ faoResults: { ...res, strat }, selectedStrategyId: stratId });
      log("FAO", `${res.combos.length} setups retenus / ${res.attempts} testés (${strat.name})`);
      // Rattache l'étape FAO (essais + meilleurs setups) au dossier actif.
      attachToActive("fao", "Full Auto Optim", { symbol, tf, dataMode, attempts: res.attempts, best: res.best, combos: res.combos, baseline: res.baseline },
        { name: strat.name, strategyId: strat.id, params: res.best?.params });
      setBusy(false);
    }, 20);
  }, [library, stratId, cfg, bars, ctx, symbol, tf, dataMode, setPipe, log, attachToActive]);

  const fao = pipeline.faoResults;
  const columns = [
    { key: "sl", label: "SL", render: (r) => r.params.slAtr },
    { key: "tp", label: "TP", render: (r) => r.params.tpAtr || "—" },
    { key: "be", label: "BE", render: (r) => r.params.beAtr || "—" },
    { key: "dir", label: "Dir", render: (r) => r.params.direction },
    { key: "reg", label: "Régime", render: (r) => r.params.regime },
    { key: "nTrades", label: "Trades", align: "right", render: (r) => r.nTrades },
    { key: "winRate", label: "WR%", align: "right", render: (r) => fmt(r.winRate, 1), color: (r) => r.winRate >= 50 ? T.green : T.red },
    { key: "pf", label: "PF", align: "right", render: (r) => fmt(r.profitFactor), color: (r) => r.profitFactor >= 1.5 ? T.green : T.red },
    { key: "expectancyR", label: "Exp.R", align: "right", render: (r) => fmt(r.expectancyR), color: (r) => r.expectancyR >= 0 ? T.green : T.red },
    { key: "maxDD", label: "MaxDD", align: "right", render: (r) => fmtPct(r.maxDD * 100) },
    { key: "totalPnL", label: "PnL", align: "right", render: (r) => fmtUsd(r.totalPnL), color: (r) => r.totalPnL >= 0 ? T.green : T.red },
  ];

  return (
    <div>
      <PipelineStepper current="fao" />
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Panel title="Stratégie"><StrategyPicker value={stratId} onChange={setStratId} compact /></Panel>
          <Panel title="Paramètres FAO">
            <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.5, marginBottom: 12 }}>
              Sweep automatique SL/TP/BE + Direction + Régime par <b style={{ color: T.orange }}>random sampling</b>. Filtres qualité appliqués. Période : marché synthétique interne (5 ans équivalents selon barres).
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Max combos"><NumberInput value={cfg.nSamples} step={25} onChange={(v) => set("nSamples", v)} /></Field>
              <Field label="Min WR %"><NumberInput value={cfg.minWR} onChange={(v) => set("minWR", v)} /></Field>
              <Field label="Max DD %"><NumberInput value={cfg.maxDD} onChange={(v) => set("maxDD", v)} /></Field>
            </div>
            <Button primary onClick={run} disabled={busy} style={{ width: "100%", marginTop: 12 }}>{busy ? "Sweep en cours…" : "▶ Lancer FAO"}</Button>
          </Panel>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {fao && (
            <Panel title="Baseline vs Best" right={<SimBadge />}>
              <MetricGrid min={130}>
                <MetricCard label="Setups retenus" value={fao.combos.length} sub={`/ ${fao.attempts} testés`} color={T.orange} />
                <MetricCard label="Baseline Exp.R" value={fmt(fao.baseline.expectancyR)} />
                <MetricCard label="Best Exp.R" value={fmt(fao.best.expectancyR)} color={T.green} />
                <MetricCard label="Best PF" value={fmt(fao.best.profitFactor)} color={T.green} />
                <MetricCard label="Best Sharpe" value={fmt(fao.best.sharpe)} />
                <MetricCard label="Best PnL" value={fmtUsd(fao.best.totalPnL)} color={fao.best.totalPnL >= 0 ? T.green : T.red} />
              </MetricGrid>
              <div style={{ marginTop: 10, fontSize: 11, color: T.textDim }}>Prochaine étape → <b style={{ color: T.orange }}>Post-FAO Synth</b> (scoring composite).</div>
            </Panel>
          )}
          <Panel title="Setups (triés par Expectancy R)">
            <DataTable columns={columns} rows={fao ? fao.combos : []} maxHeight={460} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
