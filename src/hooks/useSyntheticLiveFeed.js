// Flux live SIMULÉ : rejoue les barres du marché synthétique une par une (playback).
import { useEffect, useRef, useState } from "react";

export function useSyntheticLiveFeed(bars, { speed = 700, autoStart = false } = {}) {
  const [idx, setIdx] = useState(Math.min(100, bars.length));
  const [playing, setPlaying] = useState(autoStart);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => { setIdx(Math.min(100, bars.length)); }, [bars]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setIdx((i) => {
        if (i >= bars.length) { return bars.length; }
        return i + 1;
      });
    }, speedRef.current);
    return () => clearInterval(id);
  }, [playing, bars.length]);

  const visible = bars.slice(0, idx);
  const last = visible[visible.length - 1];
  return { idx, setIdx, playing, setPlaying, visible, last, atEnd: idx >= bars.length };
}
