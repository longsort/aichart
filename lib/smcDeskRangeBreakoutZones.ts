/**
 * SMC 데스크 — 최근 N봉(마지막 봉 제외)으로 **횡보 구간 고저**를 잡고,
 * 마지막 봉 종가가 그 밖으로 마감하면 **구간 돌파** 면 + 마커(참고·확정 아님).
 */
import type { Candle, OverlayItem } from '@/types';

const CAT: OverlayItem['category'] = 'smcDesk';

/** formation 길이(마지막 봉은 시험 봉으로 제외) */
const FORMATION_BARS = 36;
const MIN_CANDLES = FORMATION_BARS + 5;

function bodyStrength(c: Candle): number {
  const h = c.high;
  const l = c.low;
  const range = h - l;
  if (range <= 0) return 0;
  return Math.abs(c.close - c.open) / range;
}

export function buildSmcDeskRangeBreakoutZones(params: { candles: Candle[] }): OverlayItem[] {
  const { candles } = params;
  const n = candles.length;
  if (n < MIN_CANDLES) return [];

  /** 마지막 봉(n-1)은 돌파 시험 봉 — formation은 0..n-2 중 최대 FORMATION_BARS개 */
  const iEnd = n - 2;
  const formLen = Math.min(FORMATION_BARS, iEnd + 1);
  const iStart = Math.max(0, iEnd - formLen + 1);

  let rangeHigh = -Infinity;
  let rangeLow = Infinity;
  for (let i = iStart; i <= iEnd; i++) {
    rangeHigh = Math.max(rangeHigh, candles[i].high);
    rangeLow = Math.min(rangeLow, candles[i].low);
  }

  const mid = (rangeHigh + rangeLow) * 0.5;
  const rangePct = mid > 0 ? (rangeHigh - rangeLow) / mid : 0;
  /** 지나치게 얇은 구간은 잡음으로 간주 */
  if (rangePct < 0.00035) return [];

  const last = candles[n - 1];
  const cl = last.close;
  const op = last.open;
  const eps = Math.max(mid * 1.5e-5, 1e-9);

  const brokeUp = cl > rangeHigh + eps;
  const brokeDn = cl < rangeLow - eps;
  if (!brokeUp && !brokeDn) return [];

  const side: 'up' | 'down' = brokeUp ? 'up' : 'down';
  const bullBody = cl >= op;
  const bearBody = cl <= op;
  const bs = bodyStrength(last);
  /** “확정”: 밖으로 마감 + 몸통이 돌파 방향에 무게 */
  const confirmed =
    side === 'up'
      ? bullBody && bs >= 0.26
      : bearBody && bs >= 0.26;

  const tStart = candles[iStart].time as number;
  const tEnd = last.time as number;
  const padY = Math.max((rangeHigh - rangeLow) * 0.08, mid * 0.0002);
  const zTop = rangeHigh + padY;
  const zBot = rangeLow - padY;

  const tip = [
    `〔구간〕 최근 ${formLen}봉(마지막 봉 제외) 고저 ${rangeLow.toFixed(6)} ~ ${rangeHigh.toFixed(6)}.`,
    `〔돌파〕 마지막 봉 종가 ${cl.toFixed(6)} — 구간 ${side === 'up' ? '상단' : '하단'} ${side === 'up' ? '위' : '아래'} 마감.`,
    `〔확정〕 ${confirmed ? '몸통 비중·방향이 돌파 쪽으로 정렬(휴리스틱).' : '이탈은 했으나 몸통 약함·되돌림 가능성 점검.'}`,
    `선행 확정·고정 승률 아님. 상·하락 레이블은 방향 참고일 뿐입니다.`,
  ].join(' ');

  const zoneLabel =
    side === 'up'
      ? confirmed
        ? '구간·돌파↑ 확정'
        : '구간·돌파↑ 시도'
      : confirmed
        ? '구간·돌파↓ 확정'
        : '구간·돌파↓ 시도';

  const pinLabel =
    side === 'up' ? (confirmed ? '↑확정' : '↑시도') : confirmed ? '↓확정' : '↓시도';

  const green = 'rgba(34,197,94,0.14)';
  const red = 'rgba(239,68,68,0.14)';
  const lg = 'rgba(74,222,128,0.82)';
  const lr = 'rgba(248,113,113,0.85)';

  return [
    {
      id: 'smc-desk-range-break-zone',
      kind: 'zone',
      label: zoneLabel,
      x1: 0,
      y1: 0,
      time1: tStart,
      time2: tEnd,
      price1: zTop,
      price2: zBot,
      confidence: confirmed ? 52 : 44,
      color: side === 'up' ? green : red,
      lineLabelColor: side === 'up' ? lg : lr,
      category: CAT,
      zoneSpanOnly: true,
      labelTooltip: tip,
    },
    {
      id: 'smc-desk-range-break-label',
      kind: 'label',
      label: pinLabel,
      x1: 0,
      y1: 0,
      time1: tEnd,
      price1: cl,
      confidence: 50,
      color: side === 'up' ? '#22C55E' : '#F87171',
      lineLabelColor: side === 'up' ? '#DCFCE7' : '#FEE2E2',
      labelBackgroundColor: side === 'up' ? 'rgba(21,128,61,0.9)' : 'rgba(185,28,28,0.88)',
      labelTextColor: side === 'up' ? '#F0FDF4' : '#FEF2F2',
      category: CAT,
      labelTooltip: tip,
    },
  ];
}
