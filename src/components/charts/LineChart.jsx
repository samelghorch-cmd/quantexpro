// Line chart SVG générique (multi-séries), sans dépendance externe.
import { T } from "../shared/theme.js";

export function LineChart({ series, height = 180, showZero = false, yFormat }) {
  const all = series.flatMap((s) => s.data.filter((v) => v != null && !Number.isNaN(v)));
  if (all.length === 0) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: T.textFaint }}>Aucune donnée</div>;
  let hi = Math.max(...all), lo = Math.min(...all);
  if (showZero) { hi = Math.max(hi, 0); lo = Math.min(lo, 0); }
  if (hi === lo) { hi += 1; lo -= 1; }
  const W = 1000, H = height, pad = 8, padB = 18, padL = 40;
  const maxLen = Math.max(...series.map((s) => s.data.length));
  const sx = (i) => padL + (i / Math.max(1, maxLen - 1)) * (W - padL - pad);
  const sy = (v) => pad + (H - pad - padB) * (1 - (v - lo) / (hi - lo));
  const fmtY = yFormat || ((v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + "k" : v.toFixed(1)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block", background: T.panelAlt, borderRadius: 6 }}>
      {[0, 0.25, 0.5, 0.75, 1].map((g) => {
        const v = hi - (hi - lo) * g;
        const y = sy(v);
        return <g key={g}><line x1={padL} y1={y} x2={W - pad} y2={y} stroke={T.borderSoft} strokeWidth={1} /><text x={4} y={y + 3} fill={T.textFaint} fontSize={11} fontFamily={T.mono}>{fmtY(v)}</text></g>;
      })}
      {showZero && lo < 0 && hi > 0 && <line x1={padL} y1={sy(0)} x2={W - pad} y2={sy(0)} stroke={T.textFaint} strokeWidth={1} strokeDasharray="3 3" />}
      {series.map((s, si) => {
        const pts = s.data.map((v, i) => (v == null || Number.isNaN(v) ? null : `${sx(i)},${sy(v)}`)).filter(Boolean).join(" ");
        return <polyline key={si} points={pts} fill="none" stroke={s.color || T.orange} strokeWidth={s.width || 2} />;
      })}
    </svg>
  );
}
