/**
 * 마감·안착 — 구조·반등 맞춤: 손절 짧게(진입 근처), 반등·TP 넓게(레그·저항).
 * 교육·참고용(확정·수익 보장 아님).
 */
import { normalizeChartTimeframe } from '@/lib/constants';
import { isMonthDeskHtfTimeframe } from '@/lib/monthDeskZonePrecision';

/** 롱: 진입 아래 후보 중 가장 높은 가격 = 손절 짧게 */
export function tightenMonthDeskStopLossLong(params: {
  entry: number;
  zoneBot: number;
  zoneTop: number;
  atr: number;
  legLo: number;
  timeframe?: string;
  looseCandidates: number[];
}): number {
  const { entry, zoneBot, zoneTop, atr, legLo, looseCandidates } = params;
  if (!Number.isFinite(entry) || entry <= 0) return entry;

  const chartTf = normalizeChartTimeframe(params.timeframe ?? '4h');
  const htf = isMonthDeskHtfTimeframe(chartTf);
  const zoneSpan = Math.max(zoneTop - zoneBot, atr * 0.25);

  /** 최대 리스크 폭 — HTF도 진입 근처 무효 */
  const maxRisk = Math.min(
    atr * (htf ? 0.62 : 0.52),
    zoneSpan * 0.38,
    entry * (htf ? 0.009 : 0.007)
  );

  const floorSl = entry - maxRisk;
  const structural: number[] = [
    zoneBot - atr * 0.04,
    legLo + atr * 0.03,
    ...looseCandidates.filter((p) => Number.isFinite(p) && p < entry - atr * 0.04),
  ];

  let sl = floorSl;
  for (const p of structural) {
    if (p < entry && p > sl) sl = p;
  }
  sl = Math.min(sl, entry - atr * 0.06);
  sl = Math.max(sl, entry - maxRisk * 1.05);
  return sl;
}

/** 숏: 진입 위 후보 중 가장 낮은 가격 = 손절 짧게 */
export function tightenMonthDeskStopLossShort(params: {
  entry: number;
  zoneBot: number;
  zoneTop: number;
  atr: number;
  legHi: number;
  timeframe?: string;
  looseCandidates: number[];
}): number {
  const { entry, zoneBot, zoneTop, atr, legHi, looseCandidates } = params;
  if (!Number.isFinite(entry) || entry <= 0) return entry;

  const chartTf = normalizeChartTimeframe(params.timeframe ?? '4h');
  const htf = isMonthDeskHtfTimeframe(chartTf);
  const zoneSpan = Math.max(zoneTop - zoneBot, atr * 0.25);

  const maxRisk = Math.min(
    atr * (htf ? 0.62 : 0.52),
    zoneSpan * 0.38,
    entry * (htf ? 0.009 : 0.007)
  );

  const ceilSl = entry + maxRisk;
  const structural: number[] = [
    zoneTop + atr * 0.04,
    legHi - atr * 0.03,
    ...looseCandidates.filter((p) => Number.isFinite(p) && p > entry + atr * 0.04),
  ];

  let sl = ceilSl;
  for (const p of structural) {
    if (p > entry && p < sl) sl = p;
  }
  sl = Math.max(sl, entry + atr * 0.06);
  sl = Math.min(sl, entry + maxRisk * 1.05);
  return sl;
}

/** 반등·TP: 구조 상단(레그·저항) 유지 + 최소 R 배수 확보 */
export function widenMonthDeskReboundTargetsLong(params: {
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  legHi: number;
  swingHi?: number;
  atr: number;
}): { tp1: number; tp2: number; tp3: number } {
  const { entry, stopLoss, legHi, swingHi, atr } = params;
  let { tp1, tp2, tp3 } = params;
  const risk = Math.max(entry - stopLoss, atr * 0.22, entry * 1e-6);
  const structTop = Math.max(legHi, swingHi ?? 0, entry + atr * 1.8);
  const min1 = entry + risk * 2.2;
  const min2 = entry + risk * 3.6;
  const min3 = entry + risk * 5.2;
  tp1 = Math.max(tp1, min1, structTop * 0.92);
  tp2 = Math.max(tp2, min2, tp1 + risk * 0.85);
  tp3 = Math.max(tp3, min3, tp2 + risk * 0.75, structTop * 1.04);
  if (tp2 <= tp1) tp2 = tp1 + risk * 0.9;
  if (tp3 <= tp2) tp3 = tp2 + risk * 0.85;
  return { tp1, tp2, tp3 };
}

export function widenMonthDeskReboundTargetsShort(params: {
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  legLo: number;
  swingLo?: number;
  atr: number;
}): { tp1: number; tp2: number; tp3: number } {
  const { entry, stopLoss, legLo, swingLo, atr } = params;
  let { tp1, tp2, tp3 } = params;
  const risk = Math.max(stopLoss - entry, atr * 0.22, entry * 1e-6);
  const structBot = Math.min(legLo, swingLo ?? entry, entry - atr * 1.8);
  const min1 = entry - risk * 2.2;
  const min2 = entry - risk * 3.6;
  const min3 = entry - risk * 5.2;
  tp1 = Math.min(tp1, min1, structBot * 1.08);
  tp2 = Math.min(tp2, min2, tp1 - risk * 0.85);
  tp3 = Math.min(tp3, min3, tp2 - risk * 0.75, structBot * 0.96);
  if (tp2 >= tp1) tp2 = tp1 - risk * 0.9;
  if (tp3 >= tp2) tp3 = tp2 - risk * 0.85;
  return { tp1, tp2, tp3 };
}

export function monthDeskEntryRailLabelKo(
  entry: number,
  stopLoss: number,
  tp1: number,
  direction: 'LONG' | 'SHORT'
): string {
  const risk =
    direction === 'LONG'
      ? Math.max(entry - stopLoss, entry * 1e-6)
      : Math.max(stopLoss - entry, entry * 1e-6);
  const reward =
    direction === 'LONG' ? Math.max(tp1 - entry, 0) : Math.max(entry - tp1, 0);
  const rr = risk > 0 ? reward / risk : 0;
  const rrKo = rr >= 0.1 ? `R${rr.toFixed(1)}` : '';
  return rrKo ? `진입·${rrKo}` : '진입';
}
