import type { Candle, OverlayItem } from '@/types';
import type { Pre3SparkleSignal } from '@/lib/pre3PatternMemory';
import {
  computePre3SimilarityAtBigIndex,
  pickBestObOverlappingCandle,
  pre3SimilarityMeetsThreshold,
  resolvePre3MemoryForCandles,
} from '@/lib/pre3PatternMemory';

function zoneLoHi(o: OverlayItem): { lo: number; hi: number } | null {
  const p1 = o.price1 ?? o.y1;
  const p2 = o.price2 ?? o.y2;
  if (typeof p1 !== 'number' || typeof p2 !== 'number' || !Number.isFinite(p1) || !Number.isFinite(p2)) return null;
  return { lo: Math.min(p1, p2), hi: Math.max(p1, p2) };
}

/** 예상 반대로 종가가 존을 이탈하면 무효 */
function pre3ZoneInvalidatedByClose(last: Candle, zh: { lo: number; hi: number }, direction: 'LONG' | 'SHORT', epsRatio = 0.00085): boolean {
  const ref = Math.max(1e-9, Math.abs(Number(last.close)));
  const eps = ref * epsRatio;
  if (direction === 'LONG') return Number(last.close) < zh.lo - eps;
  return Number(last.close) > zh.hi + eps;
}

/**
 * Pre3 확정(matched)·연속 장대 유사도·OB 터치·가격 무효 아님:
 * 직전 장대(n-2)와 현재 장대(n-1) 각각 유사도≥threshold, 마지막 봉 OB 터치,
 * 터치 OB 가격대로 가로 띠 + 라벨 (시간축: 직전 2캔~신호봉).
 */
export function buildPre3MatchZoneOverlay(params: {
  pre3: Pre3SparkleSignal;
  candles: Candle[];
  visible: Candle[];
  overlays: OverlayItem[];
  min: number;
  max: number;
  toRatio: (price: number, lo: number, hi: number) => number;
  symbol: string;
  timeframe: string;
  threshold: number;
}): OverlayItem | null {
  const { pre3, candles, visible, overlays, min, max, toRatio, symbol, timeframe, threshold } = params;
  if (!pre3?.matched || (pre3.direction !== 'LONG' && pre3.direction !== 'SHORT')) return null;
  const n = candles.length;
  if (n < 3 || visible.length < 2) return null;

  const memory = resolvePre3MemoryForCandles(symbol, timeframe, candles);
  if (!memory?.rows.length) return null;

  const simPrev = computePre3SimilarityAtBigIndex(candles, n - 2, memory, true, overlays);
  const simLast = computePre3SimilarityAtBigIndex(candles, n - 1, memory, true, overlays);
  if (!pre3SimilarityMeetsThreshold(simPrev, threshold) || !pre3SimilarityMeetsThreshold(simLast, threshold))
    return null;

  const last = candles[n - 1];
  const ob = pickBestObOverlappingCandle(last, overlays);
  if (!ob) return null;
  const zh = zoneLoHi(ob);
  if (!zh) return null;

  if (pre3ZoneInvalidatedByClose(last, zh, pre3.direction)) return null;

  const tSignal = last.time as number;
  const tSparkleStart = candles[n - 3].time as number;
  const iA = visible.findIndex((c) => c.time === tSparkleStart);
  const iB = visible.findIndex((c) => c.time === tSignal);
  if (iA < 0 || iB < 0) return null;
  const lastNorm = Math.max(1, visible.length - 1);
  const x1 = Math.max(0, Math.min(iA, iB) / lastNorm);
  const x2 = Math.min(0.985, Math.max(iA, iB) / lastNorm);

  const pct = Math.round(pre3.similarity * 100);
  const dirKo = pre3.direction === 'LONG' ? '롱' : '숏';
  const label = `Pre3·OB 일치 ${pct}% ${dirKo}`;

  const isLong = pre3.direction === 'LONG';
  return {
    id: 'pre3-match-zone',
    kind: 'reactionZone',
    label,
    x1,
    y1: toRatio(zh.hi, min, max),
    x2,
    y2: toRatio(zh.lo, min, max),
    time1: Math.min(tSparkleStart, tSignal),
    time2: Math.max(tSparkleStart, tSignal),
    price1: zh.hi,
    price2: zh.lo,
    confidence: Math.min(99, Math.max(55, pct)),
    color: isLong ? 'rgba(34,197,94,0.26)' : 'rgba(239,68,68,0.26)',
    lineLabelColor: isLong ? '#86EFAC' : '#FCA5A5',
    labelBackgroundColor: isLong ? 'rgba(21,128,61,0.92)' : 'rgba(153,27,27,0.92)',
    labelTextColor: '#f8fafc',
    category: 'reactionZone',
  };
}
