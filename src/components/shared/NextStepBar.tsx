// Barre de progression guidée du pipeline + recommandation intelligente du prochain outil.
import { usePipeline } from "../../state/PipelineContext.tsx";
import { Button } from "./ui.tsx";
import { T } from "./theme.ts";
import { recommendNext, type RecoSeverity } from "../../engine/recoEngine.ts";

export const GUIDED_FLOW = [
  { id: "factory", label: "Usine", short: "1" },
  { id: "backtest", label: "Backtest", short: "2" },
  { id: "validator", label: "Validation", short: "3" },
  { id: "propfirm", label: "Prop firm", short: "4" },
  { id: "recoFinale", label: "Reco finale", short: "5" },
] as const;

const sevColor: Record<RecoSeverity, string> = {
  good: T.green, info: T.blue, warn: T.yellow, danger: T.red,
};

export function NextStepBar({ current }: { current: string }) {
  const { navigate, pipeline, activeDossierId } = usePipeline();
  const idx = GUIDED_FLOW.findIndex((s) => s.id === current);
  if (idx < 0) return null;
  const nextStep = GUIDED_FLOW[idx + 1];
  const prevStep = GUIDED_FLOW[idx - 1];
  const reco = recommendNext(pipeline);
  const recoNext = reco.next;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
      {/* Fil linéaire des 5 étapes */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        padding: "10px 14px", borderRadius: 10, background: T.bg1, border: `1px solid ${T.orange}33`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          {GUIDED_FLOW.map((s, i) => {
            const stepDone = i < idx, cur = i === idx;
            const color = cur ? T.orange : stepDone ? T.green : T.textFaint;
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div onClick={() => navigate(s.id)} title={s.label} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, color: cur ? "#0a0c10" : color,
                    background: cur ? T.orange : "transparent", border: `1.5px solid ${color}`,
                  }}>{stepDone ? "✓" : s.short}</span>
                  <span style={{ fontSize: 11.5, color, fontWeight: cur ? 700 : 500 }}>{s.label}</span>
                </div>
                {i < GUIDED_FLOW.length - 1 && <span style={{ color: T.textFaint, margin: "0 2px" }}>→</span>}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {activeDossierId && <Button onClick={() => navigate("dossiers")}>📁 Dossier</Button>}
          {prevStep && <Button onClick={() => navigate(prevStep.id)}>← {prevStep.label}</Button>}
          {nextStep
            ? <Button primary onClick={() => navigate(nextStep.id)}>Étape suivante : {nextStep.label} →</Button>
            : <Button primary onClick={() => navigate("factory")}>↻ Nouvelle recherche</Button>}
        </div>
      </div>

      {/* Recommandation intelligente — prochain outil conseillé + pourquoi (métriques réelles) */}
      {recoNext && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          padding: "10px 14px", borderRadius: 10, background: T.bg1,
          border: `1px solid ${sevColor[reco.severity]}44`, borderLeft: `3px solid ${sevColor[reco.severity]}`,
        }}>
          <span style={{ fontSize: 16 }}>🎯</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 12.5, color: T.text, fontWeight: 600 }}>
              Recommandé : <span style={{ color: sevColor[reco.severity] }}>{recoNext.label}</span>
            </div>
            <div style={{ fontSize: 11.5, color: T.textDim, marginTop: 2, lineHeight: 1.45 }}>{reco.reason}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Button primary onClick={() => navigate(recoNext.id)}>Aller : {recoNext.label} →</Button>
            {reco.also.map((a) => <Button key={a.id} onClick={() => navigate(a.id)}>{a.label}</Button>)}
          </div>
        </div>
      )}
    </div>
  );
}
