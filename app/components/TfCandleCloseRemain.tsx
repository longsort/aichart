'use client';

import {
  candleCloseRemainSec,
  candleCloseSessionTipKo,
  formatCandleCloseRemain,
  timeframePeriodSec,
  type CandleCloseExchange,
} from '@/lib/closeSettlement';

type Props = {
  tf: string;
  nowMs: number;
  /** 선택 TF면 강조 */
  active?: boolean;
  /** 좁은 UI */
  compact?: boolean;
  /** 통합·분석 BTCUSDT.P 기본 bitget */
  exchange?: CandleCloseExchange;
};

/**
 * TF 칩 옆 — 현재 봉 마감까지 남은 시간 (TradingView식 카운트다운).
 */
export function TfCandleCloseRemain({
  tf,
  nowMs,
  active,
  compact,
  exchange = 'binance',
}: Props) {
  const nowSec = Math.floor(nowMs / 1000);
  const remain = candleCloseRemainSec(nowSec, tf, exchange);
  const period = timeframePeriodSec(tf);
  const urgent = period > 0 && remain <= period * 0.15;
  const label = formatCandleCloseRemain(remain);

  return (
    <span
      className="tf-candle-close-remain"
      style={{
        marginLeft: compact ? 3 : 5,
        fontWeight: active ? 800 : 600,
        fontSize: compact ? 9 : 10,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: 0.2,
        color: urgent ? '#fbbf24' : active ? '#e2e8f0' : '#94a3b8',
        opacity: active ? 1 : 0.92,
        whiteSpace: 'nowrap',
      }}
      aria-label={`${tf} 봉 마감까지 ${label}`}
      title={candleCloseSessionTipKo(exchange)}
    >
      {label}
    </span>
  );
}

export function tfCandleCloseTitleSuffix(
  tf: string,
  nowMs: number,
  exchange: CandleCloseExchange = 'binance'
): string {
  const remain = formatCandleCloseRemain(
    candleCloseRemainSec(Math.floor(nowMs / 1000), tf, exchange)
  );
  return `봉 마감 ${remain} · ${candleCloseSessionTipKo(exchange)}`;
}
