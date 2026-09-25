/**
 * 통합·분석 — 고급 작도 묶음 (기능 삭제 없이 차트에 합류).
 * 1) OB·VP·피벗 S/R (고급 캔들 zone)
 * 2) 존 터치 반응 통계 (터치·반등/거부 — 확정 승률 아님)
 * 3) 스윕 → 반응 → 목표 3단 시나리오 선
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { atrSeries } from '@/lib/indicators';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';
import type { MergedDeskCoreSrPack } from '@/lib/mergedDeskCoreSrZones';
import { buildMergedDeskAdvancedCandleZones } from '@/lib/mergedDeskAdvancedCandleZones';
import {
  findMergedDeskZoneFormationBarTime,
  mergedDeskAnalyzedZoneSpanTimes,
  mergedWorkCandles,
  snapMergedOverlayTimeToCandles,
} from '@/lib/mergedAnalysisOverlayTimes';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';

export const MERGED_DESK_ADV_ID_PREFIX = 'merged-desk-adv-';

export function isMergedDeskAdvancedAnalysisOverlay(
  item: Pick<OverlayItem, 'id' | 'overlayZoneExtraClass'> | null | undefined
): boolean {
  if (!item) return false;
  const id = String(item.id || '');
  const extra = String(item.overlayZoneExtraClass || '');
  return (
    id.startsWith(MERGED_DESK_ADV_ID_PREFIX) ||
    id.startsWith('merged-ares-mlsp-tv-ob') ||
    id.startsWith('merged-ares-mlsp-tv-hvp') ||
    id.startsWith('merged-ares-mlsp-tv-lvp') ||
    id.startsWith('merged-ares-mlsp-tv-sr-') ||
    extra.includes('merged-desk-adv-') ||
    extra.includes('merged-ares-mlsp-tv-ob') ||
    extra.includes('merged-ares-mlsp-tv-hvp') ||
    extra.includes('merged-ares-mlsp-tv-lvp') ||
    extra.includes('merged-ares-mlsp-tv-sr')
  );
}

function fmtPx(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return p.toFixed(1);
  if (a >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function lastAtr(candles: Candle[]): number {
  const arr = atrSeries(candles, 14);
  const v = arr[arr.length - 1];
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  const c = candles[candles.length - 1];
  return c ? Math.abs(c.close) * 0.004 : 1;
}

type TouchBand = {
  id: string;
  top: number;
  bot: number;
  mid: number;
  side: 'SUPPORT' | 'RESIST';
  labelKo: string;
};

function collectTouchBands(params: {
  keyZones?: MergedKeyZone[];
  criticalZones?: MergedCriticalZone[];
  coreSr?: MergedDeskCoreSrPack | null;
  price: number;
}): TouchBand[] {
  const out: TouchBand[] = [];
  for (const z of params.keyZones ?? []) {
    const mid = (z.top + z.bot) / 2;
    out.push({
      id: z.id,
      top: z.top,
      bot: z.bot,
      mid,
      side: z.kind === 'demand' ? 'SUPPORT' : 'RESIST',
      labelKo: z.labelKo || (z.kind === 'demand' ? '지지' : '저항'),
    });
  }
  for (const z of params.criticalZones ?? []) {
    const isSup = z.scenario === 'if_decline' || z.kind === 'demand';
    const top = z.top > z.bot ? z.top : z.price + Math.abs(z.price) * 0.003;
    const bot = z.top > z.bot ? z.bot : z.price - Math.abs(z.price) * 0.003;
    out.push({
      id: z.id,
      top,
      bot,
      mid: (top + bot) / 2,
      side: isSup ? 'SUPPORT' : 'RESIST',
      labelKo: z.labelKo || (isSup ? '하락핵심' : '상승핵심'),
    });
  }
  for (const z of params.coreSr?.all ?? []) {
    out.push({
      id: z.id,
      top: z.top,
      bot: z.bot,
      mid: z.mid,
      side: z.side,
      labelKo: z.labelKo,
    });
  }
  const gap = Math.max(Math.abs(params.price) * 0.008, 20);
  const deduped: TouchBand[] = [];
  for (const b of out.sort((a, b) => Math.abs(a.mid - params.price) - Math.abs(b.mid - params.price))) {
    if (deduped.some((d) => Math.abs(d.mid - b.mid) < gap)) continue;
    deduped.push(b);
    if (deduped.length >= 6) break;
  }
  return deduped;
}

/** 존 터치 후 반등(지지)·거부(저항) 횟수 — 표본 기반 참고 */
export function buildMergedDeskZoneTouchReactionPack(params: {
  candles: Candle[];
  timeframe: string;
  keyZones?: MergedKeyZone[];
  criticalZones?: MergedCriticalZone[];
  coreSr?: MergedDeskCoreSrPack | null;
  currentPrice?: number | null;
}): { overlays: OverlayItem[]; priceLines: AtlasPulsePriceLine[]; summaryKo: string } {
  const tf = normalizeChartTimeframe(params.timeframe);
  const work = mergedWorkCandles(params.candles, tf);
  if (work.length < 24) {
    return { overlays: [], priceLines: [], summaryKo: '' };
  }
  const price =
    params.currentPrice && params.currentPrice > 0
      ? params.currentPrice
      : work[work.length - 1]!.close;
  const atr = lastAtr(work);
  const bands = collectTouchBands({
    keyZones: params.keyZones,
    criticalZones: params.criticalZones,
    coreSr: params.coreSr,
    price,
  });
  if (!bands.length) {
    return { overlays: [], priceLines: [], summaryKo: '터치 반응 — 존 대기' };
  }

  const overlays: OverlayItem[] = [];
  const priceLines: AtlasPulsePriceLine[] = [];
  const parts: string[] = [];

  for (const [i, band] of bands.entries()) {
    let touches = 0;
    let reacts = 0;
    const pad = Math.max(atr * 0.12, (band.top - band.bot) * 0.15);
    const top = band.top + pad * 0.2;
    const bot = band.bot - pad * 0.2;
    for (let j = 2; j < work.length - 1; j++) {
      const c = work[j]!;
      const hit = c.low <= top && c.high >= bot;
      if (!hit) continue;
      touches += 1;
      const next = work[j + 1]!;
      if (band.side === 'SUPPORT') {
        if (next.close > c.close || next.low > bot - atr * 0.05) reacts += 1;
      } else if (next.close < c.close || next.high < top + atr * 0.05) {
        reacts += 1;
      }
    }
    if (touches < 1) continue;
    const reactPct = Math.round((reacts / touches) * 100);
    const sideKo = band.side === 'SUPPORT' ? '반등' : '거부';
    const label = `터치${touches}·${sideKo}${reacts}(${reactPct}%)`;
    const formT = findMergedDeskZoneFormationBarTime(work, top, bot, null);
    const span = mergedDeskAnalyzedZoneSpanTimes(work, {
      id: `${MERGED_DESK_ADV_ID_PREFIX}touch-${i}`,
      time1: formT,
      price1: top,
      price2: bot,
    });
    if (!span) continue;
    const isSup = band.side === 'SUPPORT';
    overlays.push({
      id: `${MERGED_DESK_ADV_ID_PREFIX}touch-${i}-${Math.round(band.mid)}`,
      kind: isSup ? 'demandZone' : 'supplyZone',
      label,
      labelTooltip: `${band.labelKo} · ${label} · 표본 참고(확정 아님)`,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: span.t1 as UTCTimestamp,
      time2: span.t2 as UTCTimestamp,
      price1: top,
      price2: bot,
      confidence: Math.min(90, 55 + Math.min(touches, 8) * 3),
      color: isSup ? 'rgba(34,197,94,0.16)' : 'rgba(248,113,113,0.14)',
      category: 'scenario',
      zoneFillPreserve: true,
      overlayZoneExtraClass: [
        'merged-desk-adv-touch',
        isSup ? 'merged-desk-adv-touch--support' : 'merged-desk-adv-touch--resist',
        MERGED_DESK_ADV_ID_PREFIX.slice(0, -1),
      ].join(' '),
      lineLabelColor: isSup ? '#86efac' : '#fca5a5',
      labelBackgroundColor: isSup ? 'rgba(6,78,59,0.92)' : 'rgba(127,29,29,0.92)',
      labelTextColor: '#f8fafc',
    });
    if (i < 3) {
      priceLines.push({
        price: band.mid,
        color: isSup ? '#4ADE80' : '#F87171',
        title: `${sideKo}${reactPct}%`,
        lineWidth: 1,
        lineStyle: 'dashed',
        axisLabel: true,
      });
    }
    parts.push(`${fmtPx(band.mid)} ${label}`);
  }

  return {
    overlays,
    priceLines,
    summaryKo: parts.length ? `터치반응 ${parts.slice(0, 3).join(' · ')}` : '터치 반응 — 표본 부족',
  };
}

