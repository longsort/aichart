import type { Candle } from '@/types';

export type CloseLevels = {
  dailyCloseLevel: number | null;
  weeklyCloseLevel: number | null;
  monthlyCloseLevel: number | null;
  yearlyCloseLevel?: number | null;
};

/**
 * 최근 확정된 일/주/월(연)봉 종가 레벨 계산.
 * "확정" = 이미 마감된 봉이므로, 마지막 완성 봉의 종가를 사용 (현재 형성 중인 봉 제외).
 */
export function computeCloseLevels(input: {
  candles1d?: Candle[];
  candles1w?: Candle[];
  candles1M?: Candle[];
  candles1Y?: Candle[];
}): CloseLevels {
  const lastClosedClose = (arr: Candle[] | undefined): number | null => {
    if (!arr || arr.length === 0) return null;
    if (arr.length >= 2) return arr[arr.length - 2].close;
    return arr[arr.length - 1].close;
  };

  return {
    dailyCloseLevel: lastClosedClose(input.candles1d),
    weeklyCloseLevel: lastClosedClose(input.candles1w),
    monthlyCloseLevel: lastClosedClose(input.candles1M),
    yearlyCloseLevel: input.candles1Y ? lastClosedClose(input.candles1Y) : null,
  };
}
