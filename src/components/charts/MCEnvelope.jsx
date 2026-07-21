// Extrait de v4core.js — enveloppe des chemins Monte Carlo.
import { useRef, useState, useEffect } from "react";

export function MCEnvelope({ curves, initial, height = 220 }) {
  const ref = useRef(null); const wrap = useRef(null);
  const [w, setW] = useState(700);
  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(e => setW(e[0].contentRect.width)); ro.observe(el); return () => ro.disconnect(); }, []);
  useEffect(() => {
    const c = ref.current; if (!c || !curves || curves.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = height * dpr;
    c.style.width = w + "px"; c.style.height = height + "px";
    const g = c.getContext("2d"); g.scale(dpr, dpr);
    g.fillStyle = "#0d1117"; g.fillRect(0, 0, w, height);
    const maxLen = Math.max(...curves.map(c => c.length));
    let hi = -Infinity, lo = Infinity;
    curves.forEach(c => c.forEach(v => { if (v > hi) hi = v; if (v < lo) lo = v; }));
    const pad = 8;
    const sx = i => pad + (i / (maxLen - 1)) * (w - pad * 2);
    const sy = v => pad + (height - pad * 2) * (1 - (v - lo) / (hi - lo));
    curves.forEach(c => {
      g.strokeStyle = "rgba(77, 166, 255, 0.05)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(sx(0), sy(c[0]));
      for (let i = 1; i < c.length; i++) g.lineTo(sx(i), sy(c[i]));
      g.stroke();
    });
    // Ligne initial
    g.strokeStyle = "#30363d"; g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(pad, sy(initial)); g.lineTo(w - pad, sy(initial)); g.stroke();
    g.setLineDash([]);
    // Percentiles P05/P50/P95 finaux
    const finals = curves.map(c => c[c.length - 1]).sort((a, b) => a - b);
    const p05 = finals[Math.floor(finals.length * 0.05)];
    const p50 = finals[Math.floor(finals.length * 0.5)];
    const p95 = finals[Math.floor(finals.length * 0.95)];
    [["P05", p05, "#FF4D6A"], ["P50", p50, "#F4B942"], ["P95", p95, "#00E5A0"]].forEach(([lbl, v, col]) => {
      const y = sy(v);
      g.strokeStyle = col; g.setLineDash([2, 4]);
      g.beginPath(); g.moveTo(pad, y); g.lineTo(w - pad, y); g.stroke();
      g.setLineDash([]);
      g.fillStyle = col; g.font = "10px 'JetBrains Mono', monospace"; g.textAlign = "left";
      g.fillText(`${lbl} $${v.toFixed(0)}`, pad + 4, y - 2);
    });
  }, [curves, initial, w, height]);
  return <div ref={wrap} style={{ width: "100%" }}><canvas ref={ref} /></div>;
}