/** 유동성 스윕 → 반응대 → 목표 3단 경로 (조건부 참고) */
export function buildMergedDeskSweepReactionPathPack(params: {
  candles: Candle[];
  timeframe: string;
  currentPrice?: number | null;
  direction?: 'LONG' | 'SHORT' | 'NEUTRAL' | null;
}): { overlays: OverlayItem[]; priceLines: AtlasPulsePriceLine[]; summaryKo: string } {
  const tf = normalizeChartTimeframe(params.timeframe);
  const work = mergedWorkCandles(params.candles, tf);
  if (work.length < 36) {
    return { overlays: [], priceLines: [], summaryKo: '' };
  }
  const atr = lastAtr(work);
  const n = work.length;
  const last = work[n - 1]!;
  const price =
    params.currentPrice && params.currentPrice > 0 ? params.currentPrice : last.close;
  const look = Math.min(80, n - 4);
  let swingHi = -Infinity;
  let swingLo = Infinity;
  let hiI = n - 3;
  let loI = n - 3;
  for (let i = n - look; i < n - 2; i++) {
    if (work[i]!.high > swingHi) {
      swingHi = work[i]!.high;
      hiI = i;
    }
    if (work[i]!.low < swingLo) {
      swingLo = work[i]!.low;
      loI = i;
    }
  }

  /** 최근 봉이 스윙 고/저를 Sweep 후 회수했는지 */
  let sweepSide: 'BULL' | 'BEAR' | null = null;
  let sweepPrice = 0;
  let sweepI = -1;
  for (let i = Math.max(hiI, loI) + 1; i < n; i++) {
    const c = work[i]!;
    if (c.high > swingHi + atr * 0.02 && c.close < swingHi) {
      sweepSide = 'BEAR';
      sweepPrice = swingHi;
      sweepI = i;
    }
    if (c.low < swingLo - atr * 0.02 && c.close > swingLo) {
      sweepSide = 'BULL';
      sweepPrice = swingLo;
      sweepI = i;
    }
  }
  if (!sweepSide || sweepI < 0) {
    /** 방향 힌트로 약한 스윕 후보 */
    if (params.direction === 'LONG' && Number.isFinite(swingLo)) {
      sweepSide = 'BULL';
      sweepPrice = swingLo;
      sweepI = loI;
    } else if (params.direction === 'SHORT' && Number.isFinite(swingHi)) {
      sweepSide = 'BEAR';
      sweepPrice = swingHi;
      sweepI = hiI;
    } else {
      return { overlays: [], priceLines: [], summaryKo: '스윕경로 — 대기' };
    }
  }

  const reactHalf = atr * 0.35;
  const reactMid =
    sweepSide === 'BULL' ? sweepPrice + atr * 0.15 : sweepPrice - atr * 0.15;
  const reactTop = reactMid + reactHalf;
  const reactBot = reactMid - reactHalf;
  const target =
    sweepSide === 'BULL'
      ? Math.max(swingHi, price + atr * 1.2)
      : Math.min(swingLo, price - atr * 1.2);

  const tSweep = Number(snapMergedOverlayTimeToCandles(Number(work[sweepI]!.time), work));
  const tEnd = Number(snapMergedOverlayTimeToCandles(Number(last.time), work));
  const tReact = Number(
    snapMergedOverlayTimeToCandles(Number(work[Math.min(n - 1, sweepI + 2)]!.time), work)
  );

  const bull = sweepSide === 'BULL';
  const overlays: OverlayItem[] = [];

  overlays.push({
    id: `${MERGED_DESK_ADV_ID_PREFIX}sweep-lvl`,
    kind: 'keyLevel',
    label: bull ? '스윕(저)' : '스윕(고)',
    labelTooltip: `유동성 스윕 ${fmtPx(sweepPrice)} · 조건부 참고`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: tSweep as UTCTimestamp,
    time2: tEnd as UTCTimestamp,
    price1: sweepPrice,
    price2: sweepPrice,
    confidence: 86,
    color: bull ? 'rgba(52,211,153,0.95)' : 'rgba(248,113,113,0.95)',
    category: 'structure',
    lineDash: '6 4',
    lineStrokeWidth: 2,
    overlayZoneExtraClass: 'merged-desk-adv-sweep-line',
  });

  overlays.push({
    id: `${MERGED_DESK_ADV_ID_PREFIX}sweep-react`,
    kind: bull ? 'demandZone' : 'supplyZone',
    label: '반응대',
    labelTooltip: `스윕 후 반응 ${fmtPx(reactBot)}~${fmtPx(reactTop)} (참고)`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: tReact as UTCTimestamp,
    time2: tEnd as UTCTimestamp,
    price1: reactTop,
    price2: reactBot,
    confidence: 82,
    color: bull ? 'rgba(45,212,191,0.18)' : 'rgba(251,146,60,0.16)',
    category: 'scenario',
    zoneFillPreserve: true,
    overlayZoneExtraClass: 'merged-desk-adv-sweep-react',
    lineLabelColor: bull ? '#5eead4' : '#fdba74',
    labelBackgroundColor: bull ? 'rgba(6,78,59,0.9)' : 'rgba(124,45,18,0.9)',
    labelTextColor: '#f8fafc',
  });

  overlays.push({
    id: `${MERGED_DESK_ADV_ID_PREFIX}sweep-target`,
    kind: 'keyLevel',
    label: '목표',
    labelTooltip: `스윕→반응 후 목표 ${fmtPx(target)} (조건부)`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: tReact as UTCTimestamp,
    time2: tEnd as UTCTimestamp,
    price1: target,
    price2: target,
    confidence: 78,
    color: bull ? 'rgba(74,222,128,0.9)' : 'rgba(251,113,133,0.9)',
    category: 'structure',
    lineDash: '10 5',
    lineStrokeWidth: 1.8,
    overlayZoneExtraClass: 'merged-desk-adv-sweep-target',
  });

  /** 경로 연결선 (스윕 → 반응중 → 목표) */
  overlays.push({
    id: `${MERGED_DESK_ADV_ID_PREFIX}sweep-path`,
    kind: 'trendLine',
    label: '',
    labelTooltip: '스윕→반응→목표 경로',
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: tSweep as UTCTimestamp,
    price1: sweepPrice,
    time2: tEnd as UTCTimestamp,
    price2: target,
    confidence: 70,
    color: bull ? 'rgba(52,211,153,0.55)' : 'rgba(248,113,113,0.55)',
    lineDash: '4 6',
    lineStrokeWidth: 1.4,
    category: 'structure',
    noProject: true,
    overlayZoneExtraClass: 'merged-desk-adv-sweep-path merged-desk-candle-trend',
  });

  const priceLines: AtlasPulsePriceLine[] = [
    {
      price: sweepPrice,
      color: bull ? '#34D399' : '#F87171',
      title: bull ? '스윕저' : '스윕고',
      lineWidth: 2,
      lineStyle: 'dashed',
      axisLabel: true,
    },
    {
      price: reactMid,
      color: bull ? '#2DD4BF' : '#FB923C',
      title: '반응',
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    },
    {
      price: target,
      color: bull ? '#4ADE80' : '#FB7185',
      title: '목표',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    },
  ];

  return {
    overlays,
    priceLines,
    summaryKo: `스윕경로 ${bull ? '상승' : '하락'} ${fmtPx(sweepPrice)}→반응→${fmtPx(target)}`,
  };
}

