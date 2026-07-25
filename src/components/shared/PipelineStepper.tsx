// Fil du pipeline scientifique, partagé par les pages OPTIMISATION.
import { usePipeline } from "../../state/PipelineContext.jsx";
import { Button } from "./ui.tsx";
import { T } from "./theme.ts";

const STEPS = [
  { key: "lastBacktest", label: "Backtest", id: "backtest" },
  { key: "faoResults", label: "FAO", id: "fao" },
  { key: "postFaoTop10", label: "Post-FAO", id: "postFao" },
  { key: "quantOptimizerBest", label: "Quant Optim", id: "quantOptimizer" },
  { key: "validatorVerdict", label: "Validator", id: "validator" },
  { key: "recoFinale", label: "Reco Finale", id: "recoFinale" },
] as const;

export function PipelineStepper({ current }: { current: string }) {
  const { pipeline, navigate } = usePipeline() as {
    pipeline: Record<string, unknown>;
    navigate: (id: string) => void;
  };
  const idx = STEPS.findIndex((s) => s.id === current);
  const next = idx >= 0 ? STEPS[idx + 1] : null;
  const prev = idx > 0 ? STEPS[idx - 1] : null;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        {STEPS.map((s, i) => {
          const done = !!pipeline[s.key];
          const isCurrent = s.id === current;
          const color = isCurrent ? T.orange : done ? T.green : T.textFaint;
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div onClick={() => navigate(s.id)} title={`Aller à ${s.label}`} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 6, border: `1px solid ${isCurrent ? T.orange : done ? T.green + "55" : T.border}`, background: isCurrent ? T.orangeSoft : "transparent" }}>
                <span style={{ width: 16, height: 16, borderRadius: "50%", background: done ? T.green : "transparent", border: `1px solid ${color}`, color: done ? "#000" : color, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{done ? "✓" : i + 1}</span>
                <span style={{ fontSize: 11, color, fontWeight: isCurrent ? 700 : 500 }}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <span style={{ color: T.textFaint, fontSize: 10 }}>→</span>}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {prev && <Button onClick={() => navigate(prev.id)}>← {prev.label}</Button>}
        {next
          ? <Button primary onClick={() => navigate(next.id)}>Étape suivante : {next.label} →</Button>
          : idx >= 0 && <Button primary onClick={() => navigate("propfirm")}>→ Prop firm</Button>}
      </div>
    </div>
  );
}
