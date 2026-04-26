/**
 * TV 스타일 EMA 리본 **면 채움**: 인접 봉 사이마다 min/max EMA 사다리꼴 (캔들 뒤 under-chart 레이어).
 * Pine 라인과 겹치도록 smcDesk + channelBand 파이프 사용.
 */

import type { Candle, OverlayItem } from '@/types';
import {
  ETERNY_RIBBON_PERIODS,
  emaValuesArray,
  eternyRibbonTrendBullFromCandles,
} from '@/lib/eternyMaRibbonData';

const MAX_SEGS = 420;

function bandMinMaxAt(emas: (number | undefined)[][], i: number): { lo: number; hi: number } | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const row of emas) {
    const v = row[i];
    if (typeof v === 'number' && Number.isFinite(v)) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return null;
  return { lo, hi };
}

/**
 * 캔들당 5개 EMA의 최소·최대 사이를 잇는 channelBand 세그먼트 (사다리꼴).
 */
export function buildEternyRibbonFillOverlays(candles: Candle[]): OverlayItem[] {
  if (candles.length < 60) return [];
  const slice = candles.length > MAX_SEGS + 1 ? candles.slice(-(MAX_SEGS + 1)) : candles;
  const emas = ETERNY_RIBBON_PERIODS.map((p) => emaValuesArray(slice, p));
  const bull = eternyRibbonTrendBullFromCandles(slice);
  const out: OverlayItem[] = [];
  const n = slice.length;
  for (let i = 0; i < n - 1; i++) {
    const a = bandMinMaxAt(emas, i);
    const b = bandMinMaxAt(emas, i + 1);
    if (!a || !b) continue;
    const t1 = Number(slice[i].time);
    const t2 = Number(slice[i + 1].time);
    if (!Number.isFinite(t1) || !Number.isFinite(t2)) continue;
    const segBull = bull[i + 1];
    /** TV 리본 면: 상승 시안·하락 오렌지 (캔들 뒤 은은한 채움) */
    const fill = segBull ? 'rgba(56,189,248,0.14)' : 'rgba(249,115,22,0.14)';
    out.push({
      id: `eterny-ribbon-seg-${i}-${t1}`,
      kind: 'channelBand',
      category: 'smcDesk',
      label: '',
      color: fill,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
      time1: t1,
      time2: t2,
      channelBand: {
        time1: t1,
        time2: t2,
        priceHigh1: a.hi,
        priceHigh2: b.hi,
        priceLow1: a.lo,
        priceLow2: b.lo,
      },
      confidence: 40,
    });
  }
  return out;
}
