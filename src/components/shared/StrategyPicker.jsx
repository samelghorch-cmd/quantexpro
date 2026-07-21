// Sélecteur de stratégie réutilisable (recherche + catégories).
import { useState, useMemo } from "react";
import { usePipeline } from "../../state/PipelineContext.jsx";
import { CATS } from "../../engine/strategyLibrary.js";
import { T, S } from "./theme.js";

export function StrategyPicker({ value, onChange, compact }) {
  const { library } = usePipeline();
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return library.slice(0, 60);
    return library.filter((x) => x.name.toLowerCase().includes(s) || String(x.id).includes(s)).slice(0, 60);
  }, [library, q]);
  const sel = library.find((x) => x.id === value);

  return (
    <div>
      <input placeholder="Rechercher une stratégie…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...S.input, marginBottom: 6 }} />
      {sel && <div style={{ fontSize: 11, color: T.orange, marginBottom: 6 }}>Sélection : #{sel.id} · {sel.name}</div>}
      <div style={{ maxHeight: compact ? 180 : 320, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 6 }}>
        {filtered.map((s) => {
          const on = s.id === value;
          return (
            <div key={s.id} onClick={() => onChange(s.id)} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", cursor: "pointer", fontSize: 11.5,
              background: on ? T.orangeSoft : "transparent", color: on ? T.orange : T.text, borderBottom: `1px solid ${T.borderSoft}`,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: CATS[s.cat]?.color || T.textDim, flexShrink: 0 }} />
              <span style={{ color: T.textFaint, fontFamily: T.mono, width: 34 }}>#{s.id}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
