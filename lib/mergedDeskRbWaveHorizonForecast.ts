/**
 * 파랑빨강띠 내부 파동·피보 전망.
 * 엘리엇(충격/조정) + 피보 확장/되돌림 + 레그 기간으로
 * 「큰 변동이 어디까지·어느 기간」갈지 미리 잡아 문닫힘·외곽 테두리에 씀.
 * 마지막 캔들 추종 금지. 확정 승률·수익 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import { detectZigzagPivots, type ZigzagPivot } from '@/lib/candleAnalysisElliottMvp';
import { buildMergedDeskElliottPack, type MergedDeskElliottRead } from '@/lib/mergedDeskElliottWave';
import type { AvwapFibLeg } from '@/lib/vwap/avwapFibConfluence';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import { mergedDeskRbFutureTime2 } from '@/lib/mergedDeskBlueRedChannels';
import { MERGED_DESK_RIGHT_FUTURE_BARS } from '@/lib/mergedDeskSharedChartView';

const FIB_EXT = [1.0, 1.272, 1.618] as const;
const FIB_RET = [0.382, 0.5, 0.618] as const;

export type MergedDeskRbWaveHorizonForecast = {
  /** 구조 문닫힘 봉(파동·피보 전망 — 확정 스윙) */
  iDoor: number;
  tDoor: number;
  /** 활성 연장 — 마지막 실봉(면·존·라벨 우측). 미래 빈축 아님 */
  iLive: number;
  tLive: number;
  /** 마지막봉 직전 시각 — 세로닫힘·존 우측(마지막봉 가림 방지) */
  tLivePrev: number;
  /** 변동 예상 상·하 (채널 tip과 합쳐 외곽) */
  tipUpper: number;
  tipLower: number;
  /** 전망 목표가(큰 변동 쪽) */
  targetHi: number | null;
  targetLo: number | null;
  /** 예상 남은 봉 수(참고) */
  expectBars: number;
  elliott: MergedDeskElliottRead | null;
  sourcesKo: string[];
  summaryKo: string;
  shortKo: string;
  priceLines: AtlasPulsePriceLine[];
  overlays: OverlayItem[];
};

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(a.high - a.low, Math.abs(a.high - b.close), Math.abs(a.low - b.close));
    c += 1;
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
}

