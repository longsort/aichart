/**
 * $$$$ 롱/숏 존 — 지지·저항 유지 vs 돌파·이탈 가능성 (과거 터치·최근 압력, 조건부 참고).
 */
import type { Candle } from '@/types';
import { computeSrHoldPct } from '@/lib/assets353SmcStatIntel';
import { atrRecent } from '@/lib/smcDeskOverlay';

export type MoneyZoneBreakHold = {
  holdPct: number;
  breakPct: number;
  /** 지지가능 / 저항가능 / … */
  holdKo: string;
  /** 돌파가능 / 이탈가능 / … */
  breakKo: string;
  /** 차트 짧은 태그: 지지+ · 돌파? · 혼조 */
  captionKo: string;
  detailKo: string;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/**
 * LONG(수요)=지지 유지 vs 하방 이탈
 * SHORT(공급)=저항 유지 vs 상방 돌파
 */
export function computeMoneyZoneBreakHold(
  candles: Candle[],
  side: 'LONG' | 'SHORT',
  top: number,
  bot: number
): MoneyZoneBreakHold | null {
  const n = candles.length;
  if (n < 16 || !(top > bot)) return null;
  const last = candles[n - 1]!;
  const close = last.close;
  const mid = (top + bot) / 2;
  const height = top - bot;
  const atr = atrRecent(candles, 14) || close * 0.004;
  const isLong = side === 'LONG';

  const holdPct = computeSrHoldPct(candles, mid, isLong ? 'support' : 'resistance');

  let breakPct = height <= atr * 1.4 ? 54 : 40;
  let edgeHits = 0;
  let oppVol = 0;
  let holdVol = 0;
  const from = Math.max(0, n - 28);
  for (let i = from; i < n; i++) {
    const c = candles[i]!;
    if (isLong) {
      if (c.low <= bot + atr * 0.2) edgeHits++;
      if (c.close < c.open) oppVol += c.volume || 1;
      else holdVol += c.volume || 1;
    } else {
      if (c.high >= top - atr * 0.2) edgeHits++;
      if (c.close >= c.open) oppVol += c.volume || 1;
      else holdVol += c.volume || 1;
    }
  }
  if (edgeHits >= 3) breakPct += 12;
  else if (edgeHits >= 2) breakPct += 6;

  const volSum = oppVol + holdVol || 1;
  breakPct += (oppVol / volSum) * 22;

  if (isLong) {
    if (close < bot) breakPct += 18;
    else if (close <= bot + height * 0.25) breakPct += 8;
    else if (close >= mid) breakPct -= 6;
  } else {
    if (close > top) breakPct += 18;
    else if (close >= top - height * 0.25) breakPct += 8;
    else if (close <= mid) breakPct -= 6;
  }

  const hold = clamp(holdPct, 32, 92);
  const brk = clamp(breakPct, 28, 90);
  const edge = hold - brk;

  let holdKo: string;
  let breakKo: string;
  let captionKo: string;

  if (isLong) {
    holdKo = hold >= 58 ? '지지가능' : hold >= 48 ? '지지불확실' : '지지약함';
    breakKo = brk >= 58 ? '이탈가능' : brk >= 48 ? '이탈불확실' : '이탈약함';
    if (edge >= 10) captionKo = '지지+';
    else if (edge <= -10) captionKo = '이탈+';
    else captionKo = '혼조';
  } else {
    holdKo = hold >= 58 ? '저항가능' : hold >= 48 ? '저항불확실' : '저항약함';
    breakKo = brk >= 58 ? '돌파가능' : brk >= 48 ? '돌파불확실' : '돌파약함';
    if (edge >= 10) captionKo = '저항+';
    else if (edge <= -10) captionKo = '돌파+';
    else captionKo = '혼조';
  }

  const detailKo = [
    `${holdKo} ${hold}%`,
    `${breakKo} ${brk}%`,
    edgeHits >= 2 ? `가장자리 터치 ${edgeHits}` : null,
    '조건부 참고 · 확정 아님',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    holdPct: hold,
    breakPct: brk,
    holdKo,
    breakKo,
    captionKo,
    detailKo,
  };
}
