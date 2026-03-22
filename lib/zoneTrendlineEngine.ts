/**
 * Zone & Trendline Engine — 이미지 기반 정밀 분석
 * - 수평 Support/Resistance Zone (가격 밀집·터치 기반)
 * - 대각선 Underneath Support (HL 연결), Overhead Resistance (LH 연결)
 * - 역할 전환: Broken Support → Overhead Resistance
 * - Retest 탐지
 * - Double Top/Bottom, Descending Triangle 등
 * 분·시간·일·주 차트 각 TF별 자동 분석
 */

import type { Candle } from '@/types';
import { detectPivots, type PivotPoint } from './trendlineEngine';
import { atrSeries } from './indicators';

const ATR_PERIOD = 14;
const ZONE_ATR_TOL = 0.4; // 수평존 가격 허용 범위
const MIN_TOUCHES = 2; // 최소 터치 횟수

export type HorizontalZone = {
  kind: 'support' | 'resistance';
  low: number;
  high: number;
  mid: number;
  touches: number;
  label: string;
  /** 돌파 후 역할 전환: support → overhead resistance */
  roleReversed?: boolean;
};

export type DiagonalTrendline = {
  kind: 'underneath_support' | 'overhead_resistance';
  p1: PivotPoint;
  p2: PivotPoint;
  slope: number;
  label: string;
};

export type RetestPoint = {
  zone: HorizontalZone;
  index: number;
  price: number;
  label: string;
};

export type BreakoutPoint = {
  zone: HorizontalZone;
  index: number;
  direction: 'down' | 'up';
  label: string;
};

export type ZoneTrendlineResult = {
  horizontalZones: HorizontalZone[];
  diagonalLines: DiagonalTrendline[];
  retests: RetestPoint[];
  breakouts: BreakoutPoint[];
  doubleTop: { resistance: number; support: number; broken: boolean } | null;
  doubleBottom: { support: number; resistance: number; broken: boolean } | null;
};

function atrVal(candles: Candle[]): number {
  const arr = atrSeries(candles, ATR_PERIOD);
  return arr.length ? arr[arr.length - 1] : candles[0]?.close * 0.01 || 100;
}

/** 수평 Support/Resistance Zone — pivot 터치 기반 (가격 밀집 구간) */
function findHorizontalZones(
  candles: Candle[],
  highs: PivotPoint[],
  lows: PivotPoint[],
  tolerance: number
): HorizontalZone[] {
  const zones: HorizontalZone[] = [];
  const seenSup = new Set<number>();
  const seenRes = new Set<number>();

  for (const l of lows) {
    const cluster = lows.filter((x) => Math.abs(x.price - l.price) <= tolerance);
    if (cluster.length < MIN_TOUCHES) continue;
    const mid = cluster.reduce((s, x) => s + x.price, 0) / cluster.length;
    const key = Math.round(mid * 100) / 100;
    if (seenSup.has(key)) continue;
    seenSup.add(key);
    zones.push({
      kind: 'support',
      low: mid - tolerance,
      high: mid + tolerance,
      mid,
      touches: cluster.length,
      label: '지지 구간',
    });
  }

  for (const h of highs) {
    const cluster = highs.filter((x) => Math.abs(x.price - h.price) <= tolerance);
    if (cluster.length < MIN_TOUCHES) continue;
    const mid = cluster.reduce((s, x) => s + x.price, 0) / cluster.length;
    const key = Math.round(mid * 100) / 100;
    if (seenRes.has(key)) continue;
    seenRes.add(key);
    zones.push({
      kind: 'resistance',
      low: mid - tolerance,
      high: mid + tolerance,
      mid,
      touches: cluster.length,
      label: '저항 구간',
    });
  }

  return zones.sort((a, b) => a.mid - b.mid).slice(-6);
}

/** 대각선 Underneath Support (HL 연결) / Overhead Resistance (LH 연결) */
function findDiagonalLines(highs: PivotPoint[], lows: PivotPoint[]): DiagonalTrendline[] {
  const out: DiagonalTrendline[] = [];

  for (let i = 0; i < lows.length - 1; i++) {
    const p1 = lows[i];
    const p2 = lows[i + 1];
    if (p2.price <= p1.price) continue;
    const slope = (p2.price - p1.price) / (p2.index - p1.index);
    out.push({
      kind: 'underneath_support',
      p1,
      p2,
      slope,
      label: '하단지지선',
    });
  }

  for (let i = 0; i < highs.length - 1; i++) {
    const p1 = highs[i];
    const p2 = highs[i + 1];
    if (p2.price >= p1.price) continue;
    const slope = (p2.price - p1.price) / (p2.index - p1.index);
    out.push({
      kind: 'overhead_resistance',
      p1,
      p2,
      slope,
      label: '상단저항선',
    });
  }

  return out;
}

