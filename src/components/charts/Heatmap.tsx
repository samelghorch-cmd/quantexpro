// Heatmap générique.
export function Heatmap({
  matrix,
  rowLabels,
  colLabels,
  cellW = 32,
  cellH = 22,
  title,
}: {
  matrix: number[][];
  rowLabels: string[];
  colLabels: string[];
  cellW?: number;
  cellH?: number;
  title?: string;
}) {
  if (!matrix || matrix.length === 0) return null;
  const flat = matrix.flat().filter((v) => !isNaN(v));
  const max = Math.max(...flat.map(Math.abs)) || 1;
  const colorOf = (v: number) => {
    if (isNaN(v)) return "#0a0d12";
    const norm = v / max;
    if (norm >= 0) return `rgba(0, 229, 160, ${0.15 + Math.min(1, norm) * 0.75})`;
    return `rgba(255, 77, 106, ${0.15 + Math.min(1, -norm) * 0.75})`;
  };
  return (
    <div style={{ display: "inline-block" }}>
      {title && <div style={{ fontSize: 11, color: "#7d8590", marginBottom: 4 }}>{title}</div>}
      <table style={{ borderCollapse: "collapse", fontSize: 10 }}>
        <thead>
          <tr>
            <th style={{ width: 40 }}></th>
            {colLabels.map((c) => <th key={c} style={{ width: cellW, color: "#7d8590", fontWeight: 400, padding: 2 }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td style={{ color: "#7d8590", padding: 2, textAlign: "right" }}>{rowLabels[i]}</td>
              {row.map((v, j) => (
                <td key={j} title={isNaN(v) ? "—" : v.toFixed(2)} style={{ width: cellW, height: cellH, background: colorOf(v), textAlign: "center", color: Math.abs(v) / max > 0.5 ? "#0a0d12" : "#c9d1d9", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, border: "1px solid #22282f" }}>
                  {isNaN(v) ? "" : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
