// Histogramme de distribution PnL.
import { useRef, useState, useEffect } from "react";

export function Histogram({
  data,
  bins = 30,
  height = 140,
  color = "#00E5A0",
}: {
  data: number[];
  bins?: number;
  height?: number;
  color?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c || !data || data.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = height * dpr;
    c.style.width = w + "px"; c.style.height = height + "px";
    const g = c.getContext("2d");
    if (!g) return;
    g.scale(dpr, dpr);
    g.fillStyle = "#0d1117"; g.fillRect(0, 0, w, height);
    const min = Math.min(...data), max = Math.max(...data);
    const step = (max - min) / bins || 1;
    const counts = Array(bins).fill(0) as number[];
    data.forEach((v) => { const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - min) / step))); counts[idx]++; });
    const maxC = Math.max(...counts) || 1;
    const bw = w / bins;
    counts.forEach((c_, i) => {
      const binMid = min + step * (i + 0.5);
      const barH = (c_ / maxC) * (height - 20);
      g.fillStyle = binMid >= 0 ? color : "#FF4D6A";
      g.fillRect(i * bw + 1, height - barH - 12, bw - 2, barH);
    });
    if (min < 0 && max > 0) {
      const zx = ((-min) / (max - min)) * w;
      g.strokeStyle = "#7d8590"; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(zx, 0); g.lineTo(zx, height - 12); g.stroke();
      g.setLineDash([]);
    }
    g.fillStyle = "#7d8590"; g.font = "9px 'JetBrains Mono', monospace";
    g.textAlign = "left"; g.fillText(min.toFixed(0), 2, height - 2);
    g.textAlign = "right"; g.fillText(max.toFixed(0), w - 2, height - 2);
  }, [data, bins, w, height, color]);
  return <div ref={wrap} style={{ width: "100%" }}><canvas ref={ref} /></div>;
}