/** 돌파·역할전환·Retest 탐지 */
function detectBreakoutsAndRetests(
  candles: Candle[],
  zones: HorizontalZone[],
  tolerance: number
): { breakouts: BreakoutPoint[]; retests: RetestPoint[]; updatedZones: HorizontalZone[] } {
  const breakouts: BreakoutPoint[] = [];
  const retests: RetestPoint[] = [];
  const updatedZones = zones.map((z) => ({ ...z }));

  for (let i = 0; i < candles.length - 1; i++) {
    const c = candles[i];
    const next = candles[i + 1];

    for (let zi = 0; zi < updatedZones.length; zi++) {
      const z = updatedZones[zi];
      if (z.roleReversed) continue;

      if (z.kind === 'support') {
        if (c.close > z.high && next.close < z.low - tolerance) {
          breakouts.push({
            zone: z,
            index: i + 1,
            price: next.close,
            label: '돌파',
          });
          updatedZones[zi] = { ...z, roleReversed: true, label: '상단저항선' };
        }
      } else {
        if (c.close < z.low && next.close > z.high + tolerance) {
          breakouts.push({
            zone: z,
            index: i + 1,
            price: next.close,
            label: '돌파',
          });
          updatedZones[zi] = { ...z, roleReversed: true, label: '하단지지선' };
        }
      }
    }
  }

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    for (const z of updatedZones) {
      if (!z.roleReversed) continue;
      const nearZone = c.low <= z.high + tolerance && c.high >= z.low - tolerance;
      if (nearZone) {
        const prevBelow = i > 0 && candles[i - 1].close < z.low;
        const currNear = Math.abs(c.close - z.mid) <= tolerance * 2;
        if (prevBelow && currNear) {
          retests.push({
            zone: z,
            index: i,
            price: c.close,
            label: '재테스트',
          });
        }
      }
    }
  }

  return { breakouts, retests, updatedZones };
}

/** Double Top: 2개 피크 동일 수준 + 그 사이 valley */
function findDoubleTop(
  candles: Candle[],
  highs: PivotPoint[],
  lows: PivotPoint[],
  tolerance: number
): { resistance: number; support: number; broken: boolean } | null {
  for (let i = 0; i <= highs.length - 2; i++) {
    const p1 = highs[i];
    const p2 = highs[i + 1];
    if (Math.abs(p1.price - p2.price) > tolerance) continue;

    const valley = lows.find((l) => l.index > p1.index && l.index < p2.index);
    if (!valley) continue;

    const resistance = (p1.price + p2.price) / 2;
    const support = valley.price;
    const lastClose = candles[candles.length - 1]?.close ?? 0;
    const broken = lastClose < support - tolerance * 0.5;

    return { resistance, support, broken };
  }
  return null;
}

/** Double Bottom: 2개 valley 동일 수준 + 그 사이 peak */
function findDoubleBottom(
  candles: Candle[],
  highs: PivotPoint[],
  lows: PivotPoint[],
  tolerance: number
): { support: number; resistance: number; broken: boolean } | null {
  for (let i = 0; i <= lows.length - 2; i++) {
    const v1 = lows[i];
    const v2 = lows[i + 1];
    if (Math.abs(v1.price - v2.price) > tolerance) continue;

    const peak = highs.find((h) => h.index > v1.index && h.index < v2.index);
    if (!peak) continue;

    const support = (v1.price + v2.price) / 2;
    const resistance = peak.price;
    const lastClose = candles[candles.length - 1]?.close ?? 0;
    const broken = lastClose > resistance + tolerance * 0.5;

    return { support, resistance, broken };
  }
  return null;
}

