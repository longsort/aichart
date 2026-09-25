'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import {
  candleCloseRemainSec,
  candleCloseSessionTipKo,
  formatCandleCloseRemain,
  timeframePeriodSec,
  type CandleCloseExchange,
} from '@/lib/closeSettlement';

type Props = {
  timeframe: string;
  nowMs: number;
  lastPrice: number | null;
  hostRef: RefObject<HTMLDivElement | null>;
  chartRef: RefObject<IChartApi | null>;
  seriesRef: RefObject<ISeriesApi<'Candlestick'> | null>;
  /** 통합·분석 BTCUSDT.P 기본 bitget */
  exchange?: CandleCloseExchange;
};

/**
 * 차트 우측(마지막 봉~가격축 사이) — 현재 TF 봉 마감까지 남은 시간.
 * Bitget: 일·주·월 16:00 UTC / Binance: 09:00 KST.
 */
export function ChartCandleCloseTimer({
  timeframe,
  nowMs,
  lastPrice,
  hostRef,
  chartRef,
  seriesRef,
  exchange = 'binance',
}: Props) {
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 120, right: 64 });

  useLayoutEffect(() => {
    const place = () => {
      const host = hostRef.current;
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!host) return;
      const h = host.clientHeight || 400;
      let top = Math.round(h * 0.38);
      if (series && lastPrice != null && Number.isFinite(lastPrice)) {
        try {
          const y = series.priceToCoordinate(lastPrice);
          if (typeof y === 'number' && Number.isFinite(y)) {
            top = Math.max(28, Math.min(h - 36, Math.round(y)));
          }
        } catch {
          /* ignore */
        }
      }
      let right = 64;
      try {
        const ps = chart?.priceScale?.('right');
        const w = typeof ps?.width === 'function' ? ps.width() : 0;
        if (typeof w === 'number' && w > 0) right = Math.round(w + 10);
      } catch {
        /* ignore */
      }
      setPos({ top, right });
    };
    place();
    const host = hostRef.current;
    const chart = chartRef.current;
    const ts = chart?.timeScale?.();
    const ro = host ? new ResizeObserver(place) : null;
    if (host && ro) ro.observe(host);
    ts?.subscribeVisibleLogicalRangeChange?.(place);
    return () => {
      ro?.disconnect();
      try {
        ts?.unsubscribeVisibleLogicalRangeChange?.(place);
      } catch {
        /* ignore */
      }
    };
  }, [hostRef, chartRef, seriesRef, lastPrice, timeframe, nowMs]);

  const nowSec = Math.floor(nowMs / 1000);
  const remain = candleCloseRemainSec(nowSec, timeframe, exchange);
  const period = timeframePeriodSec(timeframe);
  const urgent = period > 0 && remain <= Math.max(15, period * 0.12);
  const label = formatCandleCloseRemain(remain);
  const tfLbl = timeframe === '1w' ? '1W' : timeframe === '1M' ? '1M' : timeframe === '1Y' ? '1Y' : timeframe;
  const tip = candleCloseSessionTipKo(exchange);

  return (
    <div
      className={`chart-candle-close-timer${urgent ? ' chart-candle-close-timer--urgent' : ''}`}
      style={{ top: pos.top, right: pos.right }}
      title={`${tfLbl} 봉 마감까지 ${label} · ${tip}`}
      aria-live="polite"
    >
      <span className="chart-candle-close-timer__tf">{tfLbl}</span>
      <span className="chart-candle-close-timer__remain">{label}</span>
    </div>
  );
}
