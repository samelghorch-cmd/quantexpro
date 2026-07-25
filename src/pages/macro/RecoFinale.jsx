// Reco Finale — décision finale scorée agrégeant tout le pipeline. Verdict GO/REWORK/NO-GO.
import { useState, useCallback } from "react";
import { usePipeline } from "../../state/PipelineContext.tsx";
import { computeRecoFinale } from "../../engine/recoFinale.ts";
import { Panel, Button, ScoreGauge, SimBadge, ProgressBar, fmt } from "../../components/shared/ui.tsx";
import { PipelineStepper } from "../../components/shared/PipelineStepper.tsx";
import { NextStepBar } from "../../components/shared/NextStepBar.tsx";
import { T, verdictColor } from "../../components/shared/theme.ts";

export function RecoFinalePage() {
  const { pipeline, setPipe, log, attachToActive, gradeActive } = usePipeline();
  const [reco, setReco] = useState(pipeline.recoFinale);

  const run = useCallback(() => {
    const nTrials = pipeline.faoResults?.attempts ?? pipeline.postFaoTop10?.length ?? 1;
    const res = computeRecoFinale({
      postFao: pipeline.postFaoTop10,
      quantOpt: pipeline.quantOptimizerBest,
      validator: pipeline.validatorVerdict,
      backtestResult: pipeline.quantOptimizerBest?.best?.res || pipeline.lastBacktest?.res,
      nTrials,
    });
    setReco(res);
    setPipe({ recoFinale: res });
    log("Reco Finale", `Verdict ${res.verdict} — score ${res.finalScore.toFixed(0)}`);
    // Rattache l'étape PUIS fige la note — séquencé : les deux écritures lisent/écrivent le même
    // dossier, en parallèle la seconde écraserait la première (lost update).
    attachToActive("reco", "Reco Finale", { nTrials, ...res })
      .then(() => gradeActive({ verdict: res.verdict, score: res.finalScore, components: res.components }));
  }, [pipeline, setPipe, log, attachToActive, gradeActive]);

  const hasInputs = pipeline.lastBacktest || pipeline.quantOptimizerBest || pipeline.postFaoTop10;

  return (
    <div>
      <PipelineStepper current="recoFinale" />
      <NextStepBar current="recoFinale" />
      {!hasInputs ? (
        <Panel><div style={{ padding: 30, textAlign: "center", color: T.textDim }}>Fais tourner le pipeline (au moins un Backtest) avant la Reco Finale. Idéalement : Backtest → FAO → Post-FAO → Quant Optim → Validator.</div></Panel>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Panel title="Décision finale scorée" right={<div style={{ display: "flex", gap: 10, alignItems: "center" }}><SimBadge /><Button primary onClick={run}>▶ Calculer la Reco</Button></div>}>
            <div style={{ fontSize: 11, color: T.textDim }}>Agrège : Composite Post-FAO · Score Quant (5 modules ML) · Robustesse Validator · MinTRL (Bailey·LdP) · Quality LZ · Deflated Sharpe (anti-overfit). Un DSR &lt; 50 % interdit le GO.</div>
          </Panel>

          {reco && (
            <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 14, alignItems: "start" }}>
              <Panel title="Verdict">
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: 10 }}>
                  <ScoreGauge score={reco.finalScore} size={140} label="Score final" />
                  <div style={{ fontSize: 28, fontWeight: 800, color: verdictColor(reco.verdict), padding: "6px 28px", border: `2px solid ${verdictColor(reco.verdict)}`, borderRadius: 10 }}>{reco.verdict}</div>
                  <div style={{ fontSize: 11, color: T.textDim, textAlign: "center" }}>
                    {reco.verdict === "GO" && "Stratégie validée par le pipeline scientifique."}
                    {reco.verdict === "REWORK" && "À retravailler : score intermédiaire ou gate en warning."}
                    {reco.verdict === "NO-GO" && "Rejetée : score insuffisant ou validation échouée."}
                  </div>
                </div>
              </Panel>
              <Panel title="Composantes du score">
                {reco.components.map((c) => (
                  <div key={c.name} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: T.text }}>{c.name} <span style={{ color: T.textFaint }}>· poids {fmt(c.weight * 100, 0)}%{c.extra ? ` · ${c.extra}` : ""}</span></span>
                      <span style={{ fontFamily: T.mono, color: c.value >= 70 ? T.green : c.value >= 50 ? T.yellow : T.red }}>{fmt(c.value, 0)}</span>
                    </div>
                    <ProgressBar pct={c.value} color={c.value >= 70 ? T.green : c.value >= 50 ? T.yellow : T.red} />
                  </div>
                ))}
                {reco.components.length === 0 && <div style={{ color: T.textDim, fontSize: 12 }}>Aucune composante disponible — lance plus d'étapes du pipeline.</div>}
              </Panel>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