/** 차트 오버레이 변환용 — 비율 좌표 0~1 */
export function zoneTrendlineToOverlays(
  result: ZoneTrendlineResult,
  candles: Candle[],
  min: number,
  max: number,
  colors: { support: string; resistance: string; underneath: string; overhead: string; retest: string; breakout: string }
): Array<{ id: string; kind: string; label: string; x1: number; y1: number; x2: number; y2: number; confidence: number; color: string; category: string; lineDash?: string }> {
  const items: Array<{ id: string; kind: string; label: string; x1: number; y1: number; x2: number; y2: number; confidence: number; color: string; category: string; lineDash?: string }> = [];
  const n = candles.length;
  const denom = Math.max(1, n - 1);
  const range = Math.max(1e-9, max - min);
  const toY = (p: number) => (max - p) / range;

  const supportZones = result.horizontalZones.filter((z) => z.kind === 'support').slice(-2);
  const resistanceZones = result.horizontalZones.filter((z) => z.kind === 'resistance').slice(-2);
  for (const z of [...supportZones, ...resistanceZones]) {
    const label = z.roleReversed ? z.label : z.label;
    items.push({
      id: `zone-${z.kind}-${z.mid.toFixed(0)}`,
      kind: z.kind === 'support' ? 'demandZone' : 'supplyZone',
      label,
      x1: 0.02,
      y1: toY(z.high),
      x2: 0.98,
      y2: toY(z.low),
      confidence: 75,
      color: z.kind === 'support' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
      category: 'structure',
    });
  }

  for (let i = 0; i < result.diagonalLines.length; i++) {
    const tl = result.diagonalLines[i];
    const slope = tl.slope;
    const rightIdx = n - 1;
    const priceAtRight = tl.p1.price + slope * (rightIdx - tl.p1.index);
    const color = tl.kind === 'underneath_support' ? colors.underneath : colors.overhead;
    items.push({
      id: `diag-${tl.kind}-${i}`,
      kind: 'trendLine',
      label: tl.label,
      x1: tl.p1.index / denom,
      y1: toY(tl.p1.price),
      x2: Math.min(0.98, rightIdx / denom),
      y2: toY(priceAtRight),
      confidence: 74,
      color,
      category: 'structure',
      lineDash: '6 5',
    });
  }

  for (const r of result.retests) {
    const px = r.index / denom;
    items.push({
      id: `retest-${r.index}`,
      kind: 'label',
      label: r.label,
      x1: px,
      y1: toY(r.price),
      x2: Math.min(0.98, (r.index + 3) / denom),
      y2: toY(r.price),
      confidence: 78,
      color: colors.retest,
      category: 'structure',
    });
  }

  for (const b of result.breakouts) {
    const px = b.index / denom;
    items.push({
      id: `breakout-${b.index}`,
      kind: 'label',
      label: b.label,
      x1: px,
      y1: toY(b.price),
      x2: Math.min(0.98, (b.index + 3) / denom),
      y2: toY(b.price),
      confidence: 80,
      color: colors.breakout,
      category: 'structure',
    });
  }

  if (result.doubleTop) {
    const dt = result.doubleTop;
    items.push({
      id: 'double-top-resistance',
      kind: 'keyLevel',
      label: '더블탑',
      x1: 0.02,
      y1: toY(dt.resistance),
      x2: 0.98,
      y2: toY(dt.resistance),
      confidence: 76,
      color: colors.resistance,
      category: 'structure',
    });
    items.push({
      id: 'double-top-support',
      kind: 'supportLine',
      label: '목선',
      x1: 0.02,
      y1: toY(dt.support),
      x2: 0.98,
      y2: toY(dt.support),
      confidence: 76,
      color: colors.support,
      category: 'structure',
      lineDash: '6 5',
    });
  }

  if (result.doubleBottom) {
    const db = result.doubleBottom;
    items.push({
      id: 'double-bottom-support',
      kind: 'keyLevel',
      label: '더블바텀',
      x1: 0.02,
      y1: toY(db.support),
      x2: 0.98,
      y2: toY(db.support),
      confidence: 76,
      color: colors.support,
      category: 'structure',
    });
    items.push({
      id: 'double-bottom-resistance',
      kind: 'resistanceLine',
      label: '목선',
      x1: 0.02,
      y1: toY(db.resistance),
      x2: 0.98,
      y2: toY(db.resistance),
      confidence: 76,
      color: colors.resistance,
      category: 'structure',
      lineDash: '6 5',
    });
  }

  return items;
}

/**
 * 메인 엔진 — 분·시간·일·주 각 TF별 자동 분석
 */
export function runZoneTrendlineEngine(candles: Candle[]): ZoneTrendlineResult {
  if (!candles || candles.length < 15) {
    return {
      horizontalZones: [],
      diagonalLines: [],
      retests: [],
      breakouts: [],
      doubleTop: null,
      doubleBottom: null,
    };
  }

  const pivot = detectPivots(candles);
  const tol = atrVal(candles) * ZONE_ATR_TOL;

  const horizontalZones = findHorizontalZones(candles, pivot.highs, pivot.lows, tol);
  const diagonalLines = findDiagonalLines(pivot.highs, pivot.lows);
  const { breakouts, retests, updatedZones } = detectBreakoutsAndRetests(
    candles,
    horizontalZones,
    tol * 0.5
  );
  const doubleTop = findDoubleTop(candles, pivot.highs, pivot.lows, tol);
  const doubleBottom = findDoubleBottom(candles, pivot.highs, pivot.lows, tol);

  return {
    horizontalZones: updatedZones.slice(-4),
    diagonalLines: diagonalLines.slice(-3),
    retests: retests.slice(-2),
    breakouts: breakouts.slice(-2),
    doubleTop,
    doubleBottom,
  };
}
