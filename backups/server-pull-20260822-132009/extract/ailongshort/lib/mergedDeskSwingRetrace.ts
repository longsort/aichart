/**
 * 통합·분석 — 스윙 되돌림 맵.
 * 하락 후 어디까지 떨어졌는지 → 반등 되돌림%, 상승 후 어디까지 올랐는지 → 하락 되돌림%.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import { mergedWorkCandles, snapMergedOverlayTimeToCandles } from '@/lib/mergedAnalysisOverlayTimes';

const FIBS = [
  { r: 0.382, label: '38%' },
  { r: 0.5, label: '50%' },
  { r: 0.618, label: '62%' },
] as const;

export type SwingRetraceSide = 'decline_bounce' | 'rally_pullback';

export type SwingRetraceLevel = {
  ratio: number;
  label: string;
  price: number;
  hit: boolean;
};

export type SwingRetraceLeg = {
  side: SwingRetraceSide;
  /** 임펄스 시작가 (하락=고점, 상승=저점) */
  impulseFrom: number;
  /** 임펄스 끝가 (하락=저점, 상승=고점) */
  impulseTo: number;
  impulseFromIdx: number;
  impulseToIdx: number;
  impulseFromTime: number;
  impulseToTime: number;
  /** 임펄스 이동폭 (가격) */
  impulseMove: number;
  /** 임펄스 이동% */
  impulsePct: number;
  /** 되돌림 극값 (반등고점 / 되돌림저점) */
  retraceExtreme: number;
  retraceExtremeIdx: number;
  /** 임펄스 대비 되돌림 진행% (0~100+, 100=전부 회복) */
  retracePctOfImpulse: number;
  /** 현재가 기준 되돌림% */
  liveRetracePct: number;
  currentPrice: number;
  levels: SwingRetraceLevel[];
  phaseKo: string;
  summaryKo: string;
  nextTargetKo: string;
  invalidationKo: string;
};

export type SwingRetracePack = {
  declineBounce: SwingRetraceLeg | null;
  rallyPullback: SwingRetraceLeg | null;
  active: SwingRetraceLeg | null;
  summaryKo: string;
  overlays: OverlayItem[];
};

function atr(candles: Candle[], end: number, period = 14): number {
  const start = Math.max(1, end - period + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!.close;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p));
    n++;
  }
  return n > 0 ? sum / n : Math.abs(candles[end]?.close ?? 1) * 0.01;
}

function snapT(candles: Candle[], t: number): number {
  return Number(snapMergedOverlayTimeToCandles(t, candles));
}

function fmt(p: number): string {
  if (p >= 1000) return p.toFixed(0);
  if (p >= 1) return p.toFixed(1);
  return p.toFixed(3);
}

/** 4h 참조 lookback — 전 TF 동일 */
function lookback(_tf: string, n: number): number {
  return Math.min(n - 4, 55);
}

function buildDeclineBounce(candles: Candle[], start: number, atrVal: number): SwingRetraceLeg | null {
  const n = candles.length;
  let hiIdx = start;
  let hi = -Infinity;
  for (let i = start; i < n - 2; i++) {
    if (candles[i]!.high >= hi) {
      hi = candles[i]!.high;
      hiIdx = i;
    }
  }
  if (!(hi > 0) || hiIdx >= n - 2) return null;

  let loIdx = hiIdx;
  let lo = hi;
  for (let i = hiIdx; i < n; i++) {
    if (candles[i]!.low <= lo) {
      lo = candles[i]!.low;
      loIdx = i;
    }
  }
  const impulseMove = hi - lo;
  if (impulseMove < atrVal * 0.85 || loIdx <= hiIdx) return null;

  let bounceHi = lo;
  let bounceIdx = loIdx;
  for (let i = loIdx; i < n; i++) {
    if (candles[i]!.high >= bounceHi) {
      bounceHi = candles[i]!.high;
      bounceIdx = i;
    }
  }
  const retraceMove = bounceHi - lo;
  const retracePctOfImpulse = impulseMove > 0 ? (retraceMove / impulseMove) * 100 : 0;
  const current = candles[n - 1]!.close;
  const liveRetracePct = impulseMove > 0 ? ((current - lo) / impulseMove) * 100 : 0;
  const impulsePct = (impulseMove / hi) * 100;

  const levels: SwingRetraceLevel[] = FIBS.map((f) => {
    const price = lo + impulseMove * f.r;
    return {
      ratio: f.r,
      label: f.label,
      price,
      hit: bounceHi >= price - atrVal * 0.05,
    };
  });

  let phaseKo = '하락 임펄스·반등 대기';
  if (liveRetracePct >= 95) phaseKo = '되돌림 거의 전량 회복 — 고점 재테스트 감시';
  else if (liveRetracePct >= 60) phaseKo = '깊은 반등 되돌림 진행 중';
  else if (liveRetracePct >= 35) phaseKo = '중간 반등 되돌림 진행 중';
  else if (liveRetracePct > 8) phaseKo = '얕은 반등 시작';
  else phaseKo = '저점 부근 — 반등 확인 대기';

  const next = levels.find((l) => !l.hit) ?? levels[levels.length - 1]!;
  const nextTargetKo = `다음 되돌림 ${next.label} → ${fmt(next.price)}`;
  const summaryKo = `하락 ${fmt(hi)}→${fmt(lo)} (−${impulsePct.toFixed(1)}% · ${fmt(impulseMove)}) · 반등 되돌림 ${retracePctOfImpulse.toFixed(0)}%(현재 ${liveRetracePct.toFixed(0)}%)`;

  return {
    side: 'decline_bounce',
    impulseFrom: hi,
    impulseTo: lo,
    impulseFromIdx: hiIdx,
    impulseToIdx: loIdx,
    impulseFromTime: Number(candles[hiIdx]!.time),
    impulseToTime: Number(candles[loIdx]!.time),
    impulseMove,
    impulsePct,
    retraceExtreme: bounceHi,
    retraceExtremeIdx: bounceIdx,
    retracePctOfImpulse,
    liveRetracePct,
    currentPrice: current,
    levels,
    phaseKo,
    summaryKo,
    nextTargetKo,
    invalidationKo: `무효: 종가 ${fmt(lo)} 아래 재이탈 시 반등 시나리오 약화`,
  };
}

