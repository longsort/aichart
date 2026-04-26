import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import { candleBarDurationSec } from '@/lib/candleTfDuration';

const WAVE_MARKERS = ['①', '②', '③', '④', '⑤', '⑥'];
/** 스케치에 n개 피벗이 있으면 다음 예측 꼭짓점 번호(①=1번 … ⑦=7번) */
const NEXT_PIVOT_MARK = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'] as const;

function pivotHigh(candles: Candle[], i: number, L: number, R: number): boolean {
  const h = candles[i].high;
  for (let k = i - L; k <= i + R; k++) {
    if (k === i || k < 0 || k >= candles.length) continue;
    if (candles[k].high >= h) return false;
  }
  return true;
}

function pivotLow(candles: Candle[], i: number, L: number, R: number): boolean {
  const lo = candles[i].low;
  for (let k = i - L; k <= i + R; k++) {
    if (k === i || k < 0 || k >= candles.length) continue;
    if (candles[k].low <= lo) return false;
  }
  return true;
}

export type ZigzagPivot = { idx: number; time: number; price: number; isHigh: boolean };

/** 좌·우 N봉 스윙 고저 — 치트시트용 단순 지그재그 (left/right↑ 시 꼭짓점이 봉에 더 딱 붙음) */
export function detectZigzagPivots(candles: Candle[], left = 3, right = 3): ZigzagPivot[] {
  if (candles.length < left + right + 3) return [];
  const raw: ZigzagPivot[] = [];
  for (let i = left; i < candles.length - right; i++) {
    if (pivotHigh(candles, i, left, right)) {
      raw.push({ idx: i, time: candles[i].time as number, price: candles[i].high, isHigh: true });
    } else if (pivotLow(candles, i, left, right)) {
      raw.push({ idx: i, time: candles[i].time as number, price: candles[i].low, isHigh: false });
    }
  }
  raw.sort((a, b) => a.idx - b.idx);
  const merged: ZigzagPivot[] = [];
  for (const p of raw) {
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push(p);
      continue;
    }
    if (prev.isHigh === p.isHigh) {
      if (p.isHigh) {
        if (p.price >= prev.price) merged[merged.length - 1] = p;
      } else if (p.price <= prev.price) {
        merged[merged.length - 1] = p;
      }
    } else {
      merged.push(p);
    }
  }
  return merged;
}

function recentAtrProxy(candles: Candle[], look = 10): number {
  const n = candles.length;
  if (n < 1) return 0;
  const from = Math.max(1, n - look);
  let sum = 0;
  let count = 0;
  for (let i = from; i < n; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    sum += tr;
    count++;
  }
  return count > 0 ? sum / count : Math.max(1e-12, candles[n - 1].high - candles[n - 1].low);
}

/** 마지막 피벗 이후 ‘다음 스윙’이 목표 대비 충분히 진행됐는지 → 마감이면 방향만, 미마감이면 다음 경로 점선 */
function isElliottWaveLegClosed(
  candles: Candle[],
  lastPivot: ZigzagPivot,
  prevPivot: ZigzagPivot,
  delta: number,
  avgGapBars: number
): { closed: boolean; progress: number } {
  const n = candles.length;
  const j0 = lastPivot.idx;
  let minLow = lastPivot.price;
  let maxHigh = lastPivot.price;
  for (let i = j0; i < n; i++) {
    minLow = Math.min(minLow, candles[i].low);
    maxHigh = Math.max(maxHigh, candles[i].high);
  }
  const barsSince = n - 1 - j0;
  const goalFromPivot = lastPivot.isHigh ? lastPivot.price - delta : lastPivot.price + delta;

  const pivotBroken =
    (lastPivot.isHigh && maxHigh > lastPivot.price + 1e-10) ||
    (!lastPivot.isHigh && minLow < lastPivot.price - 1e-10);

  if (pivotBroken) {
    return { closed: false, progress: 0 };
  }

  let progress = 0;
  if (lastPivot.isHigh) {
    const range = lastPivot.price - goalFromPivot;
    if (range < 1e-12) return { closed: false, progress: 0 };
    progress = (lastPivot.price - minLow) / range;
  } else {
    const range = goalFromPivot - lastPivot.price;
    if (range < 1e-12) return { closed: false, progress: 0 };
    progress = (maxHigh - lastPivot.price) / range;
  }
  progress = Math.max(0, Math.min(1.35, progress));

  const timeChopClose = barsSince > Math.max(10, avgGapBars * 2.4);
  const levelClose = progress >= 0.7;
  const closed = timeChopClose || levelClose;

  return { closed, progress };
}

