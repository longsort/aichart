/**
 * Fulink Pro ULTRA CloseContextEngineV1 포팅.
 * 마지막 캔들 바디/꼬리/종가 위치 → 강한마감/보통/약한마감/함정주의.
 */
import type { Candle } from '@/types';

export type CloseContextV1 = {
  labelKo: string;
  score: number;
  reason: string;
  bodyPct: number;
  wickUpPct: number;
  wickDnPct: number;
};

export function evalCloseContext(candles: Candle[]): CloseContextV1 {
  const empty: CloseContextV1 = {
    labelKo: '대기',
    score: 0,
    reason: '캔들 데이터 없음',
    bodyPct: 0,
    wickUpPct: 0,
    wickDnPct: 0,
  };
  if (!candles.length) return empty;
  const c = candles[candles.length - 1];
  const range = Math.abs(c.high - c.low);
  if (range <= 0) {
    return { ...empty, reason: '변동 없음' };
  }

  const body = Math.abs(c.close - c.open);
  const upper = c.high - (c.open > c.close ? c.open : c.close);
  const lower = (c.open < c.close ? c.open : c.close) - c.low;
  const upperWick = Math.max(0, upper);
  const lowerWick = Math.max(0, lower);

  const bodyPct = Math.max(0, Math.min(1, body / range));
  const wickUpPct = Math.max(0, Math.min(1, upperWick / range));
  const wickDnPct = Math.max(0, Math.min(1, lowerWick / range));
  const closePos = Math.max(0, Math.min(1, (c.close - c.low) / range));

  let score = Math.max(0, Math.min(100, Math.round(bodyPct * 60 + closePos * 40)));

  if (wickUpPct >= 0.45 && closePos <= 0.55) {
    score = Math.round(score * 0.7);
    return { labelKo: '함정주의', score, reason: '윗꼬리 길고 위에서 못 버팀', bodyPct, wickUpPct, wickDnPct };
  }
  if (bodyPct >= 0.55 && closePos >= 0.72) {
    return { labelKo: '강한 마감', score, reason: '몸통 큼 + 위에서 마감', bodyPct, wickUpPct, wickDnPct };
  }
  if (bodyPct <= 0.28 && closePos <= 0.35) {
    score = Math.round(score * 0.85);
    return { labelKo: '약한 마감', score, reason: '몸통 작고 아래로 마감', bodyPct, wickUpPct, wickDnPct };
  }
  return {
    labelKo: '보통',
    score,
    reason: closePos >= 0.5 ? '위쪽 마감(무난)' : '아래쪽 마감(무난)',
    bodyPct,
    wickUpPct,
    wickDnPct,
  };
}
