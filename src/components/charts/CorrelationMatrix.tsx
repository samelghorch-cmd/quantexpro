// Matrice de corrélation.
export function CorrelationMatrix({
  matrix,
  labels,
}: {
  matrix: number[][];
  labels: string[];
}) {
  const cellW = 60, cellH = 24;
  const colorOf = (v: number) => {
    if (isNaN(v)) return "#0a0d12";
    if (v >= 0) return `rgba(0, 229, 160, ${Math.min(1, v) * 0.8 + 0.1})`;
    return `rgba(255, 77, 106, ${Math.min(1, -v) * 0.8 + 0.1})`;
  };
  return (
    <table style={{ borderCollapse: "collapse", fontSize: 10 }}>
      <thead>
        <tr>
          <th></th>
          {labels.map((l) => <th key={l} style={{ padding: 4, color: "#7d8590", fontSize: 9, fontWeight: 400, transform: "rotate(-30deg)", height: 40, width: cellW }}>{l.substr(0, 20)}</th>)}
        </tr>
      </thead>
      <tbody>
        {matrix.map((row, i) => (
          <tr key={i}>
            <td style={{ padding: 4, color: "#7d8590", fontSize: 9, textAlign: "right", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{labels[i]}</td>
            {row.map((v, j) => (
              <td key={j} style={{ width: cellW, height: cellH, background: colorOf(v), color: Math.abs(v) > 0.5 ? "#0a0d12" : "#c9d1d9", textAlign: "center", fontFamily: "'JetBrains Mono', monospace", border: "1px solid #22282f" }}>
                {v.toFixed(2)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
