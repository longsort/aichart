/**
 * ChartPrime 스타일 HTF Conviction Divergence Matrix (Pine 대응)
 * - LTF에서 RSI 피벗 → 가격 vs RSI 클래식 다이버전스
 * - HTF 봉 구간마다 LTF 체결 방향 누적(running delta)으로 고확신 필터
 * - 리본: 해당 시점 HTF 종가(프록시) > HTF 시가 → 롱 바이어스
 */
import type { Candle, OverlayItem } from '@/types';
import { rsi } from './indicators';

export type HtfConvictionMatrixParams = {
  rsiLen?: number;
  lbL?: number;
  lbR?: number;
  useVolValidation?: boolean;
};

export type HtfConvictionSignal =
  | { kind: 'bullDiv' | 'bearDiv'; barIndex: number }
  | {
      kind: 'bullPrime' | 'bearPrime';
      /** 확인 봉 인덱스 */
      barIndex: number;
      /** 이전 피벗 캔들 인덱스 → 현재 확인 봉으로 잇는 선 */
      lineFromIndex: number;
      lineToIndex: number;
      priceFrom: number;
      priceTo: number;
    };

export type HtfConvictionMatrixResult = {
  htfLabel: string;
  /** 현재 HTF 구간 OHLC (마지막 LTF 봉 기준) */
  developingHtf: { open: number; high: number; low: number; close: number };
  htfIsBullish: boolean;
  /** 바별 HTF 바이어스 (close > open of HTF period) */
  ribbon: boolean[];
  runningDelta: number[];
  signals: HtfConvictionSignal[];
};

const BULL = 'rgba(30,218,127,0.9)';
const BEAR = 'rgba(137,39,218,0.9)';
const NEUTRAL = 'rgba(120,123,134,0.85)';
const ACCENT = 'rgba(91,156,246,0.9)';

export { BULL as HTF_CP_BULL, BEAR as HTF_CP_BEAR, NEUTRAL as HTF_CP_NEUTRAL, ACCENT as HTF_CP_ACCENT };

