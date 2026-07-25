// Barre de progression guidée du pipeline : montre où on en est et enchaîne vers l'étape suivante.
// Le fil : Usine → Backtest → Validation → Prop firm → Reco finale.
import { usePipeline } from "../../state/PipelineContext.jsx";
import { Button } from "./ui.jsx";
import { T } from "./theme.ts";

export const GUIDED_FLOW = [
  { id: "factory", label: "Usine", short: "1" },
  { id: "backtest", label: "Backtest", short: "2" },
  { id: "validator", label: "Validation", short: "3" },
  { id: "propfirm", label: "Prop firm", short: "4" },
  { id: "recoFinale", label: "Reco finale", short: "5" },
];

export function NextStepBar({ current }) {
  const { navigate } = usePipeline();
  const idx = GUIDED_FLOW.findIndex((s) => s.id === current);
  if (idx < 0) return null;
  const next = GUIDED_FLOW[idx + 1];
  const prev = GUIDED_FLOW[idx - 1];

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
      padding: "10px 14px", marginBottom: 14, borderRadius: 10,
      background: T.bg1, border: `1px solid ${T.orange}33`,
    }}>
      {/* Stepper */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        {GUIDED_FLOW.map((s, i) => {
          const done = i < idx, cur = i === idx;
          const color = cur ? T.orange : done ? T.green : T.textFaint;
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div onClick={() => navigate(s.id)} title={s.label} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 20, height: 20, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: cur ? "#0a0c10" : color,
                  background: cur ? T.orange : "transparent", border: `1.5px solid ${color}`,
                }}>{done ? "✓" : s.short}</span>
                <span style={{ fontSize: 11.5, color, fontWeight: cur ? 700 : 500 }}>{s.label}</span>
              </div>
              {i < GUIDED_FLOW.length - 1 && <span style={{ color: T.textFaint, margin: "0 2px" }}>→</span>}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        {prev && <Button onClick={() => navigate(prev.id)}>← {prev.label}</Button>}
        {next
          ? <Button primary onClick={() => navigate(next.id)}>Étape suivante : {next.label} →</Button>
          : <Button primary onClick={() => navigate("factory")}>↻ Nouvelle recherche</Button>}
      </div>
    </div>
  );
}
