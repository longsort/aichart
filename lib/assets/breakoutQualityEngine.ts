/**
 * Fulink Pro ULTRA BreakoutQualityEngineV1 포팅.
 * breakLevel 대비 종가 위치 → 돌파좋음/애매/돌파실패/해당없음.
 */
import type { Candle } from '@/types';

export type BreakoutQualityV1 = {
  labelKo: string;
  score: number;
  reason: string;
};

function atr(candles: Candle[], n: number): number {
  if (candles.length < 2) return 0;
  const start = Math.max(1, candles.length - n);
  let sum = 0, cnt = 0;
  for (let i = start; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1].close;
    const tr = Math.max(
      Math.abs(c.high - c.low),
      Math.abs(c.high - p),
      Math.abs(c.low - p)
    );
    sum += tr;
    cnt++;
  }
  return cnt ? sum / cnt : 0;
}

export function evalBreakoutQuality(
  candles: Candle[],
  params: { s1?: number; r1?: number; vwap?: number; breakLevel?: number }
): BreakoutQualityV1 {
  if (!candles.length) {
    return { labelKo: '대기', score: 0, reason: '캔들 데이터 없음' };
  }
  const close = candles[candles.length - 1].close;
  let bl = params.breakLevel ?? 0;
  if (bl <= 0 && (params.s1 ?? 0) > 0 && (params.r1 ?? 0) > 0) {
    const ds = Math.abs(close - (params.s1 ?? 0));
    const dr = Math.abs(close - (params.r1 ?? 0));
    bl = ds <= dr ? (params.s1 ?? 0) : (params.r1 ?? 0);
  } else if (bl <= 0 && (params.s1 ?? 0) > 0) bl = params.s1!;
  else if (bl <= 0 && (params.r1 ?? 0) > 0) bl = params.r1!;

  if (bl <= 0) return { labelKo: '해당없음', score: 0, reason: '기준선 없음' };

  const dist = Math.abs(close - bl);
  const atrVal = atr(candles, 14);
  const tol = atrVal > 0 ? atrVal * 0.15 : bl * 0.001;

  if (dist <= tol) {
    return { labelKo: '애매', score: 45, reason: '기준선 근처 마감(확정 아님)' };
  }
  if (close > bl) {
    const sc = Math.max(0, Math.min(100, 65 + Math.round((dist / (atrVal || dist)) * 25)));
    return { labelKo: '돌파좋음', score: sc, reason: '기준선 위 마감(유지 확인)' };
  }
  const sc = Math.max(0, Math.min(100, 60 + Math.round((dist / (atrVal || dist)) * 20)));
  return { labelKo: '돌파실패', score: sc, reason: '기준선 아래 마감(되돌림 주의)' };
}
