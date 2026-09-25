/**
 * TV형 정밀 OB — structureMarksFu(BOS/CHOCH/MSB) 돌파 **직전 마지막 반대색 봉**.
 * 캡처의 상승(녹)/하락(적) OB와 동일 계열. 확정 매매·승률 아님.
 */
import type { Candle } from '@/types';
import { isObBrokenByClose } from '@/lib/smcStructureOrderBlocks';

export type TvStructureMark = {
  index: number;
  price: number;
  tag: 'BOS' | 'CHOCH' | 'MSB';
  bias: 'bullish' | 'bearish';
};

export type TvStructureOb = {
  bias: 'bullish' | 'bearish';
  /** OB 형성 봉 */
  index: number;
  low: number;
  high: number;
  mid: number;
  /** 유발한 구조 마크 봉 */
  markIndex: number;
  markTag: 'BOS' | 'CHOCH' | 'MSB';
  markPrice: number;
  broken: boolean;
  /** 형성 이후 한 번이라도 터치 */
  mitigated: boolean;
};

function lastOppositeObCandle(
  candles: Candle[],
  markIndex: number,
  bias: 'bullish' | 'bearish',
  lookback = 8
): { index: number; low: number; high: number } | null {
  const start = Math.max(1, markIndex - lookback);
  const end = markIndex - 1;
  if (end < start) return null;
  if (bias === 'bullish') {
    for (let i = end; i >= start; i--) {
      const c = candles[i]!;
      if (c.close < c.open) {
        return {
          index: i,
          low: Math.min(c.open, c.close),
          high: c.high,
        };
      }
    }
  } else {
    for (let i = end; i >= start; i--) {
      const c = candles[i]!;
      if (c.close > c.open) {
        return {
          index: i,
          low: c.low,
          high: Math.max(c.open, c.close),
        };
      }
    }
  }
  return null;
}

function touchedAfter(ob: { index: number; low: number; high: number }, candles: Candle[], untilIdx: number): boolean {
  for (let j = ob.index + 1; j <= untilIdx && j < candles.length; j++) {
    const c = candles[j]!;
    if (c.low <= ob.high && c.high >= ob.low) return true;
  }
  return false;
}

/** 단일 구조 마크 → OB (히스토리 스캔용) */
export function buildObForMark(candles: Candle[], mk: TvStructureMark): TvStructureOb | null {
  const raw = lastOppositeObCandle(candles, mk.index, mk.bias, 8);
  if (!raw) return null;
  const broken = isObBrokenByClose(
    { index: raw.index, low: raw.low, high: raw.high, bias: mk.bias },
    candles
  );
  return {
    bias: mk.bias,
    index: raw.index,
    low: raw.low,
    high: raw.high,
    mid: (raw.low + raw.high) / 2,
    markIndex: mk.index,
    markTag: mk.tag,
    markPrice: mk.price,
    broken,
    mitigated: touchedAfter(raw, candles, candles.length - 1),
  };
}

/**
 * CHOCH/MSB 우선, BOS는 최근 소수만.
 * 동일 방향 중복 OB는 최신 마크만 유지.
 */
export function buildTvStructureObsFromMarks(
  candles: Candle[],
  marks: TvStructureMark[],
  opts?: { maxObs?: number; includeBos?: boolean }
): TvStructureOb[] {
  const maxObs = Math.max(2, Math.min(12, opts?.maxObs ?? 6));
  const includeBos = opts?.includeBos === true;
  const n = candles.length;
  if (n < 12 || !marks.length) return [];

  const ranked = [...marks]
    .filter((m) => includeBos || m.tag === 'CHOCH' || m.tag === 'MSB')
    .sort((a, b) => {
      const rank = (t: string) => (t === 'CHOCH' ? 3 : t === 'MSB' ? 2 : 1);
      const d = rank(b.tag) - rank(a.tag);
      return d !== 0 ? d : b.index - a.index;
    });

  const out: TvStructureOb[] = [];
  const seenDir = new Set<string>();

  for (const mk of ranked) {
    if (out.length >= maxObs) break;
    const raw = lastOppositeObCandle(candles, mk.index, mk.bias, 8);
    if (!raw) continue;
    const dirKey = `${mk.bias}:${raw.index}`;
    if (seenDir.has(dirKey)) continue;
    seenDir.add(dirKey);

    const broken = isObBrokenByClose(
      { index: raw.index, low: raw.low, high: raw.high, bias: mk.bias },
      candles
    );
    const mitigated = touchedAfter(raw, candles, n - 1);
    out.push({
      bias: mk.bias,
      index: raw.index,
      low: raw.low,
      high: raw.high,
      mid: (raw.low + raw.high) / 2,
      markIndex: mk.index,
      markTag: mk.tag,
      markPrice: mk.price,
      broken,
      mitigated,
    });
  }

  return out.sort((a, b) => a.index - b.index);
}

/** 봉 i가 OB를 터치하고 종가로 아직 깨지지 않음 */
export function candleTouchesActiveOb(
  c: Candle,
  ob: TvStructureOb,
  side: 'LONG' | 'SHORT'
): boolean {
  if (ob.broken) return false;
  if (c.low > ob.high || c.high < ob.low) return false;
  if (side === 'LONG') {
    if (ob.bias !== 'bullish') return false;
    return c.close >= ob.low;
  }
  if (ob.bias !== 'bearish') return false;
  return c.close <= ob.high;
}

/** 마크에 대응하는 OB (같은 markIndex) */
export function obForMark(obs: TvStructureOb[], markIndex: number): TvStructureOb | null {
  return obs.find((o) => o.markIndex === markIndex && !o.broken) ?? null;
}

/** 가격 아래 최근 상승 OB / 위 최근 하락 OB */
export function nearestActiveObs(
  obs: TvStructureOb[],
  price: number
): { demand: TvStructureOb | null; supply: TvStructureOb | null } {
  const demand = [...obs]
    .filter((o) => o.bias === 'bullish' && !o.broken && o.high <= price * 1.01)
    .sort((a, b) => b.high - a.high)[0] ?? null;
  const supply = [...obs]
    .filter((o) => o.bias === 'bearish' && !o.broken && o.low >= price * 0.99)
    .sort((a, b) => a.low - b.low)[0] ?? null;
  return { demand, supply };
}