export function buildMergedDeskAdvancedAnalysisDrawPack(params: {
  candles: Candle[];
  timeframe: string;
  keyZones?: MergedKeyZone[];
  criticalZones?: MergedCriticalZone[];
  coreSr?: MergedDeskCoreSrPack | null;
  currentPrice?: number | null;
  direction?: 'LONG' | 'SHORT' | 'NEUTRAL' | null;
}): {
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
  summaryKo: string;
} {
  const tf = normalizeChartTimeframe(params.timeframe);
  const work = mergedWorkCandles(params.candles, tf);
  if (work.length < 16) {
    return { overlays: [], priceLines: [], summaryKo: '' };
  }
  const t1 = Number(work[Math.max(0, work.length - 120)]!.time);
  const t2 = Number(work[work.length - 1]!.time);

  const advZones = buildMergedDeskAdvancedCandleZones(work, tf, t1, t2);
  const touch = buildMergedDeskZoneTouchReactionPack(params);
  const sweep = buildMergedDeskSweepReactionPathPack(params);

  const overlays = [...advZones, ...touch.overlays, ...sweep.overlays];
  const priceLines = [...touch.priceLines, ...sweep.priceLines];
  const summaryKo = [touch.summaryKo, sweep.summaryKo].filter(Boolean).join(' | ');

  return { overlays, priceLines, summaryKo };
}
