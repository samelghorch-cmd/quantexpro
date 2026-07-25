// Quant Optimizer — TPE-like, Score Quant 0-100 (5 modules ML), contraintes fondamentales.
import { useState, useCallback } from "react";
import { usePipeline } from "../../state/PipelineContext.tsx";
import { runQuantOptimizer } from "../../engine/quantOptimizer.ts";
import { Panel, Button, Field, NumberInput, DataTable, ScoreGauge, SimBadge, Badge, fmt, fmtPct, fmtUsd } from "../../components/shared/ui.tsx";
import { StrategyPicker } from "../../components/shared/StrategyPicker.tsx";
import { PipelineStepper } from "../../components/shared/PipelineStepper.tsx";
import { LineChart } from "../../components/charts/LineChart.jsx";
import { T } from "../../components/shared/theme.ts";

export function QuantOptimizerPage() {
  const { bars, ctx, library, symbol, pipeline, setPipe, log, attachToActive } = usePipeline();
  const [stratId, setStratId] = useState(pipeline.faoResults?.strat?.id || pipeline.selectedStrategyId || 3);
  const [nTrials, setNTrials] = useState(60);
  const [busy, setBusy] = useState(false);

  const run = useCallback(() => {
    const strat = library.find((s) => s.id === stratId);
    if (!strat) return;
    setBusy(true);
    setTimeout(() => {
      const baseline = pipeline.faoResults?.baseline?.result || pipeline.lastBacktest?.res;
      const res = runQuantOptimizer(bars, ctx, strat, { nTrials, contract: symbol, baseline });
      setPipe({ quantOptimizerBest: { ...res, strat } });
      log("Quant Optimizer", `${nTrials} essais TPE — best Score Quant ${res.best.score.toFixed(0)} (${res.rejected} rejetés)`);
      // Rattache l'optimisation TPE au dossier actif (aucune perte entre outils).
      attachToActive("quantOpt", "Quant Optimizer", { nTrials, rejected: res.rejected, best: res.best },
        { name: strat.name, strategyId: strat.id, params: res.best?.params });
      setBusy(false);
    }, 20);
  }, [library, stratId, nTrials, bars, ctx, symbol, pipeline, setPipe, log, attachToActive]);

  const qo = pipeline.quantOptimizerBest;
  const columns = [
    { key: "rank", label: "#", render: (_, i) => i + 1 },
    { key: "score", label: "Score Quant", align: "right", render: (r) => fmt(r.score, 0), color: () => T.orange },
    { key: "sl", label: "SL/TP/BE", render: (r) => `${r.params.slAtr}/${r.params.tpAtr || "—"}/${r.params.beAtr || "—"}` },
    { key: "dir", label: "Dir", render: (r) => r.params.direction },
    { key: "sharpe", label: "Sharpe", align: "right", render: (r) => fmt(r.sharpe) },
    { key: "pf", label: "PF", align: "right", render: (r) => fmt(r.pf) },
    { key: "maxDD", label: "MaxDD", align: "right", render: (r) => fmtPct(r.maxDD * 100) },
  ];

  return (
    <div>
      <PipelineStepper current="quantOptimizer" />
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Panel title="Stratégie"><StrategyPicker value={stratId} onChange={setStratId} compact /></Panel>
          <Panel title="Optimisation bayésienne">
            <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.5, marginBottom: 10 }}>
              Échantillonnage <b style={{ color: T.orange }}>TPE-like</b> (approximation JS de Optuna). Cible : Score Quant 0-100 = 5 sous-scores ML. Contraintes dures vs baseline : Sharpe −10%, PF −10%, DD +20%.
            </div>
            <Field label="Nombre d'essais"><NumberInput value={nTrials} step={10} onChange={setNTrials} /></Field>
            <Button primary onClick={run} disabled={busy} style={{ width: "100%", marginTop: 12 }}>{busy ? "Optimisation…" : "▶ Lancer Quant Optim"}</Button>
          </Panel>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {qo && (
            <>
              <Panel title="Meilleur essai" right={<SimBadge />}>
                <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                  <ScoreGauge score={qo.best.score} label="Score Quant" size={110} />
                  <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {qo.best.parts && Object.entries(qo.best.parts).map(([k, v]) => (
                      <div key={k} style={{ background: T.panelAlt, borderRadius: 6, padding: "8px 10px", border: `1px solid ${T.border}` }}>
                        <div style={{ fontSize: 9.5, color: T.textDim, textTransform: "capitalize" }}>{k}</div>
                        <div style={{ fontSize: 15, fontFamily: T.mono, color: v >= 60 ? T.green : v >= 40 ? T.yellow : T.red }}>{fmt(v, 0)}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", fontSize: 11, color: T.textDim }}>
                  <Badge color={T.red}>{qo.rejected} essais rejetés (contraintes)</Badge>
                  Prochaine étape → <b style={{ color: T.orange }}>Validator</b>.
                </div>
              </Panel>
              <Panel title="Convergence (score par essai)">
                <LineChart series={[{ data: qo.convergence.map((c) => c.score), color: T.orange }]} height={160} />
              </Panel>
              <Panel title="Historique des essais"><DataTable columns={columns} rows={qo.history.slice(0, 30)} maxHeight={300} /></Panel>
            </>
          )}
          {!qo && <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Lance l'optimisation pour obtenir le Score Quant et la convergence TPE.</div></Panel>}
        </div>
      </div>
    </div>
  );
}
