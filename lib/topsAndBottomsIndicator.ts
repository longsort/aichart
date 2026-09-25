/**
 * TradingView "Tops And Bottoms" (Jwolshi) — 피벗 + RSI·거래량 필터.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { rsi } from '@/lib/indicators';

export type TopsBottomsOptions = {
  leftBars: number;
  rightBars: number;
  useRSI: boolean;
  rsiLen: number;
  rsiOBLevel: number;
  rsiOSLevel: number;
  useVol: boolean;
  volLen: number;
  volMult: number;
};

export type TopsBottomsPivot = {
  kind: 'top' | 'bottom';
  index: number;
  time: number;
  price: number;
  rsi: number;
  /** RSI·거래량 필터 통과 (Pine isTop / isBottom) */
  precision: boolean;
};

export const DEFAULT_TOPS_BOTTOMS_OPTIONS: TopsBottomsOptions = {
  leftBars: 5,
  rightBars: 5,
  useRSI: true,
  rsiLen: 14,
  rsiOBLevel: 66,
  rsiOSLevel: 32,
  useVol: false,
  volLen: 20,
  volMult: 1.3,
};

function pivotLow(candles: Candle[], i: number, L: number, R: number): boolean {
  const lo = candles[i]!.low;
  for (let j = i - L; j < i; j++) {
    if (j < 0 || candles[j]!.low <= lo) return false;
  }
  for (let j = i + 1; j <= i + R; j++) {
    if (j >= candles.length || candles[j]!.low < lo) return false;
  }
  return true;
}

function pivotHigh(candles: Candle[], i: number, L: number, R: number): boolean {
  const hi = candles[i]!.high;
  for (let j = i - L; j < i; j++) {
    if (j < 0 || candles[j]!.high >= hi) return false;
  }
  for (let j = i + 1; j <= i + R; j++) {
    if (j >= candles.length || candles[j]!.high > hi) return false;
  }
  return true;
}

function volSma(candles: Candle[], endIdx: number, len: number): number {
  const start = Math.max(0, endIdx - len + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= endIdx; i++) {
    sum += candles[i]!.volume > 0 ? candles[i]!.volume : 0;
    n++;
  }
  return n > 0 ? sum / n : 0;
}

/** TF별 피벗 폭 — 주봉·월봉은 Pine 기본(5/5), 단기 TF는 약간 축소 */
export function topsBottomsOptionsForTimeframe(timeframe?: string): TopsBottomsOptions {
  const tf = normalizeChartTimeframe(timeframe ?? '1h');
  const base = { ...DEFAULT_TOPS_BOTTOMS_OPTIONS };
  if (tf === '1w' || tf === '1M' || tf === '1Y') return base;
  if (tf === '1d') return { ...base, leftBars: 5, rightBars: 5 };
  if (tf === '4h') return { ...base, leftBars: 4, rightBars: 4 };
  if (tf === '1h') return { ...base, leftBars: 4, rightBars: 4 };
  if (tf === '15m' || tf === '5m') return { ...base, leftBars: 3, rightBars: 3 };
  return { ...base, leftBars: 3, rightBars: 3 };
}

/** 확정 피벗 — Pine: bar_index - rightBars 에 피벗, rightBars 후 신호 */
export function detectTopsAndBottoms(
  candles: Candle[],
  optsIn?: Partial<TopsBottomsOptions>
): TopsBottomsPivot[] {
  const opts: TopsBottomsOptions = { ...DEFAULT_TOPS_BOTTOMS_OPTIONS, ...optsIn };
  const n = candles.length;
  const L = opts.leftBars;
  const R = opts.rightBars;
  if (n < L + R + 2) return [];

  const rsiVals = rsi(candles, opts.rsiLen);
  const out: TopsBottomsPivot[] = [];

  for (let pivotIdx = L; pivotIdx <= n - R - 1; pivotIdx++) {
    const rsiAtPivot = rsiVals[pivotIdx] ?? 50;
    const volAtPivot = candles[pivotIdx]!.volume;
    const avgVol = volSma(candles, pivotIdx, opts.volLen);
    const volOK = !opts.useVol || (avgVol > 0 && volAtPivot >= avgVol * opts.volMult);

    if (pivotHigh(candles, pivotIdx, L, R)) {
      const price = candles[pivotIdx]!.high;
      const rsiTopOK = !opts.useRSI || rsiAtPivot >= opts.rsiOBLevel;
      out.push({
        kind: 'top',
        index: pivotIdx,
        time: Number(candles[pivotIdx]!.time),
        price,
        rsi: rsiAtPivot,
        precision: rsiTopOK && volOK,
      });
    }

    if (pivotLow(candles, pivotIdx, L, R)) {
      const price = candles[pivotIdx]!.low;
      const rsiBottomOK = !opts.useRSI || rsiAtPivot <= opts.rsiOSLevel;
      out.push({
        kind: 'bottom',
        index: pivotIdx,
        time: Number(candles[pivotIdx]!.time),
        price,
        rsi: rsiAtPivot,
        precision: rsiBottomOK && volOK,
      });
    }
  }

  return out;
}

