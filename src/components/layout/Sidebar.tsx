// Sidebar sectorielle : 8 sections repliables, tous les modules cliquables.
import { useState } from "react";
import { T } from "../shared/theme.ts";
import { SECTIONS, MODULE_COUNT } from "../../registry.ts";

export function Sidebar({
  active,
  onSelect,
  collapsed,
  onToggle,
}: {
  active: string;
  onSelect: (id: string) => void;
  collapsed?: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(SECTIONS.map((s) => [s.id, true])));
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  if (collapsed) {
    return (
      <div style={{ width: 48, background: T.bg1, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 10, gap: 6 }}>
        <button onClick={onToggle} title="Déplier" style={{ background: "none", border: "none", color: T.orange, fontSize: 18, cursor: "pointer" }}>☰</button>
        {SECTIONS.map((s) => (
          <div key={s.id} title={s.label} style={{ color: T.textDim, fontSize: 16, padding: 6, cursor: "pointer" }} onClick={onToggle}>{s.icon}</div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ width: 232, background: T.bg1, borderRight: `1px solid ${T.border}`, overflowY: "auto", flexShrink: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, background: T.bg1, zIndex: 2 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text, letterSpacing: 0.3 }}>
            Quant<span style={{ color: T.orange }}>EX</span>Pro
          </div>
          <div style={{ fontSize: 9, color: T.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>Quant Platform · v5</div>
        </div>
        <button onClick={onToggle} title="Replier" style={{ background: "none", border: "none", color: T.textDim, fontSize: 16, cursor: "pointer" }}>«</button>
      </div>

      <div style={{ flex: 1, paddingBottom: 20 }}>
        {SECTIONS.map((s) => (
          <div key={s.id}>
            <div onClick={() => toggle(s.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", cursor: "pointer", userSelect: "none" }}>
              <span style={{ color: T.orange, fontSize: 11, width: 12 }}>{s.icon}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.7, flex: 1 }}>{s.label}</span>
              <span style={{ fontSize: 9, color: T.textFaint }}>{s.modules.length}</span>
              <span style={{ color: T.textFaint, fontSize: 9, transform: open[s.id] ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>▶</span>
            </div>
            {open[s.id] && s.modules.map((m) => {
              const on = active === m.id;
              return (
                <div key={m.id} onClick={() => onSelect(m.id)} style={{
                  padding: "6px 14px 6px 34px", fontSize: 12, cursor: "pointer",
                  color: on ? T.orange : T.text, background: on ? T.orangeSoft : "transparent",
                  borderLeft: on ? `2px solid ${T.orange}` : "2px solid transparent", fontWeight: on ? 600 : 400,
                }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.panel; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}>
                  {m.label}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ padding: "8px 14px", borderTop: `1px solid ${T.border}`, fontSize: 9.5, color: T.textFaint, position: "sticky", bottom: 0, background: T.bg1 }}>
        {SECTIONS.length} sections · {MODULE_COUNT} modules
      </div>
    </div>
  );
}
