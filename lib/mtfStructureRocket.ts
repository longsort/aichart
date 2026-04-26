import type { AnalyzeResponse } from '@/types';

/** 차트 마커와 동일: 마지막 봉 구간 [lastOpen, lastOpen+period) 안의 구조 로켓만 해당 봉에 표시 */
const TF_PERIOD_SECONDS: Record<string, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
  '1w': 604800,
  '1M': 2592000,
  '1Y': 31536000,
};

/**
 * 해당 TF analyze의 **마지막 캔들**에 그려지는 구조 방향(롱 🚀 / 숏 ↓ HUD 기준).
 * `candles`는 /api/analyze 응답의 `visible` 캔들과 동일해야 함.
 */
export function structureRocketDirectionOnLastCandle(
  rockets: AnalyzeResponse['structureRocketSignals'] | undefined,
  candles: Array<{ time?: number }> | undefined,
  tf: string
): 'LONG' | 'SHORT' | null {
  if (!Array.isArray(candles) || candles.length === 0) return null;
  const last = candles[candles.length - 1];
  const lastT = typeof last?.time === 'number' && Number.isFinite(last.time) ? last.time : null;
  if (lastT == null) return null;
  const period = TF_PERIOD_SECONDS[tf] ?? 60;
  const rangeEnd = lastT + period;
  let bestT = -Infinity;
  let best: 'LONG' | 'SHORT' | null = null;
  for (const r of rockets ?? []) {
    const dir = r?.direction;
    if (dir !== 'LONG' && dir !== 'SHORT') continue;
    const rt = typeof r.time === 'number' && Number.isFinite(r.time) ? r.time : NaN;
    if (!Number.isFinite(rt)) continue;
    if (lastT <= rt && rt < rangeEnd) {
      if (rt >= bestT) {
        bestT = rt;
        best = dir;
      }
    }
  }
  return best;
}
