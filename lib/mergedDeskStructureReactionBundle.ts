/**
 * 통합·분석 — 구조반응 번들.
 * 파랑빨강띠 · 학파도식(저항/반등) · 실루엣 스탬프 · 요이만 터치 를
 * 「분석 캔들 앵커」로 묶는다. 확정 수익·승률 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { MergedDeskPatternStamp } from '@/lib/mergedDeskPatternSilhouette';

export type StructureReactionTouch = {
  kind: 'bounce' | 'resist' | 'dump' | 'thismuch';
  time: number;
  price: number;
  labelKo: string;
};

/** 가격을 최근 터치한 봉(없으면 최근 근접 봉) */
export function findLastPriceTouchBar(
  candles: Candle[],
  price: number,
  lookback = 80
): { index: number; time: number } | null {
  const n = candles.length;
  if (n < 2 || !(price > 0)) return null;
  const from = Math.max(0, n - Math.max(8, lookback));
  for (let i = n - 1; i >= from; i--) {
    const c = candles[i]!;
    const h = Number(c.high);
    const l = Number(c.low);
    if (Number.isFinite(h) && Number.isFinite(l) && l <= price && price <= h) {
      return { index: i, time: Number(c.time) };
    }
  }
  let bestI = n - 1;
  let bestD = Infinity;
  for (let i = from; i < n; i++) {
    const c = candles[i]!;
    const h = Number(c.high);
    const l = Number(c.low);
    const d = Math.min(Math.abs(h - price), Math.abs(l - price), Math.abs(Number(c.close) - price));
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return { index: bestI, time: Number(candles[bestI]!.time) };
}

/** 터치봉 ± hugBars 구간 (라벨·존이 분석 캔들에 붙도록) */
export function touchHugTimes(
  candles: Candle[],
  touchIndex: number,
  hugBars = 1
): { time1: number; time2: number } {
  const n = candles.length;
  const i0 = Math.max(0, touchIndex - hugBars);
  const i1 = Math.min(n - 1, touchIndex + hugBars);
  return {
    time1: Number(candles[i0]!.time),
    time2: Number(candles[i1]!.time),
  };
}

/** 도식·요이만 오버레이에서 터치 포인트 추출 → 실루엣 이모지 연동 */
export function extractStructureReactionTouches(
  overlays: OverlayItem[] | null | undefined
): StructureReactionTouch[] {
  const out: StructureReactionTouch[] = [];
  for (const o of overlays ?? []) {
    const id = String(o?.id || '');
    const extra = String(o?.overlayZoneExtraClass || '');
    const t1 = Number(o?.time1);
    const p1 = Number(o?.price1);
    const p2 = Number(o?.price2);
    const mid =
      Number.isFinite(p1) && Number.isFinite(p2) ? (p1 + p2) / 2 : Number.isFinite(p1) ? p1 : NaN;
    if (!(t1 > 0) || !(mid > 0)) continue;
    if (id.includes('schematic-bounce') || extra.includes('schematic-bounce')) {
      out.push({ kind: 'bounce', time: t1, price: mid, labelKo: '도식반등' });
    } else if (id.includes('schematic-resist') || extra.includes('schematic-resist')) {
      out.push({ kind: 'resist', time: t1, price: mid, labelKo: '도식저항' });
    } else if (id.includes('schematic-dump') || extra.includes('schematic-dump')) {
      out.push({ kind: 'dump', time: t1, price: mid, labelKo: '폭락구간' });
    } else if (id.includes('thismuch-zone-touch') || extra.includes('thismuch-touch')) {
      out.push({ kind: 'thismuch', time: t1, price: mid, labelKo: '요이만터치' });
    }
  }
  return out;
}

/** 구조반응 터치를 실루엣 스탬프(이모지)로 변환 */
export function structureReactionTouchesToStamps(
  touches: StructureReactionTouch[]
): MergedDeskPatternStamp[] {
  return touches.map((t) => ({
    time: t.time,
    price: t.price,
    kind:
      t.kind === 'bounce' || t.kind === 'thismuch'
        ? ('bull' as const)
        : t.kind === 'resist' || t.kind === 'dump'
          ? ('bear' as const)
          : ('bull' as const),
  }));
}
