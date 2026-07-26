// Chart chandelier interactif basé sur TradingView Lightweight Charts (v5, gratuit).
// Pan / zoom / crosshair natifs + marqueurs de trades (entrées/sorties d'un backtest).
import { useEffect, useRef } from "react";
import {
  createChart, CandlestickSeries, createSeriesMarkers,
  ColorType, CrosshairMode,
  type IChartApi, type ISeriesApi, type ISeriesMarkersPluginApi,
  type CandlestickData, type UTCTimestamp, type SeriesMarker, type Time,
} from "lightweight-charts";
import { T } from "../shared/theme.ts";

interface ChartBar { o: number; h: number; l: number; c: number; t: number; }
interface ChartTrade { entryTime?: number; exitTime?: number; side?: number; pnl?: number; }

// Les barres portent `t` en millisecondes ; Lightweight Charts attend des secondes (UTC).
const toSec = (t: number): UTCTimestamp => (t > 1e12 ? Math.floor(t / 1000) : Math.floor(t)) as UTCTimestamp;

export function TvCandleChart({ bars, trades = [], height = 340 }: { bars: ChartBar[]; trades?: ChartTrade[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  // Création unique du chart (l'auto-size gère le redimensionnement via ResizeObserver interne).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: T.textDim, fontFamily: T.sans },
      grid: { vertLines: { color: `${T.border}55` }, horzLines: { color: `${T.border}55` } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: T.border },
      timeScale: { borderColor: T.border, timeVisible: true, secondsVisible: false },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: T.green, downColor: T.red, borderVisible: false,
      wickUpColor: T.green, wickDownColor: T.red,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);
    return () => { chart.remove(); chartRef.current = null; seriesRef.current = null; markersRef.current = null; };
  }, []);

  // Données + marqueurs de trades (recalculés quand bars/trades changent).
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    const data: CandlestickData[] = (bars || [])
      .filter((b) => b && Number.isFinite(b.t))
      .map((b) => ({ time: toSec(b.t), open: b.o, high: b.h, low: b.l, close: b.c }));
    series.setData(data);

    const markers: SeriesMarker<Time>[] = [];
    for (const tr of trades || []) {
      if (tr.entryTime != null) {
        const long = (tr.side ?? 1) >= 0;
        markers.push({
          time: toSec(tr.entryTime), position: long ? "belowBar" : "aboveBar",
          color: long ? T.green : T.red, shape: long ? "arrowUp" : "arrowDown",
          text: long ? "Achat" : "Vente",
        });
      }
      if (tr.exitTime != null) {
        markers.push({
          time: toSec(tr.exitTime), position: "aboveBar",
          color: (tr.pnl ?? 0) >= 0 ? T.blue : T.orange, shape: "circle",
        });
      }
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    markersRef.current?.setMarkers(markers);
    chart.timeScale().fitContent();
  }, [bars, trades]);

  return <div ref={ref} style={{ width: "100%", height }} />;
}
