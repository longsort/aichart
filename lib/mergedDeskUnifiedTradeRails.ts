/**
 * 통합·분석 — E/SL/TP 단일 소스 (resolveUnifiedDeskTradePlan → 차트·가격축·HUD).
 * 중복 레일·Mirage·Strike TP 라인 제거 후 이 모듈만 사용.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import { monthDeskTailLabelAnchorTime, monthDeskBarStepMs } from '@/lib/monthDeskChartTailSpacing';
import { mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';

const RAIL_PREFIX = 'merged-desk-trade-rail';

export const MERGED_DESK_TRADE_RAIL_IDS = {
  entry: `${RAIL_PREFIX}-e`,
  sl: `${RAIL_PREFIX}-sl`,
  tp1: `${RAIL_PREFIX}-tp1`,
  tp2: `${RAIL_PREFIX}-tp2`,
  tp3: `${RAIL_PREFIX}-tp3`,
} as const;

export function isMergedDeskUnifiedTradeRailId(id: string): boolean {
  return id.startsWith(RAIL_PREFIX);
}

function fmtPx(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (a >= 1) return n.toFixed(2);
  return n.toPrecision(4);
}

export function calcTradeRewardRisk(entry: number, stopLoss: number, tp: number): number | null {
  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0 || !Number.isFinite(tp) || tp <= 0) return null;
  const reward = Math.abs(tp - entry);
  return reward / risk;
}

function tpValid(direction: 'LONG' | 'SHORT', entry: number, tp: number, minSep?: number): boolean {
  if (!Number.isFinite(tp) || tp <= 0) return false;
  if (direction === 'LONG') {
    if (tp <= entry) return false;
    if (minSep != null && tp <= minSep) return false;
    return true;
  }
  if (tp >= entry) return false;
  if (minSep != null && tp >= minSep) return false;
  return true;
}

/** Strike·분석 병합 후 TP 사다리 정렬·빈 칸 RR 보강 · SL 방향 교정.
 * lockDirection=true면 방향을 뒤집지 않고 E 기준 SL/TP만 맞춤(超级统计·마스터용).
 */
export function strengthenUnifiedDeskTradePlan(
  plan: UnifiedDeskTradePlan,
  opts?: { lockDirection?: boolean }
): UnifiedDeskTradePlan {
  if (plan.direction === 'NEUTRAL' || plan.entry <= 0 || plan.stopLoss <= 0) return plan;

  let { direction, entry, stopLoss } = plan;
  let risk = Math.abs(entry - stopLoss);
  if (risk <= 0) {
    risk = Math.max(entry * 0.004, 1e-6);
  }

  const lock = opts?.lockDirection === true;

  /** SL이 방향과 반대면: 잠금 시 교정, 아니면 TP로 방향 추정 후 교정 */
  if (direction === 'LONG' && stopLoss >= entry) {
    if (!lock && plan.tp1 > 0 && plan.tp1 < entry) {
      direction = 'SHORT';
    } else {
      stopLoss = entry - risk;
    }
  } else if (direction === 'SHORT' && stopLoss <= entry) {
    if (!lock && plan.tp1 > 0 && plan.tp1 > entry) {
      direction = 'LONG';
    } else {
      stopLoss = entry + risk;
    }
  }
  risk = Math.abs(entry - stopLoss);
  if (risk <= 0) return plan;

  const warnings = [...plan.warningsKo];

  /** 선물 손절 상한 — 너무 넓은 SL은 레버리지 리스크 폭증 (구조 최소 유지) */
  const maxRisk = Math.max(entry * 0.0065, entry * 0.0015);
  const minRisk = Math.max(entry * 0.0022, 1e-6);
  if (risk > maxRisk) {
    risk = maxRisk;
    stopLoss = direction === 'LONG' ? entry - risk : entry + risk;
    warnings.push('선물 SL 축소(최대≈0.65%)');
  } else if (risk < minRisk) {
    risk = minRisk;
    stopLoss = direction === 'LONG' ? entry - risk : entry + risk;
  }

  const sign = direction === 'LONG' ? 1 : -1;
  const rrDefaults = [1.5, 2.5, 4.0].map((rr) => entry + sign * risk * rr);

  let tp1 = plan.tp1;
  let tp2 = plan.tp2;
  let tp3 = plan.tp3;

  if (!tpValid(direction, entry, tp1)) tp1 = rrDefaults[0]!;
  if (!tpValid(direction, entry, tp2, tp1)) tp2 = rrDefaults[1]!;
  if (!tpValid(direction, entry, tp3, tp2)) tp3 = rrDefaults[2]!;

  const ladder =
    direction === 'LONG'
      ? [tp1, tp2, tp3].sort((a, b) => a - b)
      : [tp1, tp2, tp3].sort((a, b) => b - a);

  const rr1 = calcTradeRewardRisk(entry, stopLoss, ladder[0]!);
  if (rr1 != null && rr1 < 1) {
    warnings.push('TP1 RR 1.0 미만 — 구조 재검토 권장');
  }
  if (lock && plan.direction !== direction) {
    /* lock이면 direction 유지됨 */
  }
  if (
    (direction === 'LONG' && !(stopLoss < entry && ladder[0]! > entry)) ||
    (direction === 'SHORT' && !(stopLoss > entry && ladder[0]! < entry))
  ) {
    warnings.push('기하 재교정됨');
  }

  return {
    ...plan,
    direction,
    entry,
    stopLoss,
    tp1: ladder[0]!,
    tp2: ladder[1]!,
    tp3: ladder[2]!,
    warningsKo: warnings.slice(0, 8),
  };
}

