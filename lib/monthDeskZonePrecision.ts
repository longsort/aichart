/**
 * 마감·안착 HTF(1d·1w·1M) — 타점 존 폭·레그 범위 정밀화 (교육·참고).
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';

export function isMonthDeskHtfTimeframe(tf: string): boolean {
  const t = normalizeChartTimeframe(tf);
  return t === '4h' || t === '1d' || t === '1w' || t === '1M' || t === '1Y';
}

/** HTF에서 스윙·포켓·$$$$ 풀 스캔에 쓸 최대 봉 수 (차트 좌측·하방 구간 포함) */
export function monthDeskZoneLookbackBars(tf: string, defaultLookback: number): number {
  const t = normalizeChartTimeframe(tf);
  const caps: Record<string, number> = {
    '1m': 420,
    '3m': 380,
    '5m': 340,
    '15m': 300,
    '30m': 260,
    '1h': 240,
    '2h': 220,
    '4h': 200,
    '1d': 160,
    '1w': 280,
    '1M': 120,
    '1Y': 48,
  };
  const cap = caps[t];
  if (!cap) return defaultLookback;
  return Math.min(defaultLookback, cap);
}

function isSwingHigh(candles: Candle[], i: number, L: number): boolean {
  const p = candles[i].high;
  for (let k = 1; k <= L; k++) {
    if (candles[i - k].high >= p) return false;
    if (candles[i + k].high > p) return false;
  }
  return true;
}

function isSwingLow(candles: Candle[], i: number, L: number): boolean {
  const p = candles[i].low;
  for (let k = 1; k <= L; k++) {
    if (candles[i - k].low <= p) return false;
    if (candles[i + k].low < p) return false;
  }
  return true;
}

/**
 * 최근 임펄스 레그 — 롱: 마지막 스윙 저점 이후 고점, 숏: 마지막 스윙 고점 이후 저점.
 */
export function findRecentImpulseLeg(
  candles: Candle[],
  L: number,
  start: number,
  end: number,
  bias: 'LONG' | 'SHORT' | 'NEUTRAL'
): { legHi: number; legLo: number; tStart: number } | null {
  const n = candles.length;
  if (end < start + L + 2) return null;
  const iEnd = Math.min(end, n - L - 1);
  const iStart = Math.max(L, start);

  let lastLowIdx = -1;
  let lastHighIdx = -1;
  for (let i = iEnd; i >= iStart; i--) {
    if (lastLowIdx < 0 && isSwingLow(candles, i, L)) lastLowIdx = i;
    if (lastHighIdx < 0 && isSwingHigh(candles, i, L)) lastHighIdx = i;
    if (lastLowIdx >= 0 && lastHighIdx >= 0) break;
  }

  const pickLong = () => {
    if (lastLowIdx < 0) return null;
    let legLo = candles[lastLowIdx].low;
    let legHi = -Infinity;
    for (let i = lastLowIdx; i <= end; i++) legHi = Math.max(legHi, candles[i].high);
    if (!Number.isFinite(legLo) || !Number.isFinite(legHi) || legHi <= legLo) return null;
    return { legHi, legLo, tStart: Number(candles[lastLowIdx].time) };
  };

  const pickShort = () => {
    if (lastHighIdx < 0) return null;
    let legHi = candles[lastHighIdx].high;
    let legLo = Infinity;
    for (let i = lastHighIdx; i <= end; i++) legLo = Math.min(legLo, candles[i].low);
    if (!Number.isFinite(legLo) || !Number.isFinite(legHi) || legHi <= legLo) return null;
    return { legHi, legLo, tStart: Number(candles[lastHighIdx].time) };
  };

  if (bias === 'LONG') return pickLong();
  if (bias === 'SHORT') return pickShort();
  const longLeg = pickLong();
  const shortLeg = pickShort();
  if (!longLeg && !shortLeg) return null;
  if (!longLeg) return shortLeg;
  if (!shortLeg) return longLeg;
  const spanL = longLeg.legHi - longLeg.legLo;
  const spanS = shortLeg.legHi - shortLeg.legLo;
  return spanL <= spanS ? longLeg : shortLeg;
}

/** 존 상·하를 중심 기준 최대 폭으로 클램프 */
export function capZoneVerticalSpan(
  top: number,
  bot: number,
  center: number,
  maxSpan: number
): { top: number; bot: number } {
  if (!Number.isFinite(maxSpan) || maxSpan <= 0) return { top, bot };
  const span = top - bot;
  if (span <= maxSpan) return { top, bot };
  const half = maxSpan / 2;
  let t = center + half;
  let b = center - half;
  if (t <= b) {
    t = center + half;
    b = center - half;
  }
  return { top: t, bot: b };
}

export function htfMaxPocketSpan(params: {
  legHi: number;
  legLo: number;
  atr: number;
  refPrice: number;
  timeframe: string;
}): number {
  const leg = Math.max(params.legHi - params.legLo, 1e-12);
  const t = normalizeChartTimeframe(params.timeframe);
  const legFrac = t === '1w' ? 0.15 : t === '1d' ? 0.13 : t === '1M' ? 0.11 : 0.16;
  const atrMul = t === '1w' ? 1.55 : t === '1d' ? 1.35 : 1.25;
  const pxFrac = t === '1w' ? 0.011 : t === '1d' ? 0.008 : 0.006;
  return Math.max(leg * legFrac, params.atr * atrMul, params.refPrice * pxFrac);
}

/** HTF 롱/숏 OTE(Optimal Trade Entry) 구간 — 50~61.8%보다 좁은 61.8~78.6% 쪽 */
export function htfOtePocketBounds(
  legHi: number,
  legLo: number,
  bias: 'LONG' | 'SHORT' | 'NEUTRAL'
): { pocketTop: number; pocketBot: number } | null {
  const Lg = legHi - legLo;
  if (Lg <= 0) return null;
  if (bias === 'LONG') {
    const pocketTop = legHi - 0.618 * Lg;
    const pocketBot = legHi - 0.786 * Lg;
    return pocketTop > pocketBot ? { pocketTop, pocketBot } : null;
  }
  if (bias === 'SHORT') {
    const pocketBot = legLo + 0.618 * Lg;
    const pocketTop = legLo + 0.786 * Lg;
    return pocketTop > pocketBot ? { pocketTop, pocketBot } : null;
  }
  const pocketBot = legLo + 0.5 * Lg;
  const pocketTop = legLo + 0.618 * Lg;
  return pocketTop > pocketBot ? { pocketTop, pocketBot } : null;
}
