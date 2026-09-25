/**
 * 데이터 품질 — BAD면 CONFIRMED/강한 확률 금지.
 */
import type { Candle } from '@/types';
import type { AmzDataQuality } from './types';

export type AmzQualityReport = {
  quality: AmzDataQuality;
  notesKo: string[];
  closedBarCount: number;
};

function isValidOhlc(c: Candle): boolean {
  const o = Number(c.open);
  const h = Number(c.high);
  const l = Number(c.low);
  const cl = Number(c.close);
  const v = Number(c.volume);
  if (![o, h, l, cl].every(Number.isFinite)) return false;
  if (h < l || h < o || h < cl || l > o || l > cl) return false;
  if (v < 0) return false;
  return true;
}

export function assessAmzCandleQuality(candles: Candle[]): AmzQualityReport {
  const notes: string[] = [];
  const n = candles.length;
  if (n < 40) {
    return {
      quality: 'BAD',
      notesKo: ['캔들 표본 부족 (<40)'],
      closedBarCount: Math.max(0, n - 1),
    };
  }

  let invalid = 0;
  let gapHits = 0;
  let dup = 0;
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) {
    const c = candles[i]!;
    if (!isValidOhlc(c)) invalid += 1;
    const t = Number(c.time);
    if (seen.has(t)) dup += 1;
    seen.add(t);
    if (i > 0) {
      const prev = Number(candles[i - 1]!.time);
      const dt = t - prev;
      if (dt <= 0) gapHits += 1;
    }
  }

  const closedBarCount = n - 1; // 형성봉 제외
  if (invalid > 0) notes.push(`OHLC/거래량 이상 ${invalid}봉`);
  if (dup > 0) notes.push(`중복 타임스탬프 ${dup}`);
  if (gapHits > Math.max(2, Math.floor(n * 0.02))) notes.push('타임스탬프 역행/간격 이상');

  if (invalid > n * 0.05 || closedBarCount < 30) {
    return { quality: 'BAD', notesKo: notes.length ? notes : ['데이터 품질 BAD'], closedBarCount };
  }
  if (notes.length > 0 || closedBarCount < 80) {
    if (closedBarCount < 80) notes.push('표본 제한 — LOW CONFIDENCE');
    return { quality: 'DEGRADED', notesKo: notes, closedBarCount };
  }
  return { quality: 'GOOD', notesKo: ['캔들 품질 양호'], closedBarCount };
}
