// Charte visuelle QuantEXPro — dark premium, accent orange.
export const T = {
  orange: "#FF6B00",
  orangeSoft: "#FF6B0022",
  orangeGlow: "0 0 20px rgba(255,107,0,0.25)",
  bg0: "#0a0c10",
  bg1: "#0d0f12",
  panel: "#111419",
  panelAlt: "#0d1117",
  border: "#22282f",
  borderSoft: "#1c2128",
  text: "#F0F2F5",
  textDim: "#8a929c",
  textFaint: "#5c646e",
  green: "#00E5A0",
  greenSoft: "#00E5A020",
  red: "#FF4D6A",
  redSoft: "#FF4D6A20",
  blue: "#4DA6FF",
  purple: "#9B6BFF",
  yellow: "#F4B942",
  pink: "#FF5CA8",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  sans: "'Outfit', -apple-system, system-ui, sans-serif",
};

export const verdictColor = (v) => {
  const u = String(v || "").toUpperCase();
  if (u === "GO" || u === "PASS") return T.green;
  if (u === "WARN" || u === "REWORK") return T.yellow;
  if (u === "NO-GO" || u === "NOGO" || u === "FAIL") return T.red;
  return T.textDim;
};

// Styles réutilisables
export const S = {
  bg: { background: T.bg0, color: T.text, fontFamily: T.sans, minHeight: "100vh" },
  panel: { background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10 },
  panelPad: { padding: 14 },
  h: { margin: 0, fontSize: 13, fontWeight: 600, color: T.text, textTransform: "uppercase", letterSpacing: 0.6 },
  h2: { margin: 0, fontSize: 18, fontWeight: 700, color: T.text },
  sub: { fontSize: 11, color: T.textDim },
  mono: { fontFamily: T.mono },
  btn: { background: T.panelAlt, color: T.text, border: `1px solid ${T.border}`, padding: "7px 13px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontFamily: T.sans },
  btnPrimary: { background: T.orange, color: "#0a0c10", border: `1px solid ${T.orange}`, padding: "7px 13px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: T.sans },
  input: { background: T.bg0, color: T.text, border: `1px solid ${T.border}`, padding: "7px 9px", borderRadius: 6, fontSize: 12, width: "100%", fontFamily: T.sans, boxSizing: "border-box" },
  label: { fontSize: 10, color: T.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" },
  chip: (color = T.textDim) => ({ display: "inline-block", padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: color + "20", color, letterSpacing: 0.3 }),
};
