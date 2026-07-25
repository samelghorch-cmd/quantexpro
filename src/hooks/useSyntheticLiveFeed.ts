// Flux live SIMULÉ : rejoue les barres du marché synthétique une par une (playback).
import { useEffect, useRef, useState } from "react";

export interface SyntheticBar {
  t?: number;
  o?: number;
  h?: number;
  l?: number;
  c?: number;
  v?: number;
  [key: string]: unknown;
}

export interface UseSyntheticLiveFeedOpts {
  speed?: number;
  autoStart?: boolean;
}

export function useSyntheticLiveFeed(
  bars: SyntheticBar[],
  { speed = 700, autoStart = false }: UseSyntheticLiveFeedOpts = {},
) {
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
