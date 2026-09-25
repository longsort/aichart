/**
 * 파란·빨간 띠 — 핵심 돌파/안착 세트.
 * 돌파해야 할 자리 · 돌파 후 안착 자리 · 캔들 색 · 봉 위아래 이모티콘.
 * 확정 수익·승률 보장 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { AtlasPulseMarker, AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { MonthDeskSettleCandleCell } from '@/lib/monthDeskSettleCandlePaint';
import {
  buildMergedDeskChannelMoneyEdgePack,
  type MergedDeskChannelEdgeRead,
  type MergedDeskChannelMoneyPlan,
  type MergedDeskChannelPrimaryDecision,
} from '@/lib/mergedDeskChannelMoneyEdge';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import { mergedDeskRbFutureTime2 } from '@/lib/mergedDeskBlueRedChannels';
import { MERGED_DESK_RB_FUTURE_BARS } from '@/lib/mergedDeskSharedChartView';
import { loadSettings } from '@/lib/settings';
import { isMergedDeskSharedFeatureTf } from '@/lib/mergedDeskSharedTfFeatures';

type SettlePhase = MonthDeskSettleCandleCell['phase'];

/** 핵심안착 가격 고정 — 안착 유지, 밀리면 삭제 */
type CoreSettleLock = {
  side: 'above' | 'below';
  lo: number;
  hi: number;
  level: number;
};
const coreSettleLocks = new Map<string, CoreSettleLock>();

export type MergedDeskRbCoreBreakSet = {
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
  markers: AtlasPulseMarker[];
  settlePaint: Map<number, MonthDeskSettleCandleCell>;
  summaryKo: string;
};

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) {
    const c = Number(candles[n - 1]?.close) || 0;
    return c > 0 ? c * 0.008 : 0;
  }
  const start = Math.max(1, n - 14);
  let sum = 0;
  let cnt = 0;
  for (let i = start; i < n; i++) {
    const h = Number(candles[i]!.high);
    const l = Number(candles[i]!.low);
    const pc = Number(candles[i - 1]!.close);
    if (![h, l, pc].every(Number.isFinite)) continue;
    sum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    cnt += 1;
  }
  if (cnt <= 0) {
    const c = Number(candles[n - 1]?.close) || 0;
    return c > 0 ? c * 0.008 : 0;
  }
  return sum / cnt;
}

function fmt(p: number): string {
  if (!(p > 0) || !Number.isFinite(p)) return '—';
  if (p >= 1000) return p.toFixed(0);
  if (p >= 1) return p.toFixed(1);
  return p.toFixed(3);
}

function clampBand(lo: number, hi: number, mid: number, minH: number, maxH: number): { lo: number; hi: number } {
  let a = Math.min(lo, hi);
  let b = Math.max(lo, hi);
  if (!(b > a)) {
    const h = Math.max(minH, 1e-8);
    return { lo: mid - h / 2, hi: mid + h / 2 };
  }
  if (b - a > maxH) {
    const up = Math.min(b - mid, maxH * 0.62);
    const dn = Math.min(mid - a, maxH - up);
    a = mid - Math.max(dn, minH * 0.35);
    b = mid + Math.max(up, minH * 0.35);
    if (b - a > maxH) {
      a = mid - maxH / 2;
      b = mid + maxH / 2;
    }
  }
  if (b - a < minH) {
    a = mid - minH / 2;
    b = mid + minH / 2;
  }
  return { lo: a, hi: b };
}

function firstRailTouchIdx(
  candles: Candle[],
  level: number,
  side: 'above' | 'below',
  buf: number,
  look: number
): number {
  const n = candles.length;
  const from = Math.max(1, n - Math.max(8, look));
  for (let i = from; i < n; i++) {
    const h = Number(candles[i]!.high);
    const l = Number(candles[i]!.low);
    if (side === 'above' ? h >= level - buf * 2 : l <= level + buf * 2) return i;
  }
  return Math.max(0, n - 4);
}

