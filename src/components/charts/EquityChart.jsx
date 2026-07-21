// Extrait de v4core.js — courbe d'équité.
import { useRef, useState, useEffect } from "react";

export function EquityChart({ data, initial }) {
  const ref = useRef(null);
  const wrap = useRef(null);
  const [w, setW] = useState(700);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(e => setW(e[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const h = 180;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = h * dpr;
    c.style.width = w + "px"; c.style.height = h + "px";
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    g.fillStyle = "#0d1117"; g.fillRect(0, 0, w, h);
    if (!data || data.length < 2) return;
    let hi = Math.max(...data), lo = Math.min(...data);
    if (hi === lo) { hi += 1; lo -= 1; }
    const pad = 8;
    const sx = i => pad + (i / (data.length - 1)) * (w - pad * 2);
    const sy = v => pad + (h - pad * 2) * (1 - (v - lo) / (hi - lo));
    // ligne capital initial
    g.strokeStyle = "#30363d"; g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(pad, sy(initial)); g.lineTo(w - pad, sy(initial)); g.stroke();
    g.setLineDash([]);
    // équité
    const final = data[data.length - 1];
    g.strokeStyle = final >= initial ? "#00E5A0" : "#FF4D6A";
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(sx(0), sy(data[0]));
    for (let i = 1; i < data.length; i++) g.lineTo(sx(i), sy(data[i]));
    g.stroke();
    // fill
    g.fillStyle = (final >= initial ? "#00E5A0" : "#FF4D6A") + "15";
    g.lineTo(sx(data.length - 1), h - pad); g.lineTo(sx(0), h - pad); g.closePath(); g.fill();
  }, [data, initial, w]);
  return <div ref={wrap} style={{ width: "100%" }}><canvas ref={ref} /></div>;
}