export type TopsBottomsScanRow = {
  symbol: string;
  price: number;
  signal: 'TOP' | 'BOT' | 'NEAR_TOP' | 'NEAR_BOT' | 'NEUTRAL';
  lastPrecisionTop: { price: number; time: number; rsi: number } | null;
  lastPrecisionBottom: { price: number; time: number; rsi: number } | null;
  distanceToTopPct: number | null;
  distanceToBottomPct: number | null;
  summaryKo: string;
};

function fmtPx(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return p.toFixed(1);
  if (a >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

/** 심볼 1개 — 최근 precision TOP/BOT + 현재가 근접 */
export function summarizeTopsBottomsForSymbol(
  symbol: string,
  candles: Candle[],
  timeframe?: string,
  nearPct = 2.5
): TopsBottomsScanRow {
  const opts = topsBottomsOptionsForTimeframe(timeframe);
  const pivots = detectTopsAndBottoms(candles, opts);
  const price = candles[candles.length - 1]?.close ?? 0;
  const precision = pivots.filter((p) => p.precision);
  const tops = precision.filter((p) => p.kind === 'top');
  const bots = precision.filter((p) => p.kind === 'bottom');
  const lastTop = tops.length ? tops[tops.length - 1]! : null;
  const lastBot = bots.length ? bots[bots.length - 1]! : null;

  let signal: TopsBottomsScanRow['signal'] = 'NEUTRAL';
  let distanceToTopPct: number | null = null;
  let distanceToBottomPct: number | null = null;

  if (price > 0 && lastTop) {
    distanceToTopPct = ((lastTop.price - price) / price) * 100;
    if (Math.abs(distanceToTopPct) <= nearPct && distanceToTopPct >= -nearPct * 0.4) {
      signal = 'NEAR_TOP';
    }
  }
  if (price > 0 && lastBot) {
    distanceToBottomPct = ((price - lastBot.price) / price) * 100;
    if (Math.abs(distanceToBottomPct) <= nearPct && distanceToBottomPct >= -nearPct * 0.4) {
      signal = signal === 'NEAR_TOP' ? 'NEUTRAL' : 'NEAR_BOT';
    }
  }

  const recentWindow = Math.max(3, opts.rightBars + 1);
  const recentPivots = pivots.filter((p) => p.index >= candles.length - recentWindow - opts.rightBars);
  const freshTop = recentPivots.find((p) => p.kind === 'top' && p.precision);
  const freshBot = recentPivots.find((p) => p.kind === 'bottom' && p.precision);
  if (freshTop) signal = 'TOP';
  else if (freshBot) signal = 'BOT';

  const parts: string[] = [];
  if (lastTop) parts.push(`TOP ${fmtPx(lastTop.price)} RSI${lastTop.rsi.toFixed(0)}`);
  if (lastBot) parts.push(`BOT ${fmtPx(lastBot.price)} RSI${lastBot.rsi.toFixed(0)}`);
  const summaryKo =
    parts.length > 0
      ? parts.join(' · ')
      : pivots.length
        ? `피벗 ${pivots.length} — RSI필터 대기`
        : '피벗 없음';

  return {
    symbol,
    price,
    signal,
    lastPrecisionTop: lastTop
      ? { price: lastTop.price, time: lastTop.time, rsi: lastTop.rsi }
      : null,
    lastPrecisionBottom: lastBot
      ? { price: lastBot.price, time: lastBot.time, rsi: lastBot.rsi }
      : null,
    distanceToTopPct,
    distanceToBottomPct,
    summaryKo,
  };
}