/** 선언 방향 고정 — 롱이면 반드시 SL&lt;E&lt;TP, 숏이면 SL&gt;E&gt;TP */
export function enforceTradePlanDirectionGeometry(
  direction: 'LONG' | 'SHORT',
  entry: number,
  stopLoss: number | null | undefined,
  tp1?: number | null,
  tp2?: number | null,
  tp3?: number | null
): { entry: number; stopLoss: number; tp1: number; tp2: number; tp3: number } {
  const fixed = strengthenUnifiedDeskTradePlan(
    {
      direction,
      entry,
      stopLoss: stopLoss && stopLoss > 0 ? stopLoss : direction === 'LONG' ? entry * 0.995 : entry * 1.005,
      tp1: tp1 && tp1 > 0 ? tp1 : 0,
      tp2: tp2 && tp2 > 0 ? tp2 : 0,
      tp3: tp3 && tp3 > 0 ? tp3 : 0,
      invalidationKo: '',
      sourceKo: '超级统计기하',
      alignedWithChart: true,
      warningsKo: [],
    },
    { lockDirection: true }
  );
  return {
    entry: fixed.entry,
    stopLoss: fixed.stopLoss,
    tp1: fixed.tp1,
    tp2: fixed.tp2,
    tp3: fixed.tp3,
  };
}

export function buildMergedDeskUnifiedTradePriceLines(plan: UnifiedDeskTradePlan): AtlasPulsePriceLine[] {
  if (plan.direction === 'NEUTRAL' || plan.entry <= 0) return [];

  const sideTag = plan.direction === 'LONG' ? '▲' : '▼';
  const { entry, stopLoss, tp1, tp2, tp3 } = plan;

  const dirKo = plan.direction === 'LONG' ? '롱' : '숏';
  return [
    {
      price: entry,
      color: '#FACC15',
      title: `${sideTag}진입E·${dirKo}`,
      lineWidth: 2,
      lineStyle: 'solid',
    },
    {
      price: stopLoss,
      color: '#F87171',
      title: `${sideTag}손절SL`,
      lineWidth: 2,
      lineStyle: 'dashed',
    },
    {
      price: tp1,
      color: '#86EFAC',
      title: `${sideTag}익절TP1`,
      lineWidth: 2,
      lineStyle: 'dotted',
    },
    {
      price: tp2,
      color: '#7DD3FC',
      title: `${sideTag}익절TP2`,
      lineWidth: 2,
      lineStyle: 'dotted',
    },
    {
      price: tp3,
      color: '#A78BFA',
      title: `${sideTag}익절TP3`,
      lineWidth: 2,
      lineStyle: 'dotted',
    },
  ];
}

