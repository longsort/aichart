/**
 * 고래 모드 전용 TV 스타일 시각 팩: Nen-Star XABCD(하모닉) 오버레이.
 * `analyze` 파이프 밖에서도 동일 `nenStarHitsToOverlays` 경로 사용.
 */
import type { Candle, OverlayItem } from '@/types';
import { detectNenStarHarmonics, nenStarHitsToOverlays } from '@/lib/nenStarHarmonic';

function visIdx(visible: Candle[], i: number): number {
  if (!visible.length) return 0;
  return Math.max(0, Math.min(visible.length - 1, Math.floor(i)));
}

function visTime(visible: Candle[], i: number): number {
  return visible[visIdx(visible, i)].time as number;
}

/** TradingView 스크린샷에 가까운 X-A-B-C-D 외곽·비율 점선·라벨 (최대 3패턴). */
export function buildWhaleNenStarXabcdOverlays(candles: Candle[]): OverlayItem[] {
  if (candles.length < 24) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const c of candles) {
    min = Math.min(min, c.low);
    max = Math.max(max, c.high);
  }
  if (!(min < max)) return [];
  const hits = detectNenStarHarmonics(candles, 3, 3);
  if (!hits.length) return [];
  return nenStarHitsToOverlays(candles, hits, min, max, {
    visTime,
    visIdx,
    xiNorm: (idx: number, lv: number) => Math.max(0, Math.min(idx, lv)) / Math.max(1, lv),
  });
}