function makeCoreZone(p: {
  id: string;
  faceBase: string;
  faceSignal: string;
  detailKo: string;
  t1: number;
  t2: number;
  lo: number;
  hi: number;
  fill: string;
  bias: 'bullish' | 'bearish';
  extraClass: string;
  bg: string;
  pulse?: boolean;
  confidence?: number;
  spanOnly?: boolean;
}): OverlayItem {
  return {
    id: p.id,
    kind: 'zone',
    category: 'chartPrimeTrendChannels',
    label: `${p.faceBase}·${p.faceSignal}`,
    zoneFaceBase: p.faceBase,
    zoneFaceSignal: p.faceSignal,
    zoneFaceDetailKo: p.detailKo,
    zoneFaceLang: 'ko',
    x1: 0,
    y1: 0.5,
    x2: 1,
    y2: 0.5,
    time1: p.t1,
    time2: p.t2,
    price1: p.hi,
    price2: p.lo,
    confidence: p.confidence ?? 84,
    color: p.fill,
    zoneFillPreserve: true,
    zoneSpanOnly: p.spanOnly !== false,
    zonePulse: p.pulse === true,
    structureBias: p.bias,
    overlayZoneExtraClass: p.extraClass,
    labelTooltip: p.detailKo,
    labelBackgroundColor: p.bg,
    labelTextColor: '#f8fafc',
    noProject: true,
  };
}

type CorePhase = 'pre' | 'break' | 'settle' | 'confirm' | 'fail';

function phaseFromEdge(
  stateKo: string,
  settle: 'none' | 'attempt' | 'settled' | 'failed'
): CorePhase | null {
  if (settle === 'failed' || stateKo === '돌파실패') return 'fail';
  if (settle === 'settled' || stateKo === '안착확정') return 'confirm';
  if (settle === 'attempt' || stateKo === '돌파') return 'break';
  if (stateKo === '돌파가능') return 'pre';
  return null;
}

function settleToPhase(s: 'none' | 'attempt' | 'settled' | 'failed'): CorePhase | null {
  if (s === 'settled') return 'confirm';
  if (s === 'attempt') return 'break';
  if (s === 'failed') return 'fail';
  return null;
}

/**
 * 가격이 붙어 있는 레일 우선.
 * 하방(하단 레일): 존에 앉으면 안착성공 — 상단 실패 잔상을 덮지 않음.
 */
function resolveLiveCoreRail(params: {
  close: number;
  g: MergedDeskChannelGeom;
  read: MergedDeskChannelEdgeRead | null;
  primary: MergedDeskChannelPrimaryDecision | null;
  planStateKo?: string;
}): { side: 'above' | 'below'; isLong: boolean; phase: CorePhase | null } {
  const { close, g, read, primary, planStateKo } = params;
  const up = read?.upperSettle ?? 'none';
  const lo = read?.lowerSettle ?? 'none';
  const distUp = Math.abs(close - g.tipUpper);
  const distLo = Math.abs(close - g.tipLower);
  const nearLower = distLo <= distUp * 1.08;
  const mid = (g.tipUpper + g.tipLower) / 2;

  if (nearLower) {
    const p = settleToPhase(lo);
    if (p) return { side: 'below', isLong: false, phase: p };
    if (close <= mid && (up === 'failed' || up === 'none')) {
      return { side: 'below', isLong: false, phase: 'settle' };
    }
  } else {
    const p = settleToPhase(up);
    if (p) return { side: 'above', isLong: true, phase: p };
  }

  const fallbackLong =
    primary?.direction === 'LONG' || (primary?.direction !== 'SHORT' && !g.useBearFill);
  const side: 'above' | 'below' =
    primary?.edge === 'lower'
      ? 'below'
      : primary?.edge === 'upper'
        ? 'above'
        : fallbackLong
          ? 'above'
          : 'below';
  const settle = side === 'above' ? up : lo;
  const corePhase =
    (primary ? phaseFromEdge(primary.stateKo, settle) : null) ??
    (planStateKo ? phaseFromEdge(planStateKo, settle) : null);
  return { side, isLong: side === 'above', phase: corePhase };
}