function railOverlay(
  id: string,
  label: string,
  tooltip: string,
  price: number,
  color: string,
  dash: string,
  lastT: number,
  tRail: number,
  labelBg: string,
  labelText: string
): OverlayItem {
  return {
    id,
    kind: 'keyLevel',
    label,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: lastT as UTCTimestamp,
    time2: tRail as UTCTimestamp,
    price1: price,
    price2: price,
    confidence: 98,
    color,
    category: 'scenario',
    lineDash: dash,
    lineStrokeWidth: 1.5,
    noProject: true,
    overlayZoneExtraClass:
      'merged-ares-level-line merged-ares-trade-rail-line merged-desk-trade-rail-unified merged-ares-mlsp-trade-label',
    labelTooltip: tooltip,
    lineLabelColor: color,
    labelTextColor: color,
  };
}

function stackedRailAnchor(
  candles: Candle[],
  timeframe: string,
  slot: number
): { lastT: number; tRail: number } {
  const n = candles.length;
  const lastT = Number(candles[n - 1]?.time);
  const baseRail = monthDeskTailLabelAnchorTime(candles, timeframe);
  const step = monthDeskBarStepMs(candles);
  const tRail = baseRail + step * slot * 0.65;
  return { lastT, tRail };
}

/** 우측 TV형 레일 — LWC 가격축과 동일 수치·단일 세트 */
export function buildMergedDeskUnifiedTradeRailOverlays(
  plan: UnifiedDeskTradePlan,
  candles: Candle[],
  timeframe?: string
): OverlayItem[] {
  if (plan.direction === 'NEUTRAL' || plan.entry <= 0 || candles.length < 2) return [];

  const tf = normalizeChartTimeframe(timeframe ?? '1h');
  const work = mergedWorkCandles(candles, tf);
  if (!Number.isFinite(Number(work[work.length - 1]?.time))) return [];

  const sideTag = plan.direction === 'LONG' ? '▲' : '▼';
  const { entry, stopLoss, tp1, tp2, tp3 } = plan;
  const src = plan.sourceKo;
  const rr1 = calcTradeRewardRisk(entry, stopLoss, tp1);
  const rr2 = calcTradeRewardRisk(entry, stopLoss, tp2);
  const rr3 = calcTradeRewardRisk(entry, stopLoss, tp3);

  const a0 = stackedRailAnchor(work, tf, 0);
  const a1 = stackedRailAnchor(work, tf, 1);
  const a2 = stackedRailAnchor(work, tf, 2);
  const a3 = stackedRailAnchor(work, tf, 3);
  const a4 = stackedRailAnchor(work, tf, 4);

  return [
    railOverlay(
      MERGED_DESK_TRADE_RAIL_IDS.entry,
      `${sideTag}E`,
      `${sideTag} ENTRY ${fmtPx(entry)} · ${src}`,
      entry,
      '#FF9800',
      '2 4',
      a0.lastT,
      a0.tRail,
      '#FF9800',
      '#FFFFFF'
    ),
    railOverlay(
      MERGED_DESK_TRADE_RAIL_IDS.sl,
      `${sideTag}SL`,
      `${sideTag} SL ${fmtPx(stopLoss)} · 무효: ${plan.invalidationKo.slice(0, 72)}`,
      stopLoss,
      '#E57373',
      '4 4',
      a1.lastT,
      a1.tRail,
      '#E57373',
      '#FFFFFF'
    ),
    railOverlay(
      MERGED_DESK_TRADE_RAIL_IDS.tp1,
      'TP1',
      `${sideTag} TP1 ${fmtPx(tp1)}${rr1 != null ? ` · RR ${rr1.toFixed(2)}` : ''} · ${src}`,
      tp1,
      '#66BB6A',
      '6 4',
      a2.lastT,
      a2.tRail,
      '#66BB6A',
      '#FFFFFF'
    ),
    railOverlay(
      MERGED_DESK_TRADE_RAIL_IDS.tp2,
      'TP2',
      `${sideTag} TP2 ${fmtPx(tp2)}${rr2 != null ? ` · RR ${rr2.toFixed(2)}` : ''}`,
      tp2,
      '#4DB6AC',
      '6 4',
      a3.lastT,
      a3.tRail,
      '#4DB6AC',
      '#FFFFFF'
    ),
    railOverlay(
      MERGED_DESK_TRADE_RAIL_IDS.tp3,
      'TP3',
      `${sideTag} TP3 ${fmtPx(tp3)}${rr3 != null ? ` · RR ${rr3.toFixed(2)}` : ''}`,
      tp3,
      '#42A5F5',
      '6 4',
      a4.lastT,
      a4.tRail,
      '#42A5F5',
      '#FFFFFF'
    ),
  ];
}