function idxOfTime(candles: Candle[], t: number): number {
  const tt = Number(t);
  if (!Number.isFinite(tt)) return -1;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const d = Math.abs(Number(candles[i]!.time) - tt);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function legBars(a: ZigzagPivot, b: ZigzagPivot): number {
  return Math.max(1, Math.abs(b.idx - a.idx));
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function fibExtBeyond(from: number, to: number, ratio: number): number {
  const span = to - from;
  return to + span * (ratio - 1);
}

function fibRet(from: number, to: number, ratio: number): number {
  return to - (to - from) * ratio;
}

function elliottTargets(read: MergedDeskElliottRead | null): {
  hi: number | null;
  lo: number | null;
  barsHint: number;
  ko: string | null;
} {
  if (!read?.levels) return { hi: null, lo: null, barsHint: 0, ko: null };
  const lv = read.levels;
  const bull = read.bias === 'bullish';
  const w1 = lv.p1 != null && lv.p0 != null ? Math.abs(lv.p1 - lv.p0) : 0;
  let target: number | null = null;
  let ko: string | null = null;

  if (read.phase === 'impulse') {
    if (read.wave === '3' || read.wave === '2') {
      if (w1 > 0 && lv.p0 != null) {
        target = bull ? lv.p0 + w1 * 1.618 : lv.p0 - w1 * 1.618;
        ko = '엘리엇3파·1.618확장';
      }
    } else if (read.wave === '5' || read.wave === '4') {
      if (w1 > 0 && lv.p4 != null) {
        target = bull ? lv.p4 + w1 : lv.p4 - w1;
        ko = '엘리엇5파·W1등가';
      } else if (w1 > 0 && lv.p0 != null && lv.p3 != null) {
        const to3 = Math.abs(lv.p3 - lv.p0);
        target = bull ? lv.p0 + to3 : lv.p0 - to3;
        ko = '엘리엇5파·0-3투영';
      }
    } else if (read.wave === '1' && w1 > 0 && lv.p0 != null) {
      target = bull ? lv.p0 + w1 * 1.272 : lv.p0 - w1 * 1.272;
      ko = '엘리엇1파·1.272';
    }
  } else if (read.phase === 'correction') {
    const a = lv.a ?? lv.p5;
    const b = lv.b;
    if (a != null && b != null) {
      const ab = Math.abs(b - a);
      if (read.wave === 'C' || read.wave === 'B') {
        target = bull ? a - ab * 1.0 : a + ab * 1.0;
        const alt = bull ? a - ab * 1.618 : a + ab * 1.618;
        target = bull ? Math.min(target, alt) : Math.max(target, alt);
        ko = '엘리엇C·AB등가~1.618';
      }
    }
  }

  if (target == null || !Number.isFinite(target)) {
    return { hi: null, lo: null, barsHint: 8, ko: null };
  }
  return {
    hi: bull ? target : null,
    lo: bull ? null : target,
    barsHint: 10,
    ko,
  };
}

function fibLegTargets(
  legs: AvwapFibLeg[] | null | undefined,
  close: number
): { hi: number | null; lo: number | null; ko: string | null } {
  if (!legs?.length) return { hi: null, lo: null, ko: null };
  let hi: number | null = null;
  let lo: number | null = null;
  let ko: string | null = null;
  for (const leg of legs.slice(0, 2)) {
    const span = Math.abs(leg.fibHigh - leg.fibLow);
    if (!(span > 0)) continue;
    if (leg.risingLeg) {
      const ext = leg.fibHigh + span * 0.618;
      const hunt = leg.huntAboveTop;
      hi = hi == null ? Math.max(ext, hunt) : Math.max(hi, ext, hunt);
      const ret = fibRet(leg.fibLow, leg.fibHigh, 0.618);
      lo = lo == null ? Math.min(ret, leg.goldenBot) : Math.min(lo, ret, leg.goldenBot);
      ko = '피보GP·확장';
    } else {
      const ext = leg.fibLow - span * 0.618;
      const hunt = leg.huntBelowBot;
      lo = lo == null ? Math.min(ext, hunt) : Math.min(lo, ext, hunt);
      const ret = fibRet(leg.fibHigh, leg.fibLow, 0.618);
      hi = hi == null ? Math.max(ret, leg.goldenTop) : Math.max(hi, ret, leg.goldenTop);
      ko = '피보GP·확장';
    }
  }
  if (hi != null && hi < close) hi = null;
  if (lo != null && lo > close) lo = null;
  return { hi, lo, ko };
}

function zigzagHorizon(
  pivots: ZigzagPivot[],
  candles: Candle[],
  atr: number,
  close: number
): {
  iDoor: number;
  tipHi: number;
  tipLo: number;
  expectBars: number;
  targetHi: number | null;
  targetLo: number | null;
  ko: string[];
} {
  const iLive = candles.length - 1;
  /** 형성 중인 최신 1봉만 제외 — 전전봉까지 잘리는 느낌 방지 */
  const confirm = 1;
  const iCap = Math.max(0, iLive - confirm);
  const src = pivots.filter((p) => p.idx <= iCap);
  const use = src.length >= 2 ? src : pivots.filter((p) => p.idx <= iLive);
  if (use.length < 2) {
    return {
      iDoor: iCap,
      tipHi: close + atr * 1.2,
      tipLo: close - atr * 1.2,
      expectBars: 6,
      targetHi: close + atr * 1.6,
      targetLo: close - atr * 1.6,
      ko: ['ATR변동구간'],
    };
  }

  const a = use[use.length - 2]!;
  const b = use[use.length - 1]!;
  const barsLast = legBars(a, b);
  const recentBars = use.slice(-4).map((p, i, arr) => (i === 0 ? barsLast : legBars(arr[i - 1]!, p)));
  const expectBars = Math.max(4, Math.min(36, Math.round(mean(recentBars.filter(Boolean)) || barsLast)));

  /** 문 = 마지막 확정 스윙(+전망 기간의 일부는 가격선으로만, 면은 스윙에서 닫음) */
  let iDoor = Math.min(b.idx, iCap);
  /** 전망 기간이 스윙 이후 이미 진행된 구간이면 문만 소폭 전진(최신봉 미만) */
  const progressed = Math.max(0, iCap - b.idx);
  if (progressed > 0 && progressed < expectBars) {
    iDoor = Math.min(iCap, b.idx + Math.min(progressed, Math.floor(expectBars * 0.55)));
  }

  const rising = b.price >= a.price;
  const span = Math.abs(b.price - a.price);
  const targets = FIB_EXT.map((r) => fibExtBeyond(a.price, b.price, r));
  const rets = FIB_RET.map((r) => fibRet(a.price, b.price, r));
  let targetHi: number | null = null;
  let targetLo: number | null = null;
  if (rising) {
    targetHi = Math.max(...targets);
    targetLo = Math.min(...rets, a.price);
  } else {
    targetLo = Math.min(...targets);
    targetHi = Math.max(...rets, a.price);
  }

  const tipHi = Math.max(b.price, a.price, targetHi ?? b.price) + atr * 0.15;
  const tipLo = Math.min(b.price, a.price, targetLo ?? b.price) - atr * 0.15;

  return {
    iDoor,
    tipHi,
    tipLo,
    expectBars,
    targetHi,
    targetLo,
    ko: ['지그재그파동', rising ? '상승레그피보' : '하락레그피보', `기간≈${expectBars}봉`],
  };
}

/**
 * 파랑빨강띠용 파동·피보 기간/변동 전망.
 */
export function buildMergedDeskRbWaveHorizonForecast(params: {
  candles: Candle[];
  fibLegs?: AvwapFibLeg[] | null;
  channelTipUpper?: number | null;
  channelTipLower?: number | null;
}): MergedDeskRbWaveHorizonForecast {
  const candles = params.candles ?? [];
  const iLive = Math.max(0, candles.length - 1);
  const empty = (): MergedDeskRbWaveHorizonForecast => ({
    iDoor: iLive,
    tDoor: Number(candles[iLive]?.time) || 0,
    iLive,
    tLive: Number(candles[iLive]?.time) || 0,
    tLivePrev: Number(candles[Math.max(0, iLive - 1)]?.time) || 0,
    tipUpper: Number(params.channelTipUpper) || 0,
    tipLower: Number(params.channelTipLower) || 0,
    targetHi: null,
    targetLo: null,
    expectBars: 0,
    elliott: null,
    sourcesKo: [],
    summaryKo: '파동전망 — 봉 부족',
    shortKo: '전망대기',
    priceLines: [],
    overlays: [],
  });
  if (candles.length < 24) return empty();

  const close = Number(candles[iLive]!.close);
  const atr = atrApprox(candles);
  const pivots = detectZigzagPivots(candles, 3, 3);
  const elliottPack = buildMergedDeskElliottPack(candles);
  const ew = elliottPack.read;
  const zz = zigzagHorizon(pivots, candles, atr, close);
  const ewT = elliottTargets(ew);
  const fibT = fibLegTargets(params.fibLegs, close);

  const sourcesKo = [...zz.ko];
  if (ewT.ko) sourcesKo.push(ewT.ko);
  if (fibT.ko) sourcesKo.push(fibT.ko);
  if (ew?.headlineKo) sourcesKo.push(ew.headlineKo.replace(/^엘리엇\s*/, '엘리엇·'));

  let targetHi = zz.targetHi;
  let targetLo = zz.targetLo;
  if (ewT.hi != null) targetHi = targetHi == null ? ewT.hi : Math.max(targetHi, ewT.hi);
  if (ewT.lo != null) targetLo = targetLo == null ? ewT.lo : Math.min(targetLo, ewT.lo);
  if (fibT.hi != null) targetHi = targetHi == null ? fibT.hi : Math.max(targetHi, fibT.hi);
  if (fibT.lo != null) targetLo = targetLo == null ? fibT.lo : Math.min(targetLo, fibT.lo);

  const chHi = Number(params.channelTipUpper);
  const chLo = Number(params.channelTipLower);
  let tipUpper = zz.tipHi;
  let tipLower = zz.tipLo;
  if (Number.isFinite(chHi) && chHi > 0) tipUpper = Math.max(tipUpper, chHi);
  if (Number.isFinite(chLo) && chLo > 0) tipLower = Math.min(tipLower, chLo);
  if (targetHi != null) tipUpper = Math.max(tipUpper, targetHi);
  if (targetLo != null) tipLower = Math.min(tipLower, targetLo);
  if (!(tipUpper > tipLower)) {
    tipUpper = close + atr * 1.5;
    tipLower = close - atr * 1.5;
  }

  /** 엘리엇 이벤트 시각이 있으면 문 후보에 반영(최신봉 미만) */
  let iDoor = zz.iDoor;
  if (ew?.eventTime) {
    const ie = idxOfTime(candles, ew.eventTime);
    if (ie >= 0) {
      const iCap = Math.max(0, iLive - 3);
      iDoor = Math.max(iDoor, Math.min(ie, iCap));
    }
  }
  iDoor = Math.max(0, Math.min(iDoor, Math.max(0, iLive - 1)));
  const tDoor = Number(candles[iDoor]!.time);
  const tLive = Number(candles[iLive]!.time);
  const tLivePrev = Number(candles[Math.max(0, iLive - 1)]!.time);

  const expectBars = Math.max(zz.expectBars, ewT.barsHint || 0);
  const shortKo = `변동전망·${expectBars}봉`;
  const summaryKo = [
    shortKo,
    '문=파동끝 · 면=마지막봉연장',
    sourcesKo.slice(0, 4).join('·'),
    targetHi != null ? `상${targetHi.toFixed(0)}` : '',
    targetLo != null ? `하${targetLo.toFixed(0)}` : '',
    '참고·승률아님',
  ]
    .filter(Boolean)
    .join(' · ');

  const priceLines: AtlasPulsePriceLine[] = [];
  if (targetHi != null && Number.isFinite(targetHi)) {
    priceLines.push({
      price: targetHi,
      title: '변동상단전망',
      color: 'rgba(248,113,113,0.9)',
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }
  if (targetLo != null && Number.isFinite(targetLo)) {
    priceLines.push({
      price: targetLo,
      title: '변동하단전망',
      color: 'rgba(74,222,128,0.9)',
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }

  const overlays: OverlayItem[] = [];
  /** 구조문·고저존은 buildRbHorizonTipZones에서 통일 생성(마지막봉 겹침 방지) */

  return {
    iDoor,
    tDoor,
    iLive,
    tLive,
    tLivePrev,
    tipUpper,
    tipLower,
    targetHi,
    targetLo,
    expectBars,
    elliott: ew,
    sourcesKo,
    summaryKo,
    shortKo,
    priceLines,
    overlays,
  };
}

/** 채널 geom tip·tEnd에 전망 반영(최신봉으로 열지 않음) */
export function applyRbHorizonToChannelTips(params: {
  tipUpper: number;
  tipLower: number;
  tEnd: number;
  iEndHint?: number;
  forecast: MergedDeskRbWaveHorizonForecast;
}): { tipUpper: number; tipLower: number; tEnd: number; iDoor: number } {
  const f = params.forecast;
  return {
    tipUpper: Math.max(params.tipUpper, f.tipUpper),
    tipLower: Math.min(params.tipLower, f.tipLower),
    tEnd: f.tDoor || params.tEnd,
    iDoor: f.iDoor,
  };
}

/** MoneyEdge pack — 하이브리드
 * - 채널 tip(상·하)은 채널 레일 유지 (전망 목표가 채널을 부풀리지 않음)
 * - 면 우측은 마지막봉 직전(마지막봉과 세로선 겹침 방지)
 * - 전망 고·저는 별도 tip zone·가격선으로만
 */
export function applyRbHorizonForecastToGeomsAndOverlays(params: {
  geoms: Array<{
    primary?: boolean;
    horizon: string;
    tipUpper: number;
    tipLower: number;
    tipMid: number;
    width: number;
    tEnd: number;
    tStart?: number;
    up1: number;
    up2: number;
    lo1: number;
    lo2: number;
    [k: string]: unknown;
  }>;
  overlays: OverlayItem[];
  forecast: MergedDeskRbWaveHorizonForecast;
  preferHorizon?: string | null;
  /** 우측 여백(가격축 앞)까지 면·레일 연장 */
  candles?: Candle[] | null;
}): { geoms: typeof params.geoms; overlays: OverlayItem[] } {
  const f = params.forecast;
  if (!(f.tLive > 0) && !(f.tDoor > 0)) {
    return { geoms: params.geoms, overlays: params.overlays };
  }
  /** 구조문 기준(마지막봉 겹침 금지) */
  const tDoorFace =
    f.iDoor < f.iLive && f.tDoor > 0 && f.tDoor < f.tLive
      ? f.tDoor
      : f.tLivePrev > 0
        ? f.tLivePrev
        : f.tDoor;
  /** 우측 1번(rightOffset +20)까지 마지막 기준 연장 */
  const candles = params.candles;
  const tPad =
    candles && candles.length >= 2
      ? mergedDeskRbFutureTime2(
          candles,
          f.tLive > 0 ? f.tLive : Number(candles[candles.length - 1]!.time),
          Math.max(0, candles.length - 1),
          MERGED_DESK_RIGHT_FUTURE_BARS
        )
      : f.tLive > 0
        ? f.tLive
        : tDoorFace;
  const tVisual = tPad > tDoorFace ? tPad : tDoorFace;
  const geoms = params.geoms.map((g) => {
    const hit =
      g.primary ||
      (params.preferHorizon != null && g.horizon === params.preferHorizon) ||
      params.geoms.length === 1;
    if (!hit) return g;
    /** tip은 채널 원본 유지 — 전망 확장은 zone/가격선만 */
    const tipUpper = Number(g.tipUpper);
    const tipLower = Number(g.tipLower);
    return {
      ...g,
      tipUpper,
      tipLower,
      tipMid: (tipUpper + tipLower) / 2,
      width: tipUpper - tipLower,
      tEnd: tVisual,
      up2: tipUpper,
      lo2: tipLower,
    };
  });

  const overlays = params.overlays.map((o) => {
    const id = String(o.id || '');
    const isRb =
      id.includes('merged-desk-rb') ||
      id.includes('merged-desk-blue-red') ||
      String(o.category || '') === 'chartPrimeTrendChannels';
    if (!isRb) return o;
    const g =
      geoms.find((x) => x.primary) ??
      geoms.find((x) => x.horizon === params.preferHorizon) ??
      geoms[0];
    if (!g) return o;
    if (id === 'merged-desk-rb-horizon-door') return o;
    if (o.kind === 'channelBand' && o.channelBand) {
      return {
        ...o,
        time1: Number(o.time1) || Number(o.channelBand.time1),
        time2: tVisual,
        price1: Math.max(Number(g.up1), Number(g.up2)),
        price2: Math.min(Number(g.lo1), Number(g.lo2)),
        channelBand: {
          ...o.channelBand,
          time2: tVisual,
          priceHigh2: Number(g.up2),
          priceLow2: Number(g.lo2),
        },
        overlayZoneExtraClass: `${String(o.overlayZoneExtraClass || '')} merged-desk-rb-horizon-applied merged-desk-rb-live-extend merged-desk-rb-right-pad`.trim(),
        labelTooltip: [
          String(o.labelTooltip || ''),
          '채널 상·하=레일 고저 · 우측 여백까지 연장',
          '세로닫힘=구조문(마지막봉 겹침 금지)',
          f.summaryKo,
        ]
          .filter(Boolean)
          .join('\n'),
      };
    }
    if (o.kind === 'trendLine' && (id.endsWith('-upper') || id.endsWith('-lower') || id.endsWith('-mid'))) {
      const isUp = id.endsWith('-upper');
      const isLo = id.endsWith('-lower');
      return {
        ...o,
        time2: tVisual,
        price2: isUp ? Number(g.up2) : isLo ? Number(g.lo2) : (Number(g.up2) + Number(g.lo2)) / 2,
        overlayZoneExtraClass: `${String(o.overlayZoneExtraClass || '')} merged-desk-rb-horizon-applied merged-desk-rb-right-pad`.trim(),
      };
    }
    return o;
  });

  return { geoms, overlays };
}

/** 전망 고·저 → 자동 zone + 왜이가격 라벨 (채널 tip과 분리) */
export function buildRbHorizonTipZones(params: {
  forecast: MergedDeskRbWaveHorizonForecast;
  tStart: number;
  channelTipUpper?: number | null;
  channelTipLower?: number | null;
}): OverlayItem[] {
  const f = params.forecast;
  /** 구조문·존 우측: 항상 마지막봉보다 왼쪽 */
  const t2 =
    f.iDoor < f.iLive && f.tDoor > 0 && f.tDoor < f.tLive
      ? f.tDoor
      : f.tLivePrev > 0
        ? f.tLivePrev
        : f.tDoor;
  const t1 = params.tStart > 0 ? params.tStart : t2;
  const out: OverlayItem[] = [];
  const src = f.sourcesKo.slice(0, 3).join('·') || '파동·피보전망';

  const pushTip = (
    side: 'high' | 'low',
    price: number | null,
    why: string
  ) => {
    if (price == null || !Number.isFinite(price) || !(price > 0)) return;
    const pad = Math.max(Math.abs(price) * 0.0012, 40);
    const isHi = side === 'high';
    out.push({
      id: `merged-desk-rb-tip-zone-${side}`,
      kind: isHi ? 'supplyZone' : 'demandZone',
      label: isHi ? `고점존 ${price.toFixed(0)}` : `저점존 ${price.toFixed(0)}`,
      zoneFaceBase: isHi ? '고점존' : '저점존',
      zoneFaceSignal: why.slice(0, 18),
      x1: 0,
      y1: isHi ? 0.15 : 0.85,
      x2: 1,
      y2: isHi ? 0.15 : 0.85,
      time1: t1,
      time2: t2,
      price1: isHi ? price + pad : price + pad * 0.4,
      price2: isHi ? price - pad * 0.4 : price - pad,
      confidence: 86,
      color: isHi ? 'rgba(232,93,93,0.14)' : 'rgba(46,201,183,0.14)',
      category: 'chartPrimeTrendChannels',
      overlayZoneExtraClass: `merged-desk-rb-tip-zone merged-desk-rb-tip-${side} merged-desk-zone-label-on merged-desk-zone-caption-clean`,
      labelTooltip: `${isHi ? '고점' : '저점'} ${price.toFixed(0)}\n왜: ${why}\n출처: ${src}\n참고·승률아님`,
      lineLabelColor: isHi ? '#fecaca' : '#bbf7d0',
      labelBackgroundColor: 'rgba(8,10,14,0.72)',
      labelTextColor: '#f8fafc',
    });
    out.push({
      id: `merged-desk-rb-tip-pin-${side}`,
      kind: 'label',
      label: isHi ? `고 ${price.toFixed(0)}·${why.slice(0, 10)}` : `저 ${price.toFixed(0)}·${why.slice(0, 10)}`,
      x1: 0.92,
      y1: isHi ? 0.12 : 0.88,
      x2: 0.99,
      y2: isHi ? 0.12 : 0.88,
      time1: t2,
      time2: t2,
      price1: price,
      price2: price,
      confidence: 88,
      color: isHi ? '#f87171' : '#4ade80',
      category: 'chartPrimeTrendChannels',
      overlayZoneExtraClass: 'merged-desk-rb-tip-pin',
      labelTooltip: `${isHi ? '고점' : '저점'} ${price.toFixed(0)}\n왜: ${why}\n${src}`,
      lineLabelColor: '#f8fafc',
      labelBackgroundColor: 'rgba(8,10,14,0.72)',
      labelTextColor: '#f8fafc',
      noProject: true,
    });
  };

  const whyHi =
    f.elliott?.bias === 'bearish'
      ? '엘리엇·피보 상단전망'
      : f.targetHi != null
        ? '피보확장·변동상단'
        : '채널상단·고점레일';
  const whyLo =
    f.elliott?.bias === 'bullish'
      ? '엘리엇·피보 하단전망'
      : f.targetLo != null
        ? '피보확장·변동하단'
        : '채널하단·저점레일';

  pushTip('high', f.targetHi ?? (Number(params.channelTipUpper) > 0 ? Number(params.channelTipUpper) : f.tipUpper), whyHi);
  pushTip('low', f.targetLo ?? (Number(params.channelTipLower) > 0 ? Number(params.channelTipLower) : f.tipLower), whyLo);

  /** 구조문 — 마지막봉과 겹치지 않게 */
  const tDoor =
    f.iDoor < f.iLive && f.tDoor > 0 && f.tDoor < f.tLive
      ? f.tDoor
      : f.tLivePrev > 0
        ? f.tLivePrev
        : t2;
  if (tDoor > 0 && tDoor !== f.tLive && f.tipUpper > f.tipLower) {
    out.push({
      id: 'merged-desk-rb-horizon-door',
      kind: 'trendLine',
      label: '구조문',
      zoneFaceBase: '구조문',
      zoneFaceSignal: f.shortKo,
      x1: 0.88,
      y1: 0.2,
      x2: 0.88,
      y2: 0.8,
      time1: tDoor,
      time2: tDoor,
      price1: Number(params.channelTipUpper) > 0 ? Number(params.channelTipUpper) : f.tipUpper,
      price2: Number(params.channelTipLower) > 0 ? Number(params.channelTipLower) : f.tipLower,
      confidence: 80,
      color: 'rgba(250,204,21,0.9)',
      lineStrokeWidth: 3,
      category: 'chartPrimeTrendChannels',
      overlayZoneExtraClass: 'merged-desk-rb-horizon-door merged-desk-rb-gravity-well',
      labelTooltip: `${f.summaryKo}\n마지막봉과 겹침 금지 · 구조문(중력우물)`,
      lineLabelColor: '#fef9c3',
      labelBackgroundColor: 'rgba(66,32,6,0.92)',
      labelTextColor: '#fef9c3',
      noProject: true,
    });
  }

  return out;
}