/** 채널 레일을 봉 인덱스에 맞게 보간 (과거 자리용) */
function railAtBar(
  g: MergedDeskChannelGeom,
  candles: Candle[],
  idx: number,
  which: 'upper' | 'lower'
): number {
  const n = candles.length;
  if (n < 2) return which === 'upper' ? g.tipUpper : g.tipLower;
  let i0 = 0;
  let i1 = n - 1;
  for (let i = 0; i < n; i++) {
    if (Number(candles[i]!.time) >= g.tStart) {
      i0 = i;
      break;
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    if (Number(candles[i]!.time) <= g.tEnd) {
      i1 = i;
      break;
    }
  }
  if (i1 <= i0) i1 = Math.min(n - 1, i0 + 1);
  const t = Math.max(0, Math.min(1, (idx - i0) / Math.max(1, i1 - i0)));
  if (which === 'upper') return g.up1 + (g.up2 - g.up1) * t;
  return g.lo1 + (g.lo2 - g.lo1) * t;
}

type HistEvent = {
  idx: number;
  phase: CorePhase;
  side: 'above' | 'below';
  isLong: boolean;
};

/**
 * 채널 구간 전체를 훑어 과거에 떴어야 할 돌파·안착·실패 자리를 모은다.
 * - 종가 이탈 = 돌파 / 2봉+ 유지 = 안착확정 / 직후 봉 = ◆
 * - 종가 복귀 = ❌
 * - 꼬리만 뚫고 종가 복귀 = 같은 봉 ❌ (가짜돌파)
 */
function scanHistoricalCoreEvents(
  candles: Candle[],
  g: MergedDeskChannelGeom,
  atr: number,
  settleBars = 2
): HistEvent[] {
  const n = candles.length;
  if (n < 4) return [];
  let i0 = 0;
  for (let i = 0; i < n; i++) {
    if (Number(candles[i]!.time) >= g.tStart) {
      i0 = Math.max(0, i - 1);
      break;
    }
  }
  const from = Math.max(1, Math.min(i0, n - 2));
  const out: HistEvent[] = [];
  /** 너무 크면 돌파를 못 잡음 — ATR·폭 중 작은 쪽 */
  const buf = Math.max(
    Math.min(atr * 0.06, g.width * 0.02),
    Math.abs(g.tipUpper || g.tipLower || 1) * 0.00008
  );

  for (const side of ['above', 'below'] as const) {
    const isLong = side === 'above';
    let runOutside = 0;
    let breakIdx = -1;
    let confirmed = false;

    for (let i = from; i < n; i++) {
      const bar = candles[i]!;
      const close = Number(bar.close);
      const high = Number(bar.high);
      const low = Number(bar.low);
      if (![close, high, low].every((x) => Number.isFinite(x) && x > 0)) continue;
      const level = railAtBar(g, candles, i, side === 'above' ? 'upper' : 'lower');
      if (!(level > 0)) continue;

      const closeOut = side === 'above' ? close > level + buf : close < level - buf;
      const wickOut = side === 'above' ? high > level + buf : low < level - buf;
      const insideHard = side === 'above' ? close < level - buf * 0.2 : close > level + buf * 0.2;

      /** 같은 봉: 꼬리 돌파 후 종가 복귀 → 실패 */
      if (wickOut && !closeOut && insideHard && breakIdx < 0) {
        out.push({ idx: i, phase: 'fail', side, isLong });
        continue;
      }

      if (closeOut) {
        if (breakIdx < 0) {
          breakIdx = i;
          out.push({ idx: i, phase: 'break', side, isLong });
          runOutside = 1;
          confirmed = false;
        } else {
          runOutside += 1;
          if (!confirmed && runOutside >= settleBars) {
            out.push({ idx: i, phase: 'confirm', side, isLong });
            confirmed = true;
          } else if (confirmed && runOutside === settleBars + 1) {
            out.push({ idx: i, phase: 'settle', side, isLong });
          }
        }
      } else if (breakIdx >= 0) {
        if (insideHard || !closeOut) {
          out.push({ idx: i, phase: 'fail', side, isLong });
        }
        breakIdx = -1;
        runOutside = 0;
        confirmed = false;
      }
    }
  }

  const rank: Record<CorePhase, number> = {
    fail: 4,
    confirm: 3,
    break: 2,
    settle: 1,
    pre: 0,
  };
  const byIdx = new Map<number, HistEvent>();
  for (const ev of out) {
    const prev = byIdx.get(ev.idx);
    if (!prev || rank[ev.phase] >= rank[prev.phase]) byIdx.set(ev.idx, ev);
  }
  return [...byIdx.values()].sort((a, b) => a.idx - b.idx);
}

/** 최근 에피소드만 (현재 상태 zone용) */
function scanBreakBars(
  candles: Candle[],
  level: number,
  side: 'above' | 'below',
  buf: number,
  look = 12
): { breakIdx: number; outsideIdxs: number[]; failIdx: number } {
  const n = candles.length;
  const outside = (c: number) => (side === 'above' ? c > level + buf : c < level - buf);
  const insideHard = (c: number) =>
    side === 'above' ? c < level - buf * 0.35 : c > level + buf * 0.35;

  let breakIdx = -1;
  const outsideIdxs: number[] = [];
  let failIdx = -1;
  const from = Math.max(1, n - look);
  for (let i = from; i < n; i++) {
    const c = Number(candles[i]?.close);
    if (!Number.isFinite(c)) continue;
    if (outside(c)) {
      if (breakIdx < 0) breakIdx = i;
      outsideIdxs.push(i);
    } else if (breakIdx >= 0 && insideHard(c) && failIdx < 0) {
      failIdx = i;
    }
  }
  return { breakIdx, outsideIdxs, failIdx };
}

function putPaint(
  m: Map<number, MonthDeskSettleCandleCell>,
  candles: Candle[],
  idx: number,
  phase: SettlePhase,
  bias: 'bullish' | 'bearish'
) {
  if (idx < 0 || idx >= candles.length) return;
  const t = Number(candles[idx]?.time);
  if (!Number.isFinite(t)) return;
  const rank = (p: SettlePhase) =>
    p === 'failed'
      ? 0
      : p === 'breakoutWeak'
        ? 1
        : p === 'breakout'
          ? 2
          : p === 'retest'
            ? 3
            : p === 'settling'
              ? 4
              : 5;
  const prev = m.get(t);
  if (!prev || rank(phase) >= rank(prev.phase)) m.set(t, { phase, bias });
}

function emojiFor(phase: CorePhase, isLong: boolean): { text: string; color: string; position: 'aboveBar' | 'belowBar' } {
  switch (phase) {
    case 'pre':
      return {
        text: isLong ? '⚡↑' : '⚡↓',
        color: '#FDE047',
        position: isLong ? 'aboveBar' : 'belowBar',
      };
    case 'break':
      return {
        text: isLong ? '🚀' : '📉',
        color: isLong ? '#FACC15' : '#FB923C',
        position: isLong ? 'aboveBar' : 'belowBar',
      };
    case 'settle':
      return {
        text: '◆',
        color: '#F97316',
        position: isLong ? 'belowBar' : 'aboveBar',
      };
    case 'confirm':
      return {
        text: isLong ? '✅' : '✅',
        color: isLong ? '#4ADE80' : '#FB7185',
        position: isLong ? 'belowBar' : 'aboveBar',
      };
    case 'fail':
    default:
      return {
        text: '❌',
        color: '#94A3B8',
        position: isLong ? 'aboveBar' : 'belowBar',
      };
  }
}

/**
 * 핵심 zone · 가격선 · 캔들색 · 이모티콘 마커를 한 세트로 만든다.
 * plan/primary가 없으면 빈 세트.
 */
export function buildMergedDeskRbCoreBreakSet(params: {
  candles: Candle[];
  timeframe: string;
  geoms: MergedDeskChannelGeom[];
  edgeReads: MergedDeskChannelEdgeRead[];
  plan: MergedDeskChannelMoneyPlan | null;
  primary: MergedDeskChannelPrimaryDecision | null;
  /** zone / 선 / 마커 / 캔들색 각각 ON */
  showZones?: boolean;
  showMarkers?: boolean;
  showCandlePaint?: boolean;
}): MergedDeskRbCoreBreakSet {
  const empty: MergedDeskRbCoreBreakSet = {
    overlays: [],
    priceLines: [],
    markers: [],
    settlePaint: new Map(),
    summaryKo: '',
  };
  const { candles, plan, primary, geoms, edgeReads } = params;
  const n = candles.length;
  if (n < 8 || !geoms.length) return empty;
  if (!isMergedDeskSharedFeatureTf(params.timeframe)) return empty;

  const showZones = params.showZones !== false;
  const showMarkers = params.showMarkers !== false;
  const showCandlePaint = params.showCandlePaint !== false;

  const g =
    (primary
      ? geoms.find((x) => x.horizon === primary.horizon)
      : null) ??
    geoms.find((x) => x.primary) ??
    geoms[0];
  if (!g) return empty;

  const atr = atrApprox(candles);
  const buf = Math.max(
    Math.min(atr * 0.06, g.width * 0.02),
    Math.abs(g.tipUpper || g.tipLower || 1) * 0.00008
  );
  const closeNow = Number(candles[n - 1]?.close) || 0;
  const read =
    edgeReads.find((r) => r.geom.horizon === g.horizon) ?? null;
  const live = resolveLiveCoreRail({
    close: closeNow,
    g,
    read,
    primary,
    planStateKo: plan?.edgeStateKo,
  });
  let isLong = live.isLong;
  let side = live.side;
  let level = side === 'above' ? g.tipUpper : g.tipLower;
  if (!(level > 0)) return empty;

  /** 과거 이력은 primary가 없어도 채널만 있으면 그린다 */
  const histEvents = scanHistoricalCoreEvents(candles, g, atr, 2);
  let phase: CorePhase =
    live.phase ??
    (histEvents.length ? histEvents[histEvents.length - 1]!.phase : 'pre');
  const lockKey = `${params.timeframe}|rb-core`;
  let coreLock = coreSettleLocks.get(lockKey) ?? null;
  let slippedCore = false;
  if (coreLock) {
    const slipBuf = Math.max(atr * 0.32, Math.abs(coreLock.level) * 0.0014);
    const slipped =
      coreLock.side === 'above'
        ? closeNow < coreLock.level - slipBuf
        : closeNow > coreLock.level + slipBuf;
    if (slipped || phase === 'fail') {
      coreSettleLocks.delete(lockKey);
      coreLock = null;
      slippedCore = true;
    } else {
      side = coreLock.side;
      isLong = coreLock.side === 'above';
      level = coreLock.level;
      if (phase === 'pre' || phase === 'break') phase = 'settle';
    }
  }
  const scan = scanBreakBars(candles, level, side, buf, 24);
  const tLast = Number(candles[n - 1]?.time) || 0;
  const t1 = Number(candles[Math.max(0, n - 6)]?.time) || tLast;
  if (!(tLast > 0)) return empty;
  /** 파랑빨강띠 분석봉 → 마지막봉 +20봉 */
  const tZone1 = Number(g.tStart) > 0 ? Number(g.tStart) : t1;
  const tZone2 = mergedDeskRbFutureTime2(candles, tLast, n - 1, MERGED_DESK_RB_FUTURE_BARS);

  const overlays: OverlayItem[] = [];
  const priceLines: AtlasPulsePriceLine[] = [];
  const markers: AtlasPulseMarker[] = [];
  const settlePaint = new Map<number, MonthDeskSettleCandleCell>();
  const bias: 'bullish' | 'bearish' = isLong ? 'bullish' : 'bearish';

  /** 1) 핵심돌파 세트 — 돌파면·안착면·실패면 (형성봉 허그, 축 숫자 없음) */
  if (showZones) {
    const lineColor =
      phase === 'fail'
        ? 'rgba(148,163,184,0.85)'
        : phase === 'confirm'
          ? isLong
            ? 'rgba(74,222,128,0.95)'
            : 'rgba(251,113,133,0.95)'
          : phase === 'break' || phase === 'settle'
            ? '#FACC15'
            : isLong
              ? 'rgba(34,197,94,0.92)'
              : 'rgba(239,68,68,0.92)';
    const minH = Math.max(atr * 0.055, Math.abs(level) * 0.00022, buf * 2);
    const stripH = Math.min(
      atr * 0.52,
      Math.max(g.width * 0.18, minH * 2.4, Math.abs(level) * 0.0045)
    );
    const formIdx =
      scan.breakIdx >= 0
        ? scan.breakIdx
        : firstRailTouchIdx(candles, level, side, buf, 20);
    const formBar = candles[Math.max(0, Math.min(formIdx, n - 1))]!;
    const tForm = Number(formBar.time) || t1;
    const railHug = clampBand(level - stripH / 2, level + stripH / 2, level, minH, stripH);
    const dirKo = side === 'below' ? '하방' : '상방';
    if (!slippedCore) {
      priceLines.push({
        price: level,
        color: lineColor,
        title: '',
        lineWidth: phase === 'confirm' || phase === 'break' ? 3 : 2,
        lineStyle: phase === 'fail' ? 'dotted' : phase === 'pre' ? 'dashed' : 'solid',
        axisLabel: false,
      });
    }

    const keepCls =
      'merged-desk-money-zone-keep merged-desk-rb-channel merged-desk-rb-core-set merged-desk-rb-core-white-frame';

    if (slippedCore) {
      /** 밀림 — 확실한안착 삭제. 새 레일로 점프하지 않음 */
    } else if (phase === 'fail') {
      overlays.push(
        makeCoreZone({
          id: 'merged-desk-rb-core-fail-zone',
          faceBase: '실패',
          faceSignal: `${dirKo}복귀`,
          detailKo: [
            `파랑빨강띠 ${dirKo} 레일 · 실패`,
            '종가(또는 꼬리)로 뚫었다가 띠 한가운데로 복귀',
            '가짜돌파 참고 · 진입 금지 · 승률 아님',
          ].join('\n'),
          t1: tZone1,
          t2: tZone2,
          lo: railHug.lo,
          hi: railHug.hi,
          fill: 'rgba(248,250,252,0.34)',
          bias,
          extraClass: `${keepCls} merged-desk-rb-core-fail-zone merged-desk-rb-core--fail`,
          bg: 'rgba(15,23,42,0.92)',
          confidence: 78,
          spanOnly: false,
        })
      );
    } else if (phase === 'settle' || phase === 'confirm') {
      const ok = phase === 'confirm';
      const settleBand = coreLock
        ? { lo: coreLock.lo, hi: coreLock.hi }
        : railHug;
      if (!coreLock) {
        coreSettleLocks.set(lockKey, {
          side,
          lo: settleBand.lo,
          hi: settleBand.hi,
          level,
        });
      }
      const settleSig = ok ? `${dirKo}안착성공` : `${dirKo}안착대기`;
      overlays.push(
        makeCoreZone({
          id: 'merged-desk-rb-core-settle-zone',
          faceBase: '확실한안착',
          faceSignal: settleSig,
          detailKo: [
            `${g.horizonKo || '채널'} ${dirKo} 확실한안착 zone`,
            ok
              ? side === 'below'
                ? '하락 후 하단 존 홀드 · 안착성공(조건부)'
                : '상단 밖 유지 · 안착성공(조건부)'
              : '재테스트·유지 확인 중',
            '확정 수익·승률 보장 아님',
          ].join('\n'),
          t1: tZone1,
          t2: tZone2,
          lo: settleBand.lo,
          hi: settleBand.hi,
          fill: ok ? 'rgba(248,250,252,0.36)' : 'rgba(226,232,240,0.28)',
          bias,
          extraClass: [
            keepCls,
            'merged-desk-rb-core-settle-zone',
            ok ? 'merged-desk-rb-core--ok' : 'merged-desk-rb-core--settle',
          ].join(' '),
          bg: ok
            ? isLong
              ? 'rgba(22,101,52,0.96)'
              : 'rgba(159,18,57,0.96)'
            : 'rgba(194,65,12,0.95)',
          pulse: phase === 'settle',
          confidence: 84,
          spanOnly: false,
        })
      );
    } else if (phase === 'break') {
      overlays.push(
        makeCoreZone({
          id: 'merged-desk-rb-core-break-zone',
          faceBase: '돌파확정',
          faceSignal: `${dirKo}돌파`,
          detailKo: [
            `${g.horizonKo || '채널'} ${dirKo} 돌파확정면`,
            '종가 이탈 · 형성봉 허그',
            '확정 수익·승률 보장 아님',
          ].join('\n'),
          t1: tZone1,
          t2: tZone2,
          lo: railHug.lo,
          hi: railHug.hi,
          fill: isLong ? 'rgba(250,204,21,0.22)' : 'rgba(251,146,60,0.22)',
          bias,
          extraClass: `${keepCls} merged-desk-rb-core-break-zone merged-desk-rb-core--hot`,
          bg: 'rgba(234,179,8,0.96)',
          pulse: true,
          confidence: 86,
          spanOnly: false,
        })
      );
    } else {
      overlays.push(
        makeCoreZone({
          id: 'merged-desk-rb-core-break-zone',
          faceBase: '돌파확정',
          faceSignal: `${dirKo}대기`,
          detailKo: [
            `${g.horizonKo || '채널'} ${dirKo} 돌파 대기면`,
            '종가가 레일을 넘기 전 — 대기',
            '확정 수익·승률 보장 아님',
          ].join('\n'),
          t1: tZone1,
          t2: tZone2,
          lo: railHug.lo,
          hi: railHug.hi,
          fill: isLong ? 'rgba(250,204,21,0.14)' : 'rgba(251,146,60,0.14)',
          bias,
          extraClass: `${keepCls} merged-desk-rb-core-break-zone merged-desk-rb-core--hot`,
          bg: 'rgba(234,179,8,0.88)',
          pulse: false,
          confidence: 72,
          spanOnly: false,
        })
      );
    }
  }

  /** 4) 캔들 색 — 과거 이력 전부 + 현재 에피소드 */
  if (showCandlePaint) {
    for (const ev of histEvents) {
      const b: 'bullish' | 'bearish' = ev.isLong ? 'bullish' : 'bearish';
      const paintPhase: SettlePhase =
        ev.phase === 'fail'
          ? 'failed'
          : ev.phase === 'confirm'
            ? 'confirmed'
            : ev.phase === 'settle'
              ? 'settling'
              : ev.phase === 'break'
                ? 'breakout'
                : 'breakoutWeak';
      putPaint(settlePaint, candles, ev.idx, paintPhase, b);
    }
    if (scan.breakIdx >= 0) {
      putPaint(settlePaint, candles, scan.breakIdx, 'breakout', bias);
      for (const i of scan.outsideIdxs) {
        if (i === scan.breakIdx) continue;
        if (phase === 'confirm' && i === scan.outsideIdxs[scan.outsideIdxs.length - 1]) {
          putPaint(settlePaint, candles, i, 'confirmed', bias);
        } else {
          putPaint(settlePaint, candles, i, 'settling', bias);
        }
      }
    }
    if (scan.failIdx >= 0 || phase === 'fail') {
      const fi = scan.failIdx >= 0 ? scan.failIdx : n - 1;
      putPaint(settlePaint, candles, fi, 'failed', bias);
    }
    if (phase === 'pre' && histEvents.length === 0) {
      putPaint(settlePaint, candles, n - 1, 'breakoutWeak', bias);
    }
  }

  /** 5) 봉 위·아래 이모티콘 — 시리즈 마커 + HTML 핀(마커가 덮여도 보이게) */
  if (showMarkers) {
    const markAt = (idx: number, ph: CorePhase, eventLong: boolean, idSuffix: string) => {
      if (idx < 0 || idx >= n) return;
      const bar = candles[idx]!;
      const t = Number(bar.time);
      if (!Number.isFinite(t)) return;
      const em = emojiFor(ph, eventLong);
      const hi = Number(bar.high);
      const lo = Number(bar.low);
      const pinPrice = eventLong
        ? (Number.isFinite(hi) ? hi : Number(bar.close))
        : Number.isFinite(lo)
          ? lo
          : Number(bar.close);
      markers.push({
        time: t as UTCTimestamp,
        position: em.position,
        shape: 'circle',
        color: em.color,
        text: em.text,
        size: ph === 'confirm' || ph === 'fail' ? 2 : 1,
        id: `merged-desk-rb-core-mk-${idSuffix}-${t}`,
      });
      /** HTML 핀 — lightweight-charts 마커가 다른 신호에 밀려도 차트에 남김 */
      overlays.push({
        id: `merged-desk-rb-core-pin-${idSuffix}-${t}`,
        kind: 'label',
        category: 'scenario',
        label: em.text,
        x1: 0,
        y1: 0,
        time1: t,
        price1: pinPrice,
        color: em.color,
        labelBackgroundColor:
          ph === 'fail'
            ? 'rgba(71,85,105,0.92)'
            : ph === 'confirm'
              ? eventLong
                ? 'rgba(22,101,52,0.94)'
                : 'rgba(159,18,57,0.94)'
              : ph === 'settle'
                ? 'rgba(194,65,12,0.94)'
                : 'rgba(202,138,4,0.95)',
        labelTextColor: '#f8fafc',
        confidence: 0.9,
        overlayZoneExtraClass: [
          'merged-desk-rb-core-pin',
          'merged-desk-rb-channel',
          'merged-desk-money-zone-keep',
          ph === 'fail'
            ? 'merged-desk-rb-core-pin--fail'
            : ph === 'confirm'
              ? 'merged-desk-rb-core-pin--ok'
              : 'merged-desk-rb-core-pin--hot',
        ].join(' '),
        labelTooltip:
          ph === 'fail'
            ? '돌파 후 채널 복귀 · 실패'
            : ph === 'confirm'
              ? '밖 2봉+ 유지 · 안착 확정'
              : ph === 'settle'
                ? '안착 직후 유지봉'
                : ph === 'break'
                  ? '종가 채널 이탈 · 돌파'
                  : '돌파 대기',
      });
    };

    for (const ev of histEvents) {
      markAt(ev.idx, ev.phase, ev.isLong, `${ev.side}-${ev.phase}`);
    }

    if (phase === 'pre') {
      const hasRecent = histEvents.some((e) => e.idx >= n - 3);
      if (!hasRecent) markAt(n - 1, 'pre', isLong, 'pre');
    } else if (phase === 'break' || phase === 'settle') {
      const lastMarked = histEvents.some((e) => e.idx === n - 1);
      if (!lastMarked) {
        markAt(n - 1, phase === 'break' ? 'break' : 'settle', isLong, 'now');
      }
    }
  }

  const dirKo = isLong ? '롱' : '숏';
  const histBreak = histEvents.filter((e) => e.phase === 'break').length;
  const histOk = histEvents.filter((e) => e.phase === 'confirm').length;
  const histFail = histEvents.filter((e) => e.phase === 'fail').length;
  const summaryKo = `핵심세트 · ${g.horizonKo || '채널'} · ${dirKo} · ${
    phase === 'pre'
      ? '돌파대기'
      : phase === 'break'
        ? '돌파확정'
        : phase === 'settle'
          ? '확실한안착(확인중)'
          : phase === 'confirm'
            ? '확실한안착'
            : '실패'
  } · ${fmt(level)} · 과거⚡${histBreak}/✅${histOk}/❌${histFail}`;

  return { overlays, priceLines, markers, settlePaint, summaryKo };
}

/** 설정 반영 · MoneyEdge 결과로 핵심 세트 생성 */
export function buildMergedDeskRbCoreBreakSetFromMoney(params: {
  candles: Candle[];
  timeframe: string;
  geoms: MergedDeskChannelGeom[];
  edgeReads: MergedDeskChannelEdgeRead[];
  plan: MergedDeskChannelMoneyPlan | null;
  primary: MergedDeskChannelPrimaryDecision | null;
}): MergedDeskRbCoreBreakSet {
  let showZones = true;
  /** 봉 위·아래 동그라미/이모티콘 — 설정에서 켠 경우만 (기본 끔) */
  let showMarkers = false;
  let showCandlePaint = true;
  try {
    const s = loadSettings();
    showZones = s.chartMergedDeskRbCoreZonesEnabled !== false;
    showMarkers = s.chartMergedDeskRbCoreMarkersEnabled === true;
    showCandlePaint = s.chartMergedDeskRbCoreCandlePaintEnabled !== false;
  } catch {
    /* ignore */
  }
  if (!showZones && !showMarkers && !showCandlePaint) {
    return {
      overlays: [],
      priceLines: [],
      markers: [],
      settlePaint: new Map(),
      summaryKo: '',
    };
  }
  return buildMergedDeskRbCoreBreakSet({
    ...params,
    showZones,
    showMarkers,
    showCandlePaint,
  });
}

function loadRbCoreLive(candles: Candle[], timeframe: string): MergedDeskRbCoreBreakSet | null {
  try {
    const s = loadSettings();
    if (s.chartMergedDeskBlueRedChannelsEnabled === false) return null;
  } catch {
    /* ignore */
  }
  if (candles.length < 8) return null;
  const pack = buildMergedDeskChannelMoneyEdgePack(candles, timeframe);
  if (!pack.geoms.length) return null;
  return buildMergedDeskRbCoreBreakSetFromMoney({
    candles,
    timeframe,
    geoms: pack.geoms,
    edgeReads: pack.edgeReads,
    plan: pack.plan,
    primary: pack.primary,
  });
}

/** ChartView용 — 통합모드에서 채널 핵심 안착 캔들색만 뽑기 */
export function collectMergedDeskRbCoreSettleCandlePaint(
  candles: Candle[],
  timeframe: string
): Map<number, MonthDeskSettleCandleCell> | null {
  try {
    const s = loadSettings();
    if (s.chartMergedDeskRbCoreCandlePaintEnabled === false) return null;
  } catch {
    /* ignore */
  }
  const core = loadRbCoreLive(candles, timeframe);
  return core && core.settlePaint.size > 0 ? core.settlePaint : null;
}

/** ChartView용 — 팩에 마커가 비어도 즉시 다시 계산 */
export function collectMergedDeskRbCoreMarkers(
  candles: Candle[],
  timeframe: string
): AtlasPulseMarker[] {
  try {
    const s = loadSettings();
    if (s.chartMergedDeskRbCoreMarkersEnabled !== true) return [];
  } catch {
    return [];
  }
  const core = loadRbCoreLive(candles, timeframe);
  return core?.markers ?? [];
}
