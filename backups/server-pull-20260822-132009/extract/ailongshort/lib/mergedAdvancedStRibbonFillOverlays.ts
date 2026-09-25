import type { Candle, OverlayItem } from '@/types';
import { visibleLimit, normalizeChartTimeframe } from '@/lib/constants';
import { mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import {
  computeInstitutionalSuperTrendEnvelopeSegmentsFused,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
  type InstitutionalSuperTrendCore,
  type MonthDeskBandFusionContext,
} from '@/lib/institutionalSuperBand';
import { sanitizeChartCandlesForSeries } from '@/lib/volumeHistogramIntelligence';

/** TF별 최근 구간 채움 — 통합분석은 4h 예산 고정 */
function mergedStCloudMaxSegments(timeframe: string): number {
  const tf = normalizeChartTimeframe(timeframe);
  if (tf === '1m' || tf === '3m' || tf === '5m' || tf === '15m' || tf === '1h' || tf === '4h' || tf === '1d' || tf === '1w' || tf === '1M') {
    return 56; // 4h 참조
  }
  const lim = visibleLimit(timeframe);
  if (lim >= 400) return 72;
  if (lim >= 200) return 56;
  return 44;
}

function pickSpreadSegments<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  const out: T[] = [];
  for (let i = 0; i < items.length; i += step) out.push(items[i]!);
  const last = items[items.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) {
    return `rgba(128,128,128,${alpha})`;
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * 통합 고급 완전판: 차트 ST 융합 구간과 동일한 상·하한으로 **계단 리본 면(SVG, 캔들 뒤)** 채움.
 * `ChartView`의 `monthDeskEnvelopeStep` → `channelBandScreen` 폴리곤 경로를 재사용.
 */
export function buildMergedAdvancedStRibbonFillOverlays(params: {
  candles: Candle[];
  timeframe: string;
  fusion: MonthDeskBandFusionContext | null | undefined;
  reuseCore?: InstitutionalSuperTrendCore | null;
  longBandHex?: string;
  shortBandHex?: string;
}): OverlayItem[] {
  const { candles, timeframe, fusion, reuseCore, longBandHex, shortBandHex } = params;
  const safe = sanitizeChartCandlesForSeries(mergedWorkCandles(candles, timeframe), timeframe);
  if (safe.length < 2) return [];

  const longH =
    typeof longBandHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(longBandHex)
      ? longBandHex.toUpperCase()
      : '#22C55E';
  const shortH =
    typeof shortBandHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(shortBandHex)
      ? shortBandHex.toUpperCase()
      : '#EF4444';

  let segs = computeInstitutionalSuperTrendEnvelopeSegmentsFused(
    safe,
    INSTITUTIONAL_BAND_DEFAULT_PERIOD,
    INSTITUTIONAL_BAND_DEFAULT_MULT,
    fusion ?? null,
    reuseCore ?? null
  );

  const maxSegs = mergedStCloudMaxSegments(timeframe);
  segs = pickSpreadSegments(segs, maxSegs);
  const paintSegs = segs;

  const out: OverlayItem[] = [];
  paintSegs.forEach((seg, idx) => {
    const n = seg.upper.length;
    if (n < 2 || seg.lower.length !== n) return;

    let pMin = Infinity;
    let pMax = -Infinity;
    const points = seg.upper.map((u, i) => {
      const up = u.value;
      const lo = seg.lower[i]!.value;
      pMin = Math.min(pMin, up, lo);
      pMax = Math.max(pMax, up, lo);
      return {
        time: Number(u.time),
        upper: up,
        lower: lo,
      };
    });

    const t0 = points[0]!.time;
    const t1 = points[points.length - 1]!.time;
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || !Number.isFinite(pMin) || !Number.isFinite(pMax)) return;

    const longSeg = seg.dir === 'long';
    const fill = hexToRgba(longSeg ? longH : shortH, longSeg ? 0.14 : 0.12);

    out.push({
      id: `merged-ares-st-cloud-${idx}`,
      kind: 'channelBand',
      label: longSeg ? 'ST 구름·롱' : 'ST 구름·숏',
      x1: 0,
      y1: 0.5,
      x2: 1,
      y2: 0.5,
      time1: t0,
      time2: t1,
      price1: pMin,
      price2: pMax,
      confidence: 52,
      color: fill,
      category: 'monthDeskEnvelope',
      structureBias: longSeg ? 'bullish' : 'bearish',
      monthDeskEnvelopeStep: { points },
      zoneFillPreserve: true,
      overlayZoneExtraClass: 'merged-ares-st-cloud',
      labelTooltip: 'SuperTrend 상·하한 사이 구름(캔들·TF 동기, 참고·비보장)',
    });
  });

  return out;
}
