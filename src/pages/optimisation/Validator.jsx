// Synthetic Validator — 3 gates (Block Bootstrap, GBM, Surrogate), verdict GO/WARN/NO-GO.
import { useState, useCallback } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { runValidator } from "../../engine/syntheticValidator.js";
import { runBacktestExt } from "../../engine/backtestExtended.js";
import { Panel, Button, Field, NumberInput, SimBadge, fmt, fmtUsd } from "../../components/shared/ui.jsx";
import { Histogram } from "../../components/charts/Histogram.jsx";
import { PipelineStepper } from "../../components/shared/PipelineStepper.jsx";
import { T, verdictColor } from "../../components/shared/theme.js";

export function ValidatorPage() {
  const { bars, ctx, pipeline, setPipe, log } = usePipeline();
  const [nPaths, setNPaths] = useState(300);
  const [busy, setBusy] = useState(false);

  const source = pipeline.quantOptimizerBest || pipeline.postFaoTop10 || pipeline.faoResults;
  const strat = pipeline.quantOptimizerBest?.strat || pipeline.faoResults?.strat || pipeline.lastBacktest?.strat;
  const bestParams = pipeline.quantOptimizerBest?.best?.params
    || pipeline.postFaoTop10?.best?.params
    || pipeline.faoResults?.best?.params
    || pipeline.lastBacktest?.params;

  const run = useCallback(() => {
    if (!strat || !bestParams) return;
    setBusy(true);
    setTimeout(() => {
      const params = { slAtr: 2, tpAtr: 0, beAtr: 0, direction: "both", ...bestParams, contract: pipeline.symbol };
      const bt = runBacktestExt(bars, ctx, strat.eval, params);
      const withPnls = { ...params, __pnls: bt.trades.map((t) => t.pnl) };
      const res = runValidator(bars, ctx, strat, withPnls, bt.totalPnL, { nPaths });
      setPipe({ validatorVerdict: res });
      log("Validator", `Verdict ${res.verdict} (${res.gates.map((g) => `${g.name}:${g.verdict}`).join(", ")})`);
      setBusy(false);
    }, 20);
  }, [strat, bestParams, bars, ctx, nPaths, pipeline.symbol, setPipe, log]);

  const v = pipeline.validatorVerdict;

  return (
    <div>
      <PipelineStepper current="validator" />
      {!source ? (
        <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Lance au moins <b style={{ color: T.orange }}>FAO</b> (idéalement jusqu'à Quant Optim) — le Validator teste le meilleur setup.</div></Panel>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Panel title="3 gates statistiques" right={<div style={{ display: "flex", gap: 10, alignItems: "center" }}><SimBadge /><Field label="Chemins"><NumberInput value={nPaths} step={100} onChange={setNPaths} /></Field><Button primary onClick={run} disabled={busy} style={{ alignSelf: "flex-end" }}>{busy ? "Validation…" : "▶ Valider"}</Button></div>}>
            <div style={{ fontSize: 11, color: T.textDim }}>Block Bootstrap · GBM · Surrogate — verdict GO si p&lt;0.05, WARN si p&lt;0.10, sinon NO-GO.</div>
          </Panel>

          {v && (
            <>
              <Panel title="Verdict global">
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div style={{ fontSize: 34, fontWeight: 800, color: verdictColor(v.verdict), padding: "8px 24px", border: `2px solid ${verdictColor(v.verdict)}`, borderRadius: 10 }}>{v.verdict}</div>
                  <div style={{ fontSize: 12, color: T.textDim }}>PnL observé : <b style={{ color: T.text, fontFamily: T.mono }}>{fmtUsd(v.observedPnL)}</b> · {v.nPaths} chemins par gate</div>
                </div>
              </Panel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                {v.gates.map((g) => (
                  <Panel key={g.name} title={g.name} right={<span style={{ fontSize: 12, fontWeight: 700, color: verdictColor(g.verdict) }}>{g.verdict}</span>}>
                    <div style={{ fontSize: 12, marginBottom: 8, fontFamily: T.mono }}>p-value = <b style={{ color: verdictColor(g.verdict) }}>{fmt(g.p, 4)}</b></div>
                    <Histogram data={g.synthetic} bins={24} color={T.blue} height={110} />
                    <div style={{ fontSize: 10, color: T.textFaint, marginTop: 4 }}>Distribution des PnL synthétiques ; barre observée = {fmtUsd(v.observedPnL)}</div>
                  </Panel>
                ))}
              </div>
              <div style={{ fontSize: 11, color: T.textDim }}>Prochaine étape → <b style={{ color: T.orange }}>Reco Finale</b> (section Macro).</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
