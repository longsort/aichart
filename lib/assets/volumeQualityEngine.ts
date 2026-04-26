/**
 * Fulink Pro ULTRA VolumeQualityEngineV1 포팅.
 * 마지막 캔들 거래량 vs 최근 N평균 → 강함/보통/약함/없음.
 */
import type { Candle } from '@/types';

export type VolumeQualityV1 = {
  labelKo: string;
  score: number;
  ratio: number;
  reason: string;
};

export function evalVolumeQuality(candles: Candle[], lookback = 20): VolumeQualityV1 {
  if (candles.length < 3) {
    return { labelKo: '없음', score: 0, ratio: 0, reason: '캔들 부족' };
  }
  const last = candles[candles.length - 1];
  const v = last.volume ?? 0;
  if (v <= 0) {
    return { labelKo: '없음', score: 0, ratio: 0, reason: '거래량 데이터 없음' };
  }
  const n = Math.max(3, Math.min(lookback, candles.length - 1));
  let sum = 0, cnt = 0;
  for (let i = candles.length - 1 - n; i < candles.length - 1; i++) {
    const vv = candles[i].volume ?? 0;
    if (vv > 0) {
      sum += vv;
      cnt++;
    }
  }
  const avg = cnt > 0 ? sum / cnt : 0;
  if (avg <= 0) {
    return { labelKo: '보통', score: 50, ratio: 1, reason: '평균 계산 불가(표본 부족)' };
  }
  const ratio = v / avg;
  if (ratio >= 2.2) return { labelKo: '강함', score: 85, ratio, reason: '평균 대비 거래량 급증' };
  if (ratio >= 1.3) return { labelKo: '보통', score: 65, ratio, reason: '평균 이상 거래량' };
  return { labelKo: '약함', score: 40, ratio, reason: '평균 이하 거래량' };
}
