/**
 * Triple Trend 밴드 — LineSeries 대신 단일 SVG/HTML (성능·캔들 스냅).
 */
import type { TripleTrendFusionPack, TripleTrendFusionSegment } from '@/lib/mergedDeskTripleTrendFusionBand';
import { TRIPLE_TREND_BEAR, TRIPLE_TREND_BULL } from '@/lib/mergedDeskTripleTrendFusionBand';

export type TripleTrendBandDrawSegment = {
  dir: 'long' | 'short';
  color: string;
  line1: string;
  line2: string;
  line3: string;
  fillPath: string;
  active: boolean;
};

export type TripleTrendFlipDrawLine = {
  id: string;
  x: number;
  yTop: number;
  yBot: number;
  color: string;
};

export type TripleTrendBandDrawModel = {
  width: number;
  height: number;
  segments: TripleTrendBandDrawSegment[];
  flips: TripleTrendFlipDrawLine[];
};

function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const out: T[] = [];
  const step = (arr.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(arr[Math.min(arr.length - 1, Math.round(i * step))]!);
  }
  return out;
}

function polyline(points: Array<{ x: number; y: number }>): string {
  if (!points.length) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

function ribbonFillPath(
  upper: Array<{ x: number; y: number }>,
  lower: Array<{ x: number; y: number }>
): string {
  if (upper.length < 2 || lower.length < 2) return '';
  const fwd = upper.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const rev = [...lower]
    .reverse()
    .map((p, i) => `${i === 0 ? 'L' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  return `${fwd} ${rev} Z`;
}

function segmentPaths(
  seg: TripleTrendFusionSegment,
  timeToX: (t: number) => number | null,
  priceToY: (p: number) => number | null,
  maxPoints: number
): Omit<TripleTrendBandDrawSegment, 'dir' | 'color' | 'active'> | null {
  const n = Math.min(seg.band1.length, seg.band2.length, seg.band3.length);
  if (n < 2) return null;

  const idxs = downsample(
    Array.from({ length: n }, (_, i) => i),
    maxPoints
  );

  const p1: Array<{ x: number; y: number }> = [];
  const p2: Array<{ x: number; y: number }> = [];
  const p3: Array<{ x: number; y: number }> = [];

  for (const i of idxs) {
    const t = Number(seg.band1[i]!.time);
    const x = timeToX(t);
    const y1 = priceToY(seg.band1[i]!.value);
    const y2 = priceToY(seg.band2[i]!.value);
    const y3 = priceToY(seg.band3[i]!.value);
    if (x == null || y1 == null || y2 == null || y3 == null) continue;
    if (![x, y1, y2, y3].every(Number.isFinite)) continue;
    p1.push({ x, y: y1 });
    p2.push({ x, y: y2 });
    p3.push({ x, y: y3 });
  }
  if (p1.length < 2) return null;

  const longSeg = seg.dir === 'long';
  const upper = longSeg ? p3 : p1;
  const lower = longSeg ? p1 : p3;

  return {
    line1: polyline(p1),
    line2: polyline(p2),
    line3: polyline(p3),
    fillPath: ribbonFillPath(upper, lower),
  };
}

/** pack → 화면 SVG path (캔들 bar X 스냅) */
export function buildTripleTrendBandDrawModel(
  pack: TripleTrendFusionPack | null | undefined,
  params: {
    width: number;
    height: number;
    timeToX: (t: number) => number | null;
    priceToY: (p: number) => number | null;
    maxSegments?: number;
    maxPointsPerSeg?: number;
    includeFlips?: boolean;
  }
): TripleTrendBandDrawModel | null {
  if (!pack?.segments.length || params.width < 8 || params.height < 8) return null;

  const maxSeg = Math.max(1, params.maxSegments ?? 3);
  const maxPts = Math.max(24, params.maxPointsPerSeg ?? 72);
  const segs = pack.segments.slice(-maxSeg);

  const segments: TripleTrendBandDrawSegment[] = [];
  for (let si = 0; si < segs.length; si++) {
    const seg = segs[si]!;
    const paths = segmentPaths(seg, params.timeToX, params.priceToY, maxPts);
    if (!paths) continue;
    const longSeg = seg.dir === 'long';
    const active = si === segs.length - 1;
    segments.push({
      ...paths,
      dir: seg.dir,
      color: longSeg ? TRIPLE_TREND_BULL : TRIPLE_TREND_BEAR,
      active,
    });
  }
  if (!segments.length) return null;

  const flips: TripleTrendFlipDrawLine[] = [];
  if (params.includeFlips === true) {
    for (const ev of pack.trendChangeEvents) {
      const x = params.timeToX(ev.time);
      const yTop = params.priceToY(ev.priceTop);
      const yBot = params.priceToY(ev.priceBot);
      if (x == null || yTop == null || yBot == null) continue;
      if (![x, yTop, yBot].every(Number.isFinite)) continue;
      flips.push({
        id: `tt-flip-${ev.time}`,
        x,
        yTop: Math.min(yTop, yBot),
        yBot: Math.max(yTop, yBot),
        color: ev.bull ? TRIPLE_TREND_BULL : TRIPLE_TREND_BEAR,
      });
    }
  }

  return { width: params.width, height: params.height, segments, flips };
}
