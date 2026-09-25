/**
 * 도식·차트 매수/매도 ZONE — 최근 캔들·ATR·HotZone으로 좁힘.
 * 전체 TR·넓은 피보 구간은 쓰지 않음. 확정 진입 아님.
 */
import type { Candle } from '@/types';
import { atrSeries } from '@/lib/indicators';

export type PriceBand = { lo: number; hi: number };

export function lastAtr(candles: Candle[] | undefined, period = 14): number {
  if (!candles || candles.length < 8) return 0;
  const s = atrSeries(candles, Math.min(period, candles.length - 1));
  const v = s[s.length - 1] ?? 0;
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function band(a: number, b: number): PriceBand {
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

function intersect(a: PriceBand, b: PriceBand): PriceBand | null {
  const lo = Math.max(a.lo, b.lo);
  const hi = Math.min(a.hi, b.hi);
  if (!(hi > lo)) return null;
  return { lo, hi };
}

function clampHeight(b: PriceBand, cap: number): PriceBand {
  const h = b.hi - b.lo;
  if (h <= cap) return b;
  const mid = (b.lo + b.hi) / 2;
  return { lo: mid - cap / 2, hi: mid + cap / 2 };
}

/** 최근 봉 기준 국소 공급(매도) / 수요(매수) 얇은 띠. */
export function localCandleBand(
  candles: Candle[],
  last: number,
  side: 'buy' | 'sell',
  atr: number
): PriceBand {
  const slice = candles.slice(-12);
  const cap = Math.max(
    atr > 0 ? atr * 0.85 : Math.abs(last) * 0.004,
    Math.abs(last) * 0.0015
  );
  const maxCap = Math.min(cap, Math.abs(last) * 0.0075);
  if (side === 'sell') {
    const hi = Math.max(...slice.map((c) => c.high), last);
    return band(hi - maxCap, hi);
  }
  const lo = Math.min(...slice.map((c) => c.low), last);
  return band(lo, lo + maxCap);
}

/**
 * 넓은 피보/TR을 국소 캔들·HotZone과 교집합.
 * 교집합 없으면 국소 띠만. 높이는 ATR·0.75% 캡.
 */
export function tightenZoneBand(params: {
  lo?: number;
  hi?: number;
  candles?: Candle[];
  last: number;
  side: 'buy' | 'sell';
  hot?: PriceBand | null;
}): PriceBand | undefined {
  const last = params.last;
  if (!Number.isFinite(last)) return undefined;
  const candles = params.candles ?? [];
  const atr = lastAtr(candles) || Math.abs(last) * 0.004;
  const cap = Math.min(Math.max(atr * 0.95, Math.abs(last) * 0.002), Math.abs(last) * 0.0075);
  const local = candles.length >= 8 ? localCandleBand(candles, last, params.side, atr) : null;

  const cands: PriceBand[] = [];
  if (params.hot && params.hot.hi > params.hot.lo) cands.push(params.hot);
  if (Number.isFinite(params.lo) && Number.isFinite(params.hi) && params.hi! > params.lo!) {
    cands.push({ lo: params.lo!, hi: params.hi! });
  }
  if (local) cands.push(local);

  let z: PriceBand | null = null;
  if (params.hot && local) z = intersect(params.hot, local);
  if (!z && Number.isFinite(params.lo) && Number.isFinite(params.hi) && local) {
    z = intersect({ lo: params.lo!, hi: params.hi! }, local);
  }
  if (!z && params.hot) z = params.hot;
  if (!z && local) z = local;
  if (!z && cands[0]) z = cands[0];
  if (!z) {
    return params.side === 'sell'
      ? band(last, last + cap * 0.35)
      : band(last - cap * 0.35, last);
  }
  return clampHeight(z, cap);
}
