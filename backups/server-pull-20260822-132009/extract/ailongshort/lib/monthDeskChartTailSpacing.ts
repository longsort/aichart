/**
 * 마감·안착 — 마지막 캔들과 우측 라벨(E·SL·TP) 사이 여백.
 */
import type { Candle, OverlayItem } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { MERGED_DESK_RIGHT_FUTURE_BARS } from '@/lib/mergedDeskSharedChartView';
import { isMonthDeskChartHtf } from '@/lib/monthDeskChartTidy';

export function monthDeskBarStepMs(candles: Candle[]): number {
  const n = candles.length;
  if (n < 2) return 86_400_000;
  const d = Number(candles[n - 1]!.time) - Number(candles[n - 2]!.time);
  return Number.isFinite(d) && d > 0 ? d : 86_400_000;
}

/** 플랜 가로선·라벨 앵커가 끝나는 시각(마지막 봉 이후 N봉) */
export function monthDeskTailLabelAnchorTime(candles: Candle[], timeframe: string): number {
  const n = candles.length;
  const lastT = Number(candles[n - 1]!.time);
  if (!Number.isFinite(lastT)) return lastT;
  const step = monthDeskBarStepMs(candles);
  const tf = normalizeChartTimeframe(timeframe);
  let extra = isMonthDeskChartHtf(timeframe) ? 5 : 8;
  if (tf === '1w' || tf === '1d' || tf === '1M') extra += 2;
  if (tf === '1m' || tf === '3m' || tf === '5m') extra = Math.min(14, extra + 4);
  return lastT + step * extra;
}

/** 정규화 x2 — 차트 우측 라벨 밴드용 */
export function monthDeskTailLabelAnchorXNorm(candles: Candle[], timeframe: string): number {
  const n = candles.length;
  const denom = Math.max(1, n - 1);
  const step = monthDeskBarStepMs(candles);
  const lastT = Number(candles[n - 1]!.time);
  const anchorT = monthDeskTailLabelAnchorTime(candles, timeframe);
  const extraBars = Math.max(1, Math.round((anchorT - lastT) / step));
  return Math.min(1.14, (n - 1 + extraBars) / denom);
}

const PLAN_LINE_ID_RE =
  /^(month-desk-plan-|trade-atlas-(entry|sl|tp)|month-desk-core-long-(entry|sl|bounce|liq))/;

const MERGED_ARES_TRADE_LINE_ID_RE = /^merged-ares-line-(e|sl|tp[123])$/;

/** E·SL·TP·Atlas 가로선을 마지막 봉 오른쪽까지 연장 — 라벨이 캔들 위에 겹치지 않게 */
export function extendMonthDeskHorizontalPlanLines(
  items: OverlayItem[],
  candles: Candle[],
  timeframe: string
): OverlayItem[] {
  if (candles.length < 4) return items;
  const tLabel = monthDeskTailLabelAnchorTime(candles, timeframe);
  const xEnd = monthDeskTailLabelAnchorXNorm(candles, timeframe);

  return items.map((raw) => {
    const id = String(raw.id || '');
    if (!PLAN_LINE_ID_RE.test(id)) return raw;
    const kind = String(raw.kind || '');
    if (kind !== 'keyLevel' && kind !== 'supportLine' && kind !== 'resistanceLine') return raw;
    return {
      ...raw,
      time2: tLabel,
      x2: xEnd,
      label: '',
    };
  });
}

/** 통합·분석 — 마지막 봉 + 예측 여백(~20봉) 시각/정규화 x */
export function mergedDeskFuturePadAnchorTime(candles: Candle[]): number {
  const n = candles.length;
  const lastT = Number(candles[n - 1]?.time);
  if (!Number.isFinite(lastT)) return lastT;
  return lastT + monthDeskBarStepMs(candles) * MERGED_DESK_RIGHT_FUTURE_BARS;
}

export function mergedDeskFuturePadAnchorXNorm(candles: Candle[]): number {
  const n = candles.length;
  const denom = Math.max(1, n - 1);
  return Math.min(1.28, (n - 1 + MERGED_DESK_RIGHT_FUTURE_BARS) / denom);
}

/** 통합·분석 E/SL/TP — 마지막 봉 우측 빈 축 가로 점선 (대각 투영 방지) */
export function extendMergedAresHorizontalTradeLines(
  items: OverlayItem[],
  candles: Candle[],
  timeframe: string
): OverlayItem[] {
  if (candles.length < 2) return items;
  const work = candles;
  const lastT = Number(work[work.length - 1]?.time);
  const tLabel = mergedDeskFuturePadAnchorTime(work);
  const xEnd = mergedDeskFuturePadAnchorXNorm(work);
  if (!Number.isFinite(lastT)) return items;

  return items.map((raw) => {
    const id = String(raw.id || '');
    if (!MERGED_ARES_TRADE_LINE_ID_RE.test(id)) return raw;
    if (String(raw.kind || '') !== 'keyLevel') return raw;
    const price = raw.price1;
    if (typeof price !== 'number' || !Number.isFinite(price)) return raw;
    return {
      ...raw,
      time1: lastT,
      time2: tLabel,
      x2: xEnd,
      price2: price,
      noProject: true,
      label: '',
      overlayZoneExtraClass: [String(raw.overlayZoneExtraClass || ''), 'merged-ares-trade-rail-line']
        .filter(Boolean)
        .join(' '),
    };
  });
}

/** 우측 HTML 라벨 밴드 — 점선 끝 X에 추가 픽셀 여백 */
export function monthDeskDottedLineRightXWithGap(anchorX: number, chartWidth: number): number {
  if (!Number.isFinite(anchorX) || anchorX <= 0) return Math.max(0, chartWidth * 0.9);
  const gap = Math.min(96, Math.max(28, chartWidth * 0.045));
  return Math.min(chartWidth - 8, anchorX + gap);
}