const DUPLICATE_TRADE_TARGET_ID =
  /^(merged-ares-line-(e|sl|tp[123])|merged-ares-mlsp-(entry|sl|tp[123])-line|month-desk-plan-(entry|sl|tp[123])|trade-atlas-(entry|sl|tp[123])|month-desk-typeom-(entry|sl|tp[123])|merged-desk-trade-rail-(e|sl|tp[123])|merged-desk-hotzone-rail-.+)$/;

const TRADE_HTML_LABEL_RE =
  /^(E|SL|TP[123]?|무효|▲E|▼E|ENTRY|진입|손절|익절)(\s|$|[·・.\d])/i;

/** Mirage·Strike·스윙중투 HTML 레일 중복 제거 (priceLine/LineSeries가 본선) */
export function stripDuplicateMergedDeskTradeTargetOverlays(overlays: OverlayItem[]): OverlayItem[] {
  return overlays.filter((o) => {
    const id = String(o.id || '');
    if (DUPLICATE_TRADE_TARGET_ID.test(id)) return false;
    if (/^merged-swing-mid-(e|sl|tp[123])$/.test(id)) return false;
    const extra = String(o.overlayZoneExtraClass || '');
    if (extra.includes('merged-swing-mid-rail')) return false;
    if (extra.includes('merged-desk-hotzone-rail')) return false;
    if (extra.includes('merged-ares-trade-rail-line')) return false;
    if (
      (extra.includes('merged-ares-mlsp-trade-label') ||
        extra.includes('merged-ares-trade-rail-line') ||
        extra.includes('merged-ares-level-line')) &&
      String(o.kind || '') === 'keyLevel'
    ) {
      const lab = String(o.label || '').trim();
      if (TRADE_HTML_LABEL_RE.test(lab)) return false;
      if (
        (extra.includes('merged-ares-mlsp-trade-label') ||
          extra.includes('merged-ares-trade-rail-line')) &&
        lab.length <= 8
      ) {
        return false;
      }
    }
    return true;
  });
}

export function injectMergedDeskUnifiedTradeRails(
  overlays: OverlayItem[],
  plan: UnifiedDeskTradePlan,
  candles: Candle[],
  timeframe: string
): OverlayItem[] {
  const stripped = stripDuplicateMergedDeskTradeTargetOverlays(overlays);
  if (plan.direction === 'NEUTRAL' || plan.entry <= 0) return stripped;
  return [
    ...stripped,
    ...buildMergedDeskUnifiedTradeRailOverlays(plan, candles, timeframe),
  ];
}