function findHtfIndexForTime(t: number, htf: Candle[]): number {
  let lo = 0;
  let hi = htf.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (htf[mid]!.time <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function pivotLowRsi(rsiArr: number[], i: number, L: number, R: number): boolean {
  if (i < L || i + R >= rsiArr.length) return false;
  const v = rsiArr[i]!;
  for (let j = i - L; j <= i + R; j++) {
    if (j !== i && rsiArr[j]! < v) return false;
  }
  return true;
}

function pivotHighRsi(rsiArr: number[], i: number, L: number, R: number): boolean {
  if (i < L || i + R >= rsiArr.length) return false;
  const v = rsiArr[i]!;
  for (let j = i - L; j <= i + R; j++) {
    if (j !== i && rsiArr[j]! > v) return false;
  }
  return true;
}

/**
 * HTF 캔들 시계열 + 메인 TF(LTF) 캔들로 매트릭스 계산
 */
export function computeHtfConvictionDivergenceMatrix(
  ltf: Candle[],
  htf: Candle[] | null | undefined,
  htfLabel: string,
  params?: HtfConvictionMatrixParams
): HtfConvictionMatrixResult | null {
  if (!htf?.length || ltf.length < 20) return null;

  const rsiLen = params?.rsiLen ?? 14;
  const lbL = params?.lbL ?? 5;
  const lbR = params?.lbR ?? 5;
  const useVolValidation = params?.useVolValidation !== false;

  const rsiArr = rsi(ltf, rsiLen);
  const n = ltf.length;

  let curHtfIdx = -1;
  let aggHigh = 0;
  let aggLow = 0;
  const hOpenArr: number[] = [];
  const hHighArr: number[] = [];
  const hLowArr: number[] = [];
  const hCloseArr: number[] = [];
  const ribbon: boolean[] = [];
  const runningDelta: number[] = [];

  let prevHtfForDelta = -1;
  let runD = 0;

  for (let i = 0; i < n; i++) {
    const c = ltf[i]!;
    const hi = findHtfIndexForTime(c.time, htf);
    if (hi < 0) {
      hOpenArr.push(c.open);
      hHighArr.push(c.high);
      hLowArr.push(c.low);
      hCloseArr.push(c.close);
      ribbon.push(true);
      runningDelta.push(0);
      continue;
    }
    const ho = htf[hi]!.open;
    if (hi !== curHtfIdx) {
      curHtfIdx = hi;
      aggHigh = c.high;
      aggLow = c.low;
    } else {
      aggHigh = Math.max(aggHigh, c.high);
      aggLow = Math.min(aggLow, c.low);
    }
    hOpenArr.push(ho);
    hHighArr.push(aggHigh);
    hLowArr.push(aggLow);
    hCloseArr.push(c.close);
    ribbon.push(c.close > ho);

    const signed = c.close > c.open ? c.volume : c.close < c.open ? -c.volume : 0;
    if (hi !== prevHtfForDelta) {
      runD = signed;
      prevHtfForDelta = hi;
    } else {
      runD += signed;
    }
    runningDelta.push(runD);
  }

  const last = n - 1;
  const developingHtf = {
    open: hOpenArr[last]!,
    high: hHighArr[last]!,
    low: hLowArr[last]!,
    close: hCloseArr[last]!,
  };
  const htfIsBullish = developingHtf.close > developingHtf.open;

  let plPriceMem: number | null = null;
  let plRsiMem: number | null = null;
  let plDeltaMem: number | null = null;
  let plIndexMem: number | null = null;

  let phPriceMem: number | null = null;
  let phRsiMem: number | null = null;
  let phDeltaMem: number | null = null;
  let phIndexMem: number | null = null;

  const signals: HtfConvictionSignal[] = [];

  for (let c = lbL + lbR; c < n; c++) {
    const p = c - lbR;
    if (p < lbL || p + lbR >= n) continue;

    if (pivotLowRsi(rsiArr, p, lbL, lbR)) {
      const plRsiVal = rsiArr[p]!;
      const lowP = ltf[p]!.low;
      if (plPriceMem != null && plRsiMem != null && plRsiVal > plRsiMem && lowP < plPriceMem) {
        signals.push({ kind: 'bullDiv', barIndex: c });
        let bullPrime = false;
        if (useVolValidation && plDeltaMem != null && runningDelta[c]! > plDeltaMem) {
          bullPrime = true;
        }
        if (bullPrime && plIndexMem != null) {
          signals.push({
            kind: 'bullPrime',
            barIndex: c,
            lineFromIndex: plIndexMem,
            lineToIndex: c,
            priceFrom: plPriceMem,
            priceTo: ltf[c]!.low,
          });
        }
      }
      plPriceMem = lowP;
      plRsiMem = plRsiVal;
      plDeltaMem = runningDelta[c]!;
      plIndexMem = p;
    }

    if (pivotHighRsi(rsiArr, p, lbL, lbR)) {
      const phRsiVal = rsiArr[p]!;
      const highP = ltf[p]!.high;
      if (phPriceMem != null && phRsiMem != null && phRsiVal < phRsiMem && highP > phPriceMem) {
        signals.push({ kind: 'bearDiv', barIndex: c });
        let bearPrime = false;
        if (useVolValidation && phDeltaMem != null && runningDelta[c]! < phDeltaMem) {
          bearPrime = true;
        }
        if (bearPrime && phIndexMem != null) {
          signals.push({
            kind: 'bearPrime',
            barIndex: c,
            lineFromIndex: phIndexMem,
            lineToIndex: c,
            priceFrom: phPriceMem,
            priceTo: ltf[c]!.high,
          });
        }
      }
      phPriceMem = highP;
      phRsiMem = phRsiVal;
      phDeltaMem = runningDelta[c]!;
      phIndexMem = p;
    }
  }

  return {
    htfLabel,
    developingHtf,
    htfIsBullish,
    ribbon,
    runningDelta,
    signals,
  };
}

/**
 * 차트 오버레이: HTF OHLC 라인, PO3 투영, 다이버/고확신 마커
 */
export function buildHtfConvictionOverlays(
  matrix: HtfConvictionMatrixResult,
  visible: Candle[],
  min: number,
  max: number,
  toRatio: (price: number, mn: number, mx: number) => number
): OverlayItem[] {
  const n = visible.length;
  if (n < 2) return [];
  const lastI = n - 1;
  const norm = (idx: number) => Math.max(0, Math.min(idx, lastI)) / Math.max(1, lastI);
  const { developingHtf: h, htfLabel, htfIsBullish, signals } = matrix;
  const po3Col = htfIsBullish ? BULL : BEAR;
  const out: OverlayItem[] = [];

  out.push({
    id: 'htf-cp-ho',
    kind: 'keyLevel',
    label: 'H-O',
    x1: 0.02,
    y1: toRatio(h.open, min, max),
    x2: 0.98,
    y2: toRatio(h.open, min, max),
    confidence: 88,
    color: NEUTRAL,
    lineDash: '6 4',
    category: 'structure',
  });
  out.push({
    id: 'htf-cp-hh',
    kind: 'keyLevel',
    label: 'H-H',
    x1: 0.02,
    y1: toRatio(h.high, min, max),
    x2: 0.98,
    y2: toRatio(h.high, min, max),
    confidence: 88,
    color: BULL,
    lineDash: '2 4',
    category: 'structure',
  });
  out.push({
    id: 'htf-cp-hl',
    kind: 'keyLevel',
    label: 'H-L',
    x1: 0.02,
    y1: toRatio(h.low, min, max),
    x2: 0.98,
    y2: toRatio(h.low, min, max),
    confidence: 88,
    color: BEAR,
    lineDash: '2 4',
    category: 'structure',
  });
  out.push({
    id: 'htf-cp-hc',
    kind: 'keyLevel',
    label: 'H-C',
    x1: 0.02,
    y1: toRatio(h.close, min, max),
    x2: 0.98,
    y2: toRatio(h.close, min, max),
    confidence: 88,
    color: ACCENT,
    category: 'structure',
  });

  const top = Math.max(h.open, h.close);
  const bot = Math.min(h.open, h.close);
  const midX = 0.955;
  const xL = 0.93;
  const xR = 0.992;
  out.push({
    id: 'htf-cp-po3-body',
    kind: 'zone',
    label: `HTF: ${htfLabel}`,
    x1: xL,
    y1: toRatio(top, min, max),
    x2: xR,
    y2: toRatio(bot, min, max),
    price1: top,
    price2: bot,
    confidence: 80,
    color: po3Col.replace('0.9)', '0.35)'),
    lineLabelColor: po3Col,
    category: 'structure',
  });
  out.push({
    id: 'htf-cp-po3-wick',
    kind: 'trendLine',
    label: '',
    x1: midX,
    y1: toRatio(h.high, min, max),
    x2: midX,
    y2: toRatio(h.low, min, max),
    confidence: 80,
    color: po3Col,
    lineStrokeWidth: 2,
    category: 'structure',
  });

  for (let i = 0; i < signals.length; i++) {
    const s = signals[i]!;
    if (s.kind === 'bullDiv') {
      out.push({
        id: `htf-cp-bdiv-${s.barIndex}-${i}`,
        kind: 'label',
        label: '▲',
        x1: norm(s.barIndex),
        y1: toRatio(visible[s.barIndex]!.low, min, max),
        confidence: 72,
        color: BULL,
        category: 'rsi',
      });
    } else if (s.kind === 'bearDiv') {
      out.push({
        id: `htf-cp-sdiv-${s.barIndex}-${i}`,
        kind: 'label',
        label: '▼',
        x1: norm(s.barIndex),
        y1: toRatio(visible[s.barIndex]!.high, min, max),
        confidence: 72,
        color: BEAR,
        category: 'rsi',
      });
    } else if (s.kind === 'bullPrime') {
      out.push({
        id: `htf-cp-bprime-line-${i}`,
        kind: 'rsiDivergenceLine',
        label: '',
        x1: norm(s.lineFromIndex),
        y1: toRatio(s.priceFrom, min, max),
        x2: norm(s.lineToIndex),
        y2: toRatio(s.priceTo, min, max),
        time1: visible[s.lineFromIndex]?.time,
        time2: visible[s.lineToIndex]?.time,
        price1: s.priceFrom,
        price2: s.priceTo,
        confidence: 94,
        color: BULL,
        lineStrokeWidth: 2,
        category: 'rsi',
      });
      out.push({
        id: `htf-cp-bprime-lbl-${i}`,
        kind: 'label',
        label: '고확신 · 상승 다이버',
        x1: norm(s.barIndex),
        y1: toRatio(visible[s.barIndex]!.low, min, max),
        confidence: 94,
        color: BULL,
        category: 'rsi',
      });
    } else if (s.kind === 'bearPrime') {
      out.push({
        id: `htf-cp-sprime-line-${i}`,
        kind: 'rsiDivergenceLine',
        label: '',
        x1: norm(s.lineFromIndex),
        y1: toRatio(s.priceFrom, min, max),
        x2: norm(s.lineToIndex),
        y2: toRatio(s.priceTo, min, max),
        time1: visible[s.lineFromIndex]?.time,
        time2: visible[s.lineToIndex]?.time,
        price1: s.priceFrom,
        price2: s.priceTo,
        confidence: 94,
        color: BEAR,
        lineStrokeWidth: 2,
        category: 'rsi',
      });
      out.push({
        id: `htf-cp-sprime-lbl-${i}`,
        kind: 'label',
        label: '고확신 · 하락 다이버',
        x1: norm(s.barIndex),
        y1: toRatio(visible[s.barIndex]!.high, min, max),
        confidence: 94,
        color: BEAR,
        category: 'rsi',
      });
    }
  }

  return out;
}
