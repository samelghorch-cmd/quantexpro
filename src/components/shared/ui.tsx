// Composants UI partagés v5.
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { T, S } from "./theme.ts";
import { usePipeline } from "../../state/PipelineContext.jsx";

export function Panel({
  title,
  right,
  children,
  style,
  bodyStyle,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
}) {
  return (
    <div style={{ ...S.panel, ...style }}>
      {(title || right) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${T.border}` }}>
          {title && <div style={S.h}>{title}</div>}
          {right}
        </div>
      )}
      <div style={{ padding: 14, ...bodyStyle }}>{children}</div>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  color,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
  hint?: string;
}) {
  return (
    <div title={hint || ""} style={{ background: T.panelAlt, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 9.5, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: color || T.text, fontFamily: T.mono, marginTop: 3, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: T.textFaint, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function MetricGrid({ children, min = 130 }: { children?: ReactNode; min?: number }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 8 }}>{children}</div>;
}

export function Badge({ children, color = T.textDim }: { children?: ReactNode; color?: string }) {
  return <span style={S.chip(color)}>{children}</span>;
}

// Badge de provenance des données — DYNAMIQUE : reflète le mode courant.
export function SimBadge() {
  const { usingReal, dataMeta } = usePipeline() as {
    usingReal?: boolean;
    dataMeta?: { symbol?: { label?: string; classLabel?: string } } | null;
  };
  if (usingReal) {
    return <span style={{ ...S.chip(T.green), border: `1px solid ${T.green}55` }} title={`Données réelles — ${dataMeta?.symbol?.label ?? ""} (${dataMeta?.symbol?.classLabel ?? ""}), coûts propres à l'actif appliqués.`}>RÉEL</span>;
  }
  return <span style={{ ...S.chip(T.yellow), border: `1px solid ${T.yellow}55` }} title="Données synthétiques générées en interne — jamais de vraies données de marché.">SIMULÉ</span>;
}

type TabItem = string | { id: string; label: ReactNode };

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${T.border}`, flexWrap: "wrap" }}>
      {tabs.map((t) => {
        const id = typeof t === "string" ? t : t.id;
        const label = typeof t === "string" ? t : t.label;
        const on = id === active;
        return (
          <button key={id} onClick={() => onChange(id)} style={{
            padding: "8px 14px", background: "transparent", color: on ? T.orange : T.textDim,
            border: "none", borderBottom: on ? `2px solid ${T.orange}` : "2px solid transparent",
            cursor: "pointer", fontSize: 12, fontWeight: on ? 700 : 500, fontFamily: T.sans,
          }}>{label}</button>
        );
      })}
    </div>
  );
}

export function Button({
  primary,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button style={primary ? S.btnPrimary : S.btn} {...rest}>{children}</button>;
}

export function Field({ label, children }: { label: ReactNode; children?: ReactNode }) {
  return (
    <div>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  value: number | string;
  onChange: (v: number | "") => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return <input type="number" value={value} step={step} min={min} max={max} style={S.input}
    onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />;
}

type SelectOption = string | { value: string; label: ReactNode };

export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={S.input}>
      {options.map((o) => {
        const val = typeof o === "string" ? o : o.value;
        const lab = typeof o === "string" ? o : o.label;
        return <option key={val} value={val}>{lab}</option>;
      })}
    </select>
  );
}

export function ProgressBar({ pct, color = T.orange }: { pct: number; color?: string }) {
  return (
    <div style={{ background: T.bg0, borderRadius: 4, height: 6, overflow: "hidden", border: `1px solid ${T.border}` }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: color, transition: "width 0.2s" }} />
    </div>
  );
}

export function ScoreGauge({ score, size = 96, label }: { score?: number; size?: number; label?: ReactNode }) {
  const s = Math.max(0, Math.min(100, score || 0));
  const color = s >= 70 ? T.green : s >= 45 ? T.yellow : T.red;
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.border} strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - s / 100)} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.4s" }} />
        <text x="50%" y="50%" fill={color} fontSize={size * 0.26} fontWeight="700" fontFamily={T.mono}
          textAnchor="middle" dominantBaseline="central" transform={`rotate(90 ${size / 2} ${size / 2})`}>{s.toFixed(0)}</text>
      </svg>
      {label && <div style={{ fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>}
    </div>
  );
}

export interface DataTableColumn<T = Record<string, unknown>> {
  key: string;
  label: ReactNode;
  align?: "left" | "right" | "center";
  color?: (row: T) => string;
  render?: (row: T, i: number) => ReactNode;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  maxHeight = 420,
  onRowClick,
  selectedIdx,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  maxHeight?: number;
  onRowClick?: (row: T, i: number) => void;
  selectedIdx?: number;
}) {
  return (
    <div style={{ maxHeight, overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, fontFamily: T.mono }}>
        <thead style={{ position: "sticky", top: 0, background: T.panel, zIndex: 1 }}>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ textAlign: c.align || "left", padding: "8px 10px", color: T.textDim, fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} onClick={onRowClick ? () => onRowClick(row, i) : undefined}
              style={{ cursor: onRowClick ? "pointer" : "default", background: selectedIdx === i ? T.orangeSoft : "transparent" }}>
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align || "left", padding: "6px 10px", color: c.color ? c.color(row) : T.text, borderBottom: `1px solid ${T.borderSoft}`, whiteSpace: "nowrap" }}>
                  {c.render ? c.render(row, i) : (row[c.key] as ReactNode)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} style={{ padding: 20, textAlign: "center", color: T.textFaint }}>Aucune donnée. Lance un calcul.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function fmt(n: number | null | undefined, d = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (!Number.isFinite(n)) return n > 0 ? "∞" : "-∞";
  return Number(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
export function fmtInt(n: number | null | undefined) { return fmt(n, 0); }
export function fmtPct(n: number | null | undefined, d = 1) { return n === null || n === undefined || Number.isNaN(n) ? "—" : `${fmt(n, d)}%`; }
export function fmtUsd(n: number | null | undefined, d = 0) { return n === null || n === undefined || Number.isNaN(n) ? "—" : `$${fmt(n, d)}`; }
