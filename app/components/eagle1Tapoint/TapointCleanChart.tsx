'use client';

/**
 * 타점엔진 전용 차트 — 캔들·거래량·E/SL/TP 가격선만.
 * ChartView / 통합데스크 오버레이 금지.
 */
import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';

export type TapointCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type TapointLevels = {
  entry?: number | null;
  sl?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  tp3?: number | null;
  zoneLo?: number | null;
  zoneHi?: number | null;
};

type Props = {
  candles: TapointCandle[];
  levels?: TapointLevels | null;
  decisionKo?: string;
};

function toSec(t: number): UTCTimestamp {
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 0 as UTCTimestamp;
  return (n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)) as UTCTimestamp;
}

export default function TapointCleanChart({ candles, levels, decisionKo }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#0b1220' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: 'IBM Plex Sans KR, Pretendard, Noto Sans KR, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(30,42,63,0.55)' },
        horzLines: { color: 'rgba(30,42,63,0.55)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(148,163,184,0.35)', width: 1, style: LineStyle.Dashed },
        horzLine: { color: 'rgba(148,163,184,0.35)', width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: '#1e2a3f',
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: '#1e2a3f',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#4ade80',
      wickDownColor: '#f87171',
      priceLineVisible: true,
      lastValueVisible: true,
    });
    const vol = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    vol.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candle;
    volRef.current = vol;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: host.clientWidth, height: host.clientHeight });
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      linesRef.current = [];
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
    };
  }, []);

  useEffect(() => {
    const candle = candleRef.current;
    const vol = volRef.current;
    if (!candle || !vol) return;
    const rows = (candles || [])
      .map((c) => ({
        time: toSec(c.time),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume) || 0,
      }))
      .filter((c) => c.time > 0 && c.open > 0 && c.close > 0);
    if (!rows.length) {
      candle.setData([]);
      vol.setData([]);
      return;
    }
    candle.setData(
      rows.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))
    );
    vol.setData(
      rows.map((r) => ({
        time: r.time,
        value: r.volume,
        color:
          r.close >= r.open ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)',
      }))
    );
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    for (const pl of linesRef.current) {
      try {
        series.removePriceLine(pl);
      } catch {
        /* ignore */
      }
    }
    linesRef.current = [];
    const add = (
      price: number | null | undefined,
      color: string,
      title: string,
      style: LineStyle = LineStyle.Solid
    ) => {
      if (!(price != null && price > 0)) return;
      const pl = series.createPriceLine({
        price,
        color,
        lineWidth: 2,
        lineStyle: style,
        axisLabelVisible: true,
        title,
      });
      linesRef.current.push(pl);
    };
    add(levels?.zoneHi ?? null, 'rgba(56,189,248,0.55)', '존상', LineStyle.SparseDotted);
    add(levels?.zoneLo ?? null, 'rgba(56,189,248,0.55)', '존하', LineStyle.SparseDotted);
    add(levels?.entry ?? null, '#38bdf8', '진입');
    add(levels?.sl ?? null, '#f87171', '손절');
    add(levels?.tp1 ?? null, '#4ade80', 'TP1');
    add(levels?.tp2 ?? null, '#22c55e', 'TP2', LineStyle.Dashed);
    add(levels?.tp3 ?? null, '#16a34a', 'TP3', LineStyle.Dashed);
  }, [levels]);

  return (
    <div className="tap-clean-chart">
      {decisionKo ? <div className="tap-clean-badge">{decisionKo}</div> : null}
      <div ref={hostRef} className="tap-clean-host" />
      <style jsx>{`
        .tap-clean-chart {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 420px;
          background: #0b1220;
        }
        .tap-clean-host {
          position: absolute;
          inset: 0;
        }
        .tap-clean-badge {
          position: absolute;
          z-index: 2;
          top: 10px;
          left: 12px;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #e2e8f0;
          background: rgba(15, 23, 42, 0.82);
          border: 1px solid #1e2a3f;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
