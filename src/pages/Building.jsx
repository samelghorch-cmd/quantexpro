// Placeholder temporaire pendant la construction (Wave en cours).
// Sera remplacé par le module réel avant la fin de la session.
import { T } from "../components/shared/theme.ts";

export function Building({ name }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 60, color: T.textDim, gap: 10 }}>
      <div style={{ fontSize: 26 }}>🚧</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{name}</div>
      <div style={{ fontSize: 12 }}>Module en cours de construction dans cette session.</div>
    </div>
  );
}