function buildRallyPullback(candles: Candle[], start: number, atrVal: number): SwingRetraceLeg | null {
  const n = candles.length;
  let loIdx = start;
  let lo = Infinity;
  for (let i = start; i < n - 2; i++) {
    if (candles[i]!.low <= lo) {
      lo = candles[i]!.low;
      loIdx = i;
    }
  }
  if (!(lo > 0) || loIdx >= n - 2) return null;

  let hiIdx = loIdx;
  let hi = lo;
  for (let i = loIdx; i < n; i++) {
    if (candles[i]!.high >= hi) {
      hi = candles[i]!.high;
      hiIdx = i;
    }
  }
  const impulseMove = hi - lo;
  if (impulseMove < atrVal * 0.85 || hiIdx <= loIdx) return null;

  let pullLo = hi;
  let pullIdx = hiIdx;
  for (let i = hiIdx; i < n; i++) {
    if (candles[i]!.low <= pullLo) {
      pullLo = candles[i]!.low;
      pullIdx = i;
    }
  }
  const retraceMove = hi - pullLo;
  const retracePctOfImpulse = impulseMove > 0 ? (retraceMove / impulseMove) * 100 : 0;
  const current = candles[n - 1]!.close;
  const liveRetracePct = impulseMove > 0 ? ((hi - current) / impulseMove) * 100 : 0;
  const impulsePct = (impulseMove / lo) * 100;

  const levels: SwingRetraceLevel[] = FIBS.map((f) => {
    const price = hi - impulseMove * f.r;
    return {
      ratio: f.r,
      label: f.label,
      price,
      hit: pullLo <= price + atrVal * 0.05,
    };
  });

  let phaseKo = '상승 임펄스·되돌림 대기';
  if (liveRetracePct >= 95) phaseKo = '깊은 되돌림 — 저점 재테스트 감시';
  else if (liveRetracePct >= 60) phaseKo = '깊은 하락 되돌림 진행 중';
  else if (liveRetracePct >= 35) phaseKo = '중간 하락 되돌림 진행 중';
  else if (liveRetracePct > 8) phaseKo = '얕은 되돌림 시작';
  else phaseKo = '고점 부근 — 되돌림 확인 대기';

  const next = levels.find((l) => !l.hit) ?? levels[levels.length - 1]!;
  const nextTargetKo = `다음 되돌림 ${next.label} → ${fmt(next.price)}`;
  const summaryKo = `상승 ${fmt(lo)}→${fmt(hi)} (+${impulsePct.toFixed(1)}% · ${fmt(impulseMove)}) · 하락 되돌림 ${retracePctOfImpulse.toFixed(0)}%(현재 ${liveRetracePct.toFixed(0)}%)`;

  return {
    side: 'rally_pullback',
    impulseFrom: lo,
    impulseTo: hi,
    impulseFromIdx: loIdx,
    impulseToIdx: hiIdx,
    impulseFromTime: Number(candles[loIdx]!.time),
    impulseToTime: Number(candles[hiIdx]!.time),
    impulseMove,
    impulsePct,
    retraceExtreme: pullLo,
    retraceExtremeIdx: pullIdx,
    retracePctOfImpulse,
    liveRetracePct,
    currentPrice: current,
    levels,
    phaseKo,
    summaryKo,
    nextTargetKo,
    invalidationKo: `무효: 종가 ${fmt(hi)} 위 재돌파 시 되돌림 시나리오 약화`,
  };
}

