import type { Candle } from '@/types';

export type CloseLevels = {
  dailyCloseLevel: number | null;
  weeklyCloseLevel: number | null;
  monthlyCloseLevel: number | null;
  yearlyCloseLevel?: number | null;
  /** 분/시간봉 종가 레벨 (직전 확정 봉 종가) */
  close1m?: number | null;
  close5m?: number | null;
  close15m?: number | null;
  close1h?: number | null;
  close4h?: number | null;
};

/**
 * 직전 **확정** 봉 종가: 마지막 봉이 아직 마감 전이면 그 이전 봉 종가.
 * 거래소 `time`은 봉 시가(오픈) 시각(초) — 마감 시각 ≈ time + 실제 바 간격.
 * 월·주·일 등은 **직전 두 봉의 time 차이**로 간격을 쓰면 거래소 실제 주기와 일치(고정 30일 등 제거).
 */
const lastClosedClose = (arr: Candle[] | undefined): number | null => {
  if (!arr || arr.length === 0) return null;
  if (arr.length === 1) return arr[0].close;
  const last = arr[arr.length - 1];
  const prev = arr[arr.length - 2];
  const nowSec = Math.floor(Date.now() / 1000);
  const barSec = Math.max(60, Number(last.time) - Number(prev.time));
  const lastIsClosed = nowSec >= Number(last.time) + barSec;
  return lastIsClosed ? last.close : prev.close;
};

/**
 * 최근 확정된 봉별 종가 레벨 계산.
 * 분·시간·일·주·월 전부 지원 (직전 마감 봉 종가).
 */
export function computeCloseLevels(input: {
  candles1d?: Candle[];
  candles1w?: Candle[];
  candles1M?: Candle[];
  candles1Y?: Candle[];
  candles1m?: Candle[];
  candles5m?: Candle[];
  candles15m?: Candle[];
  candles1h?: Candle[];
  candles4h?: Candle[];
}): CloseLevels {
  return {
    dailyCloseLevel: lastClosedClose(input.candles1d),
    weeklyCloseLevel: lastClosedClose(input.candles1w),
    monthlyCloseLevel: lastClosedClose(input.candles1M),
    yearlyCloseLevel: input.candles1Y ? lastClosedClose(input.candles1Y) : null,
    close1m: input.candles1m ? lastClosedClose(input.candles1m) : null,
    close5m: input.candles5m ? lastClosedClose(input.candles5m) : null,
    close15m: input.candles15m ? lastClosedClose(input.candles15m) : null,
    close1h: input.candles1h ? lastClosedClose(input.candles1h) : null,
    close4h: input.candles4h ? lastClosedClose(input.candles4h) : null,
  };
}