/**
 * 엘리엇 치트시트 스타일 MVP (휴리스틱):
 * - 최근 스윙 5~6점을 잇는 파동 스케치(검증·카운트 아님)
 * - **미마감**: 마지막 확정 피벗(치트시트 5번 꼭짓점) → 다음(6·7…) 예측 가격·시간까지 점선만(끝에서 끊김, 무한 연장 없음)
 * - **마감**: 경로 숨기고 직전 스윙 방향만 「상승 방향」/「하락 방향」(마지막 피벗까지 온 leg 기준)
 * - 최근 구간 50~0.618 되돌림 띠(방향은 verdict 기준)
 */
export function buildCandleAnalysisElliottMvpOverlays(
  candles: Candle[],
  analysis: AnalyzeResponse | null | undefined,
  timeframe?: string
): OverlayItem[] {
  if (!candles.length || candles.length < 25 || !analysis) return [];

  const pivots = detectZigzagPivots(candles, 3, 3);
  if (pivots.length < 4) return [];

  const take = Math.min(6, pivots.length);
  const seq = pivots.slice(-take);

  const out: OverlayItem[] = [];
  const lineColor = 'rgba(147,197,253,0.92)';
  const lineDash = '5 4';

  for (let i = 0; i < seq.length - 1; i++) {
    const a = seq[i];
    const b = seq[i + 1];
    out.push({
      id: `candle-analysis-elliott-seg-${i}`,
      kind: 'trendLine',
      label: i === 0 ? '파동(추정)' : '',
      x1: 0,
      y1: 0,
      time1: a.time,
      price1: a.price,
      time2: b.time,
      price2: b.price,
      confidence: 55,
      color: lineColor,
      lineDash,
      lineStrokeWidth: 1.5,
      category: 'labels',
      /** 피벗–피벗 구간만 표시 — ChartView 비-tap 추세선 기본이 우측 외삽이라 noProject + 렌더 분기 필요 */
      noProject: true,
    });
  }

  const lastBar = candles[candles.length - 1];
  const tNow = Number(lastBar.time);
  const tf = timeframe ?? analysis.timeframe ?? '1h';
  const barSec = candleBarDurationSec(tf, tNow);
  let sumGap = 0;
  for (let k = 1; k < seq.length; k++) {
    sumGap += seq[k].idx - seq[k - 1].idx;
  }
  const avgGapBars = seq.length > 1 ? sumGap / (seq.length - 1) : 8;
  const barsAhead = Math.max(5, Math.min(28, Math.round(avgGapBars * 1.05)));
  const lastPivot = seq[seq.length - 1];
  const prevPivot = seq[seq.length - 2];
  const leg = Math.abs(lastPivot.price - prevPivot.price);
  const atr = recentAtrProxy(candles, 12);
  const delta = Math.max(leg * 0.58, atr * 1.15, Math.abs(lastBar.high - lastBar.low) * 0.9, lastBar.close * 3e-5);

  let nextUp: boolean;
  if (analysis.verdict === 'LONG') nextUp = true;
  else if (analysis.verdict === 'SHORT') nextUp = false;
  else nextUp = !lastPivot.isHigh;

  /** 다음 꼭짓점(⑥ 등) 가격 — 마지막 확정 피벗 기준(5→6 치트시트와 동일) */
  const pivotTargetP = lastPivot.price + (nextUp ? delta : -delta);
  const tPivot = Number(lastPivot.time);
  const timeAtNextPivot = tPivot + barsAhead * barSec;
  const nextPivotMark = NEXT_PIVOT_MARK[Math.min(seq.length, NEXT_PIVOT_MARK.length - 1)] ?? '⑦';

  const { closed: legClosed } = isElliottWaveLegClosed(candles, lastPivot, prevPivot, delta, avgGapBars);
  const completedLegUp = lastPivot.price > prevPivot.price;
  const dirLabel = completedLegUp ? '상승 방향' : '하락 방향';
  const dirColor = completedLegUp ? 'rgba(74,222,128,0.95)' : 'rgba(248,113,113,0.95)';

  const nextColor = 'rgba(226,232,240,0.9)';
  const nextDash = '3 5';

  if (legClosed) {
    out.push({
      id: 'candle-analysis-elliott-dir',
      kind: 'label',
      label: dirLabel,
      x1: 0,
      y1: 0,
      time1: tNow,
      price1: lastBar.close,
      confidence: 52,
      color: dirColor,
      labelBackgroundColor: 'rgba(8,15,25,0.72)',
      category: 'labels',
    });
  } else {
    out.push({
      id: 'candle-analysis-elliott-next',
      kind: 'trendLine',
      label: `다음 ${nextPivotMark}(추정)`,
      x1: 0,
      y1: 0,
      time1: tPivot,
      price1: lastPivot.price,
      time2: timeAtNextPivot,
      price2: pivotTargetP,
      confidence: 48,
      color: nextColor,
      lineDash: nextDash,
      lineStrokeWidth: 1.65,
      category: 'labels',
      noProject: true,
    });
    out.push({
      id: 'candle-analysis-elliott-next-target',
      kind: 'label',
      label: `${nextPivotMark} 추정`,
      x1: 0,
      y1: 0,
      time1: timeAtNextPivot,
      price1: pivotTargetP,
      confidence: 45,
      color: nextColor,
      category: 'labels',
    });
  }

  seq.forEach((p, i) => {
    const mark = WAVE_MARKERS[Math.min(i, WAVE_MARKERS.length - 1)];
    out.push({
      id: `candle-analysis-elliott-lbl-${p.idx}-${i}`,
      kind: 'label',
      label: mark,
      x1: 0,
      y1: 0,
      time1: p.time,
      price1: p.price,
      confidence: 60,
      color: '#93c5fd',
      category: 'labels',
    });
  });

  const look = Math.min(80, candles.length);
  const slice = candles.slice(-look);
  const hi = Math.max(...slice.map((c) => c.high));
  const lo = Math.min(...slice.map((c) => c.low));
  const range = hi - lo;
  if (range <= 0) return out;

  const isLong = analysis.verdict !== 'SHORT';
  let zTop: number;
  let zBot: number;
  if (isLong) {
    zTop = hi - 0.5 * range;
    zBot = hi - 0.618 * range;
  } else {
    zBot = lo + 0.5 * range;
    zTop = lo + 0.618 * range;
  }
  if (zTop < zBot) [zTop, zBot] = [zBot, zTop];

  const t1 = candles[0].time as number;
  const t2 = candles[candles.length - 1].time as number;
  out.push({
    id: 'candle-analysis-fib-pocket',
    kind: 'zone',
    label: '피보 되돌림 50~61.8%',
    confidence: 58,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: t1,
    time2: t2,
    price1: zTop,
    price2: zBot,
    color: 'rgba(167,139,250,0.07)',
    lineLabelColor: '#c4b5fd',
    category: 'labels',
  });

  return out;
}

export function hasCandleAnalysisElliottSketch(candles: Candle[], analysis: AnalyzeResponse | null | undefined): boolean {
  return buildCandleAnalysisElliottMvpOverlays(candles, analysis).some((o) => o.id.startsWith('candle-analysis-elliott-seg-'));
}
