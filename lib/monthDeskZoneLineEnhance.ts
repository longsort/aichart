import type { LineData, UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { InstitutionalEnvelopeTrendSegment } from '@/lib/institutionalSuperBand';

/**
 * 차트 LineSeries로 그릴 최대 융합 구간 수.
 * 너무 낮으면(구 14) 우측 최근 구간만 보이고 왼쪽 과거 존선이 통째로 사라짐.
 * 초과 시 `coalesceMonthDeskEnvelopeSegmentsForDisplay`로 인접 구간을 합쳐 전 구간 타임라인은 유지.
 */
export const MONTH_DESK_ENVELOPE_LINE_MAX_SEGMENTS = 56;
/** 통합·분석 기관밴드 — 리본 fill과 동일 예산 */
export const MERGED_DESK_ENVELOPE_LINE_MAX_SEGMENTS = 72;

function periodSeconds(tf: string): number {
  const map: Record<string, number> = {
    '1m': 60,
    '3m': 180,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '2h': 7200,
    '4h': 14400,
    '6h': 21600,
    '8h': 28800,
    '12h': 43200,
    '1d': 86400,
    '3d': 259200,
    '1w': 604800,
    '1M': 2592000,
  };
  return map[normalizeChartTimeframe(tf)] ?? 3600;
}

/** 활성 구간 존선을 차트 우측(미래 봉)으로 연장 — 스텝 밴드가 끊기지 않게 */
export function extendEnvelopeSegmentToFuture(
  seg: InstitutionalEnvelopeTrendSegment,
  extendBars: number,
  barSec: number
): InstitutionalEnvelopeTrendSegment {
  if (!seg.upper.length || extendBars < 1 || barSec < 1) return seg;
  const lastU = seg.upper[seg.upper.length - 1]!;
  const lastL = seg.lower[seg.lower.length - 1]!;
  const tLast = Number(lastU.time);
  if (!Number.isFinite(tLast)) return seg;
  const upper: LineData<UTCTimestamp>[] = [...seg.upper];
  const lower: LineData<UTCTimestamp>[] = [...seg.lower];
  for (let k = 1; k <= extendBars; k++) {
    const t = (tLast + k * barSec) as UTCTimestamp;
    upper.push({ time: t, value: lastU.value });
    lower.push({ time: t, value: lastL.value });
  }
  return { dir: seg.dir, upper, lower };
}

/** 존선 LineSeries용 — 최근 N개 구간만(성능). 과거가 비는 부작용이 있어 통합·분석은 coalesce 권장 */
export function sliceMonthDeskEnvelopeSegmentsForDisplay(
  segs: InstitutionalEnvelopeTrendSegment[],
  maxSegments = MONTH_DESK_ENVELOPE_LINE_MAX_SEGMENTS
): InstitutionalEnvelopeTrendSegment[] {
  if (segs.length <= maxSegments) return segs;
  return segs.slice(-maxSegments);
}

/**
 * 구간 수 상한을 지키되 **타임라인 앞쪽을 버리지 않음**.
 * 짧은 인접 구간을 합쳐 LineSeries 수를 줄인다(색은 더 긴 쪽 dir).
 */
export function coalesceMonthDeskEnvelopeSegmentsForDisplay(
  segs: InstitutionalEnvelopeTrendSegment[],
  maxSegments = MONTH_DESK_ENVELOPE_LINE_MAX_SEGMENTS
): InstitutionalEnvelopeTrendSegment[] {
  if (segs.length <= maxSegments) return segs;
  let cur = segs;
  while (cur.length > maxSegments) {
    let bestI = 0;
    let bestLen = Infinity;
    for (let i = 0; i < cur.length - 1; i++) {
      const len = cur[i]!.upper.length + cur[i + 1]!.upper.length;
      if (len < bestLen) {
        bestLen = len;
        bestI = i;
      }
    }
    const a = cur[bestI]!;
    const b = cur[bestI + 1]!;
    const dir = a.upper.length >= b.upper.length ? a.dir : b.dir;
    const upper: LineData<UTCTimestamp>[] = [...a.upper];
    const lower: LineData<UTCTimestamp>[] = [...a.lower];
    const tLast = Number(upper[upper.length - 1]?.time);
    for (let k = 0; k < b.upper.length; k++) {
      if (Number(b.upper[k]!.time) === tLast) continue;
      upper.push(b.upper[k]!);
      lower.push(b.lower[k]!);
    }
    cur = [...cur.slice(0, bestI), { dir, upper, lower }, ...cur.slice(bestI + 2)];
  }
  return cur;
}

/**
 * 마감·안착: LineSeries에 미래 시각을 넣지 않음(timeScale이 캔들보다 멀리 가면 우측이 빈 축).
 * 우측 여백은 lightweight-charts `timeScale.rightOffset`만 사용.
 */
export function monthDeskEnvelopeExtendBars(_timeframe?: string | null): number {
  return 0;
}

/** 존선·가이드가 마지막 캔들 시각을 넘지 않게 — 캔들 우측 빈 구간 방지 */
export function clipLineDataToLastBarTime(
  points: LineData<UTCTimestamp>[],
  lastBarTime: number
): LineData<UTCTimestamp>[] {
  if (!points.length || !Number.isFinite(lastBarTime)) return points;
  const out = points.filter((p) => Number(p.time) <= lastBarTime);
  return out.length >= 2 ? out : points.slice(0, Math.min(2, points.length));
}

export function clipEnvelopeSegmentToLastBar(
  seg: InstitutionalEnvelopeTrendSegment,
  lastBarTime: number
): InstitutionalEnvelopeTrendSegment {
  return {
    dir: seg.dir,
    upper: clipLineDataToLastBarTime(seg.upper, lastBarTime),
    lower: clipLineDataToLastBarTime(seg.lower, lastBarTime),
  };
}

export { periodSeconds };
