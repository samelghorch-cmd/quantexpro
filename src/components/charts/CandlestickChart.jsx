// Extrait de v4core.js — chandeliers Canvas + overlays + flèches signaux.
import { useRef, useState, useEffect } from "react";

export function CandlestickChart({ bars, ctx, overlays, signals, height = 420 }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [width, setWidth] = useState(900);
  const [view, setView] = useState({ start: 0, end: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setView({ start: Math.max(0, bars.length - 200), end: bars.length });
  }, [bars.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bars.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    const c = canvas.getContext("2d");
    c.scale(dpr, dpr);
    c.clearRect(0, 0, width, height);

    const start = view.start, end = view.end;
    const n = end - start;
    if (n < 2) return;
    const padL = 8, padR = 60, padT = 12, padB = 40;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;
    const cw = chartW / n;

    let hi = -Infinity, lo = Infinity;
    for (let i = start; i < end; i++) { if (bars[i].h > hi) hi = bars[i].h; if (bars[i].l < lo) lo = bars[i].l; }
    // inclure aussi les overlays visibles
    overlays.forEach(ov => {
      for (let i = start; i < end; i++) {
        const v = ov.data[i];
        if (!isNaN(v)) { if (v > hi) hi = v; if (v < lo) lo = v; }
      }
    });
    const pad = (hi - lo) * 0.05;
    hi += pad; lo -= pad;
    const yScale = v => padT + chartH - (v - lo) / (hi - lo) * chartH;

    // Fond + grille
    c.fillStyle = "#0d1117";
    c.fillRect(0, 0, width, height);
    c.strokeStyle = "#1c2128";
    c.lineWidth = 1;
    for (let g = 0; g <= 5; g++) {
      const y = padT + (chartH / 5) * g;
      c.beginPath(); c.moveTo(padL, y); c.lineTo(padL + chartW, y); c.stroke();
      const v = hi - (hi - lo) * (g / 5);
      c.fillStyle = "#7d8590";
      c.font = "10px 'JetBrains Mono', monospace";
      c.textAlign = "left";
      c.fillText(v.toFixed(2), padL + chartW + 4, y + 3);
    }

    // Axe temps
    for (let g = 0; g <= 5; g++) {
      const x = padL + (chartW / 5) * g;
      const idx = start + Math.floor(n * g / 5);
      if (idx < bars.length) {
        const d = new Date(bars[idx].t);
        const label = `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
        c.fillStyle = "#7d8590";
        c.textAlign = "center";
        c.fillText(label, x, height - padB + 14);
      }
    }

    // Chandeliers
    const bodyW = Math.max(1, cw * 0.7);
    for (let i = start; i < end; i++) {
      const b = bars[i];
      const x = padL + (i - start) * cw + cw / 2;
      const yO = yScale(b.o), yC = yScale(b.c), yH = yScale(b.h), yL = yScale(b.l);
      const bullish = b.c >= b.o;
      c.strokeStyle = bullish ? "#00E5A0" : "#FF4D6A";
      c.beginPath(); c.moveTo(x, yH); c.lineTo(x, yL); c.stroke();
      c.fillStyle = bullish ? "#00E5A0" : "#FF4D6A";
      c.fillRect(x - bodyW / 2, Math.min(yO, yC), bodyW, Math.max(1, Math.abs(yC - yO)));
    }

    // Overlays
    overlays.forEach(ov => {
      c.strokeStyle = ov.color;
      c.lineWidth = ov.width || 1.5;
      c.setLineDash(ov.dash || []);
      c.beginPath();
      let first = true;
      for (let i = start; i < end; i++) {
        const v = ov.data[i];
        if (isNaN(v)) { first = true; continue; }
        const x = padL + (i - start) * cw + cw / 2;
        const y = yScale(v);
        if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y);
      }
      c.stroke();
      c.setLineDash([]);
    });

    // Flèches signaux
    signals.forEach(sig => {
      for (let i = start; i < end; i++) {
        if (sig.data[i]) {
          const x = padL + (i - start) * cw + cw / 2;
          const b = bars[i];
          const isLong = sig.side === "long";
          const y = isLong ? yScale(b.l) + 10 : yScale(b.h) - 10;
          c.fillStyle = sig.color;
          c.beginPath();
          if (isLong) { c.moveTo(x, y - 6); c.lineTo(x - 5, y + 2); c.lineTo(x + 5, y + 2); }
          else       { c.moveTo(x, y + 6); c.lineTo(x - 5, y - 2); c.lineTo(x + 5, y - 2); }
          c.closePath();
          c.fill();
        }
      }
    });

    // Prix courant
    const last = bars[bars.length - 1];
    const lastY = yScale(last.c);
    c.fillStyle = last.c >= last.o ? "#00E5A0" : "#FF4D6A";
    c.fillRect(padL + chartW, lastY - 8, padR - 8, 16);
    c.fillStyle = "#0d1117";
    c.font = "bold 10px 'JetBrains Mono', monospace";
    c.textAlign = "left";
    c.fillText(last.c.toFixed(2), padL + chartW + 4, lastY + 3);
  }, [bars, ctx, overlays, signals, width, height, view]);

  return (
    <div ref={containerRef} style={{ width: "100%", position: "relative" }}>
      <canvas ref={canvasRef} style={{ display: "block", cursor: "crosshair" }} />
    </div>
  );
}