function legOverlays(candles: Candle[], leg: SwingRetraceLeg): OverlayItem[] {
  const n = candles.length;
  const tStart = snapT(candles, leg.impulseFromTime);
  const tEnd = snapT(candles, Number(candles[n - 1]!.time));
  const tImpulseEnd = snapT(candles, leg.impulseToTime);
  const out: OverlayItem[] = [];
  const isUp = leg.side === 'decline_bounce';
  const stroke = isUp ? 'rgba(34,211,238,0.92)' : 'rgba(251,146,60,0.92)';
  const fill = isUp ? 'rgba(34,211,238,0.10)' : 'rgba(251,146,60,0.10)';
  const tag = isUp ? '하락→반등' : '상승→되돌림';

  out.push({
    id: `merged-retrace-impulse-${leg.side}`,
    kind: 'trendLine',
    label: `${tag} 임펄스`,
    labelTooltip: leg.summaryKo,
    x1: 0,
    x2: 0,
    time1: tStart as UTCTimestamp,
    time2: tImpulseEnd as UTCTimestamp,
    price1: leg.impulseFrom,
    price2: leg.impulseTo,
    color: stroke,
    lineWidth: 2,
    lineStyle: 0,
  });

  // 임펄스 박스
  const boxTop = Math.max(leg.impulseFrom, leg.impulseTo);
  const boxBot = Math.min(leg.impulseFrom, leg.impulseTo);
  out.push({
    id: `merged-retrace-box-${leg.side}`,
    kind: 'zone',
    label: `${tag} ${leg.impulsePct.toFixed(1)}%`,
    labelTooltip: leg.summaryKo,
    x1: 0,
    x2: 0,
    time1: tStart as UTCTimestamp,
    time2: tEnd as UTCTimestamp,
    price1: boxTop,
    price2: boxBot,
    color: fill,
    lineWidth: 1,
  });

  for (const lv of leg.levels) {
    const hitMark = lv.hit ? '✓' : '';
    out.push({
      id: `merged-retrace-fib-${leg.side}-${lv.label}`,
      kind: 'trendLine',
      label: `되돌림${lv.label}${hitMark}`,
      labelTooltip: `${tag} 되돌림 ${lv.label} @ ${fmt(lv.price)} · 진행 ${leg.liveRetracePct.toFixed(0)}%`,
      x1: 0,
      x2: 0,
      time1: tImpulseEnd as UTCTimestamp,
      time2: tEnd as UTCTimestamp,
      price1: lv.price,
      price2: lv.price,
      color: lv.hit ? 'rgba(74,222,128,0.85)' : stroke,
      lineWidth: lv.hit ? 2 : 1,
      lineStyle: lv.hit ? 0 : 2,
    });
  }

  return out;
}

export function buildMergedDeskSwingRetracePack(
  candlesIn: Candle[],
  timeframe: string
): SwingRetracePack {
  const tf = normalizeChartTimeframe(timeframe);
  const candles = mergedWorkCandles(candlesIn, tf);
  const n = candles.length;
  if (n < 20) {
    return {
      declineBounce: null,
      rallyPullback: null,
      active: null,
      summaryKo: '되돌림 맵 — 봉 수 부족',
      overlays: [],
    };
  }

  const start = Math.max(2, n - lookback(tf, n));
  const atrVal = atr(candles, n - 1);
  const declineBounce = buildDeclineBounce(candles, start, atrVal);
  const rallyPullback = buildRallyPullback(candles, start, atrVal);

  // 더 최근·더 진행 중인 쪽을 액티브로
  let active: SwingRetraceLeg | null = null;
  if (declineBounce && rallyPullback) {
    const dScore = declineBounce.impulseToIdx + declineBounce.liveRetracePct * 0.1;
    const rScore = rallyPullback.impulseToIdx + rallyPullback.liveRetracePct * 0.1;
    active = dScore >= rScore ? declineBounce : rallyPullback;
  } else {
    active = declineBounce ?? rallyPullback;
  }

  const overlays: OverlayItem[] = [];
  // 액티브 레그만 그려서 차트 과밀 방지 (반대편은 요약만)
  if (active) overlays.push(...legOverlays(candles, active));

  const summaryKo = active
    ? `${active.phaseKo} · ${active.summaryKo} · ${active.nextTargetKo}`
    : '되돌림 맵 — 임펄스 구간 대기';

  return { declineBounce, rallyPullback, active, summaryKo, overlays };
}

export function summarizeSwingRetraceKo(pack: SwingRetracePack | null | undefined): string {
  if (!pack?.active) return '';
  return pack.summaryKo;
}
