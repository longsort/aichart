import type { Candle } from '@/types';
import { wadBuyVolume, wadSellVolume } from '@/lib/volumeHistogramIntelligence';

export type VolumeShockEventSide = 'bull' | 'bear' | 'buy' | 'sell';

export type VolumeShockUsdBand = {
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
};

export type VolumeShockHorizonStat = {
  bars: number;
  probRebound: number;
  probReboundT03: number;
  probReboundT07: number;
  probDownFollow: number;
  /** bull/buy → 상승, bear/sell → 하락 비율 */
  probFavorable: number;
  meanPct: number;
  medianPct: number;
  medianMoveUsd: number | null;
  meanMoveUsd: number | null;
  usdBand: VolumeShockUsdBand | null;
};

export type VolumeShockStat = {
  eventSide: VolumeShockEventSide;
  threshold: number;
  thresholdKind: 'fixed' | 'p95' | 'p99';
  thresholdLabel: string;
  sampleCount: number;
  sampleLowTrust: boolean;
  horizons: VolumeShockHorizonStat[];
};

export type VolumeShockForecastResult = {
  timeframe: string;
  dataSource: 'bitget-futures-csv' | 'binance-spot';
  totalBars: number;
  lowSampleWarning: boolean;
  lookbackBars: number;
  dynamicVolume: { p95: number; p99: number } | null;
  shortTermRegime: {
    windowBars: number;
    changePct: number;
    label: '상승 추세' | '하락 추세' | '횡보 구간';
  };
  currentEventScore: number;
  current: {
    time: number;
    open: number;
    close: number;
    volume: number;
    buyVolume: number;
    sellVolume: number;
    isBear: boolean;
    isBull: boolean;
    hitThresholdsBear: number[];
    hitThresholdsBull: number[];
    hitThresholdsBuy: number[];
    hitThresholdsSell: number[];
  };
  thresholds: number[];
  bearEventStats: VolumeShockStat[];
  bullEventStats: VolumeShockStat[];
  buyEventStats: VolumeShockStat[];
  sellEventStats: VolumeShockStat[];
  eventStats: VolumeShockStat[];
};

function percentileSorted(values: number[], p: number): number {
  if (!values.length) return NaN;
  const idx = (values.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return values[lo];
  return values[lo] + (values[hi] - values[lo]) * (idx - lo);
}

const SAMPLE_TRUST_MIN = 30;

function labelForThreshold(kind: 'fixed' | 'p95' | 'p99', value: number): string {
  const v = Math.round(value);
  if (kind === 'fixed') return `고정 ${v.toLocaleString('ko-KR')}`;
  if (kind === 'p95') return `동적 상위 5% (${v.toLocaleString('ko-KR')})`;
  return `동적 상위 1% (${v.toLocaleString('ko-KR')})`;
}

function sideKo(side: VolumeShockEventSide): string {
  if (side === 'bull') return '양봉·총량';
  if (side === 'bear') return '음봉·총량';
  if (side === 'buy') return '매수거래량';
  return '매도거래량';
}

function nearEqual(a: number, b: number, eps = 1e-3): boolean {
  return Math.abs(a - b) <= eps;
}

function isFavorableRet(side: VolumeShockEventSide, ret: number): boolean {
  if (side === 'bear' || side === 'sell') return ret < 0;
  return ret > 0;
}

function buildUsdBand(usdMoves: number[]): VolumeShockUsdBand | null {
  if (!usdMoves.length) return null;
  const sorted = [...usdMoves].sort((a, b) => a - b);
  return {
    p10: percentileSorted(sorted, 0.1),
    p25: percentileSorted(sorted, 0.25),
    median: percentileSorted(sorted, 0.5),
    p75: percentileSorted(sorted, 0.75),
    p90: percentileSorted(sorted, 0.9),
  };
}

function computeShortTermRegime(sorted: Candle[], n: number): VolumeShockForecastResult['shortTermRegime'] {
  const windowBars = Math.min(48, n);
  if (windowBars < 12) return { windowBars, changePct: 0, label: '횡보 구간' };
  const slice = sorted.slice(n - windowBars, n);
  const first = slice[0]?.close;
  const lastC = slice[slice.length - 1]?.close;
  if (!first || !lastC || first <= 0) return { windowBars, changePct: 0, label: '횡보 구간' };
  const changePct = ((lastC / first) - 1) * 100;
  if (changePct > 1.1) return { windowBars, changePct, label: '상승 추세' };
  if (changePct < -1.1) return { windowBars, changePct, label: '하락 추세' };
  return { windowBars, changePct, label: '횡보 구간' };
}

function computeEventScore(params: {
  volume: number;
  buyV: number;
  sellV: number;
  hitBear: number;
  hitBull: number;
  hitBuy: number;
  hitSell: number;
  p99: number | null;
}): number {
  const { volume, buyV, sellV, hitBear, hitBull, hitBuy, hitSell, p99 } = params;
  const baseP = p99 && p99 > 0 ? p99 : Math.max(volume, buyV, sellV, 1);
  const volRatio = Math.min(2.2, volume / baseP);
  const volPart = Math.min(36, volRatio * 16);
  const hitPart = Math.min(44, (hitBear + hitBull + hitBuy + hitSell) * 8);
  const imbalance =
    buyV > sellV * 1.35 ? 12 : sellV > buyV * 1.35 ? 12 : buyV > 0 || sellV > 0 ? 4 : 0;
  return Math.min(100, Math.round(volPart + hitPart + imbalance));
}

function buildHorizonStats(
  sorted: Candle[],
  eventIdx: number[],
  horizons: number[],
  side: VolumeShockEventSide
): VolumeShockHorizonStat[] {
  return horizons.map((h) => {
    const rets: number[] = [];
    const usdMoves: number[] = [];
    let rebound = 0;
    let rebound03 = 0;
    let rebound07 = 0;
    let downFollow = 0;
    let favorable = 0;
    for (const i of eventIdx) {
      const c0 = sorted[i];
      const c1 = sorted[i + h];
      if (!c0 || !c1 || c0.close <= 0) continue;
      const ret = (c1.close / c0.close - 1) * 100;
      rets.push(ret);
      usdMoves.push(c1.close - c0.close);
      if (ret > 0) rebound++;
      if (ret > 0.3) rebound03++;
      if (ret > 0.7) rebound07++;
      if (ret < 0) downFollow++;
      if (isFavorableRet(side, ret)) favorable++;
    }
    rets.sort((a, b) => a - b);
    const len = rets.length;
    const meanPct = len ? rets.reduce((s, x) => s + x, 0) / len : NaN;
    const medianPct = percentileSorted(rets, 0.5);
    const meanMoveUsd = len ? usdMoves.reduce((s, x) => s + x, 0) / len : NaN;
    const sortedUsd = [...usdMoves].sort((a, b) => a - b);
    const medianMoveUsd = len ? percentileSorted(sortedUsd, 0.5) : NaN;
    return {
      bars: h,
      probRebound: len ? rebound / len : 0,
      probReboundT03: len ? rebound03 / len : 0,
      probReboundT07: len ? rebound07 / len : 0,
      probDownFollow: len ? downFollow / len : 0,
      probFavorable: len ? favorable / len : 0,
      meanPct,
      medianPct,
      medianMoveUsd: Number.isFinite(medianMoveUsd) ? medianMoveUsd : null,
      meanMoveUsd: Number.isFinite(meanMoveUsd) ? meanMoveUsd : null,
      usdBand: buildUsdBand(usdMoves),
    };
  });
}

function eventVolumeAt(c: Candle, side: VolumeShockEventSide): number {
  if (side === 'buy') return wadBuyVolume(c);
  if (side === 'sell') return wadSellVolume(c);
  return Math.max(0, c.volume || 0);
}

function isVolumeEvent(c: Candle, thr: number, side: VolumeShockEventSide): boolean {
  const v = eventVolumeAt(c, side);
  if (v < thr) return false;
  if (side === 'bull') return c.close > c.open;
  if (side === 'bear') return c.close < c.open;
  return true;
}

function collectEventStatsForSide(
  sorted: Candle[],
  n: number,
  maxH: number,
  entries: Array<{ value: number; kind: 'fixed' | 'p95' | 'p99' }>,
  horizons: number[],
  side: VolumeShockEventSide
): { stats: VolumeShockStat[]; lowSample: boolean } {
  const stats: VolumeShockStat[] = [];
  let lowSample = false;

  for (const { value: thr, kind } of entries) {
    const eventIdx: number[] = [];
    for (let i = 0; i < n - maxH; i++) {
      if (isVolumeEvent(sorted[i], thr, side)) eventIdx.push(i);
    }
    const horizonStats = buildHorizonStats(sorted, eventIdx, horizons, side);
    const sampleCount = eventIdx.length;
    const sampleLowTrust = sampleCount < SAMPLE_TRUST_MIN;
    if (sampleLowTrust) lowSample = true;
    stats.push({
      eventSide: side,
      threshold: thr,
      thresholdKind: kind,
      thresholdLabel: `${labelForThreshold(kind, thr)} · ${sideKo(side)}`,
      sampleCount,
      sampleLowTrust,
      horizons: horizonStats,
    });
  }
  return { stats, lowSample };
}

export function computeVolumeShockForecast(
  candles: Candle[],
  options?: {
    thresholds?: number[];
    horizons?: number[];
    timeframe?: string;
    includeDynamic?: boolean;
    lookbackBars?: number;
    dataSource?: VolumeShockForecastResult['dataSource'];
  }
): VolumeShockForecastResult | { error: string } {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const n = sorted.length;
  if (n < 80) return { error: `캔들 부족: ${n}` };

  const tf = options?.timeframe ?? '15m';
  const fixedRaw = (options?.thresholds ?? [])
    .map((x) => Math.max(1, Number(x)))
    .filter((x, i, a) => Number.isFinite(x) && a.indexOf(x) === i)
    .sort((a, b) => a - b);

  const horizons = (options?.horizons?.length ? options.horizons : [1, 4, 12])
    .map((x) => Math.max(1, Math.floor(Number(x))))
    .filter((x, i, a) => Number.isFinite(x) && a.indexOf(x) === i)
    .sort((a, b) => a - b);

  const maxH = Math.max(...horizons);
  if (n < maxH + 24) return { error: '선행 구간 대비 데이터 부족' };

  const includeDynamic = options?.includeDynamic !== false;
  const defaultLookback = Math.min(96 * 30, Math.max(120, n - 50));
  const lookbackBars = Math.max(50, Math.min(n - 2, options?.lookbackBars ?? defaultLookback));

  const volStart = Math.max(0, n - 1 - lookbackBars);
  const volSlice = sorted.slice(volStart, n - 1).map((c) => c.volume).filter((v) => Number.isFinite(v) && v >= 0);
  const volSorted = [...volSlice].sort((a, b) => a - b);

  type ThEntry = { value: number; kind: 'fixed' | 'p95' | 'p99' };
  const entries: ThEntry[] = [];
  for (const v of fixedRaw) entries.push({ value: v, kind: 'fixed' });

  let dynamicVolume: { p95: number; p99: number } | null = null;
  if (includeDynamic && volSorted.length >= 20) {
    const p95 = percentileSorted(volSorted, 0.95);
    const p99 = percentileSorted(volSorted, 0.99);
    if (Number.isFinite(p95) && Number.isFinite(p99)) {
      dynamicVolume = { p95, p99 };
      if (!entries.some((e) => nearEqual(e.value, p95))) entries.push({ value: p95, kind: 'p95' });
      if (!entries.some((e) => nearEqual(e.value, p99))) entries.push({ value: p99, kind: 'p99' });
    }
  }

  const buyVolSlice = sorted
    .slice(volStart, n - 1)
    .map((c) => wadBuyVolume(c))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const sellVolSlice = sorted
    .slice(volStart, n - 1)
    .map((c) => wadSellVolume(c))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  if (includeDynamic && buyVolSlice.length >= 20) {
    const p95b = percentileSorted(buyVolSlice, 0.95);
    const p99b = percentileSorted(buyVolSlice, 0.99);
    if (Number.isFinite(p95b) && !entries.some((e) => nearEqual(e.value, p95b))) {
      entries.push({ value: p95b, kind: 'p95' });
    }
    if (Number.isFinite(p99b) && !entries.some((e) => nearEqual(e.value, p99b))) {
      entries.push({ value: p99b, kind: 'p99' });
    }
  }
  if (includeDynamic && sellVolSlice.length >= 20) {
    const p95s = percentileSorted(sellVolSlice, 0.95);
    const p99s = percentileSorted(sellVolSlice, 0.99);
    if (Number.isFinite(p95s) && !entries.some((e) => nearEqual(e.value, p95s))) {
      entries.push({ value: p95s, kind: 'p95' });
    }
    if (Number.isFinite(p99s) && !entries.some((e) => nearEqual(e.value, p99s))) {
      entries.push({ value: p99s, kind: 'p99' });
    }
  }

  entries.sort((a, b) => a.value - b.value);
  const uniq: ThEntry[] = [];
  for (const e of entries) {
    if (!uniq.some((u) => nearEqual(u.value, e.value))) uniq.push(e);
  }

  const last = sorted[n - 1];
  const isBear = last.close < last.open;
  const isBull = last.close > last.open;
  const buyV = wadBuyVolume(last);
  const sellV = wadSellVolume(last);

  const currentHitBear = uniq.filter((e) => isVolumeEvent(last, e.value, 'bear')).map((e) => e.value);
  const currentHitBull = uniq.filter((e) => isVolumeEvent(last, e.value, 'bull')).map((e) => e.value);
  const currentHitBuy = uniq.filter((e) => isVolumeEvent(last, e.value, 'buy')).map((e) => e.value);
  const currentHitSell = uniq.filter((e) => isVolumeEvent(last, e.value, 'sell')).map((e) => e.value);

  const shortTermRegime = computeShortTermRegime(sorted, n);
  const currentEventScore = computeEventScore({
    volume: last.volume,
    buyV,
    sellV,
    hitBear: currentHitBear.length,
    hitBull: currentHitBull.length,
    hitBuy: currentHitBuy.length,
    hitSell: currentHitSell.length,
    p99: dynamicVolume?.p99 ?? null,
  });

  const bearPack = collectEventStatsForSide(sorted, n, maxH, uniq, horizons, 'bear');
  const bullPack = collectEventStatsForSide(sorted, n, maxH, uniq, horizons, 'bull');
  const buyPack = collectEventStatsForSide(sorted, n, maxH, uniq, horizons, 'buy');
  const sellPack = collectEventStatsForSide(sorted, n, maxH, uniq, horizons, 'sell');
  const lowSampleWarning = bearPack.lowSample || bullPack.lowSample || buyPack.lowSample || sellPack.lowSample;

  return {
    timeframe: tf,
    dataSource: options?.dataSource ?? 'binance-spot',
    totalBars: n,
    lowSampleWarning,
    lookbackBars,
    dynamicVolume,
    shortTermRegime,
    currentEventScore,
    current: {
      time: last.time,
      open: last.open,
      close: last.close,
      volume: last.volume,
      buyVolume: buyV,
      sellVolume: sellV,
      isBear,
      isBull,
      hitThresholdsBear: currentHitBear,
      hitThresholdsBull: currentHitBull,
      hitThresholdsBuy: currentHitBuy,
      hitThresholdsSell: currentHitSell,
    },
    thresholds: uniq.map((e) => e.value),
    bearEventStats: bearPack.stats,
    bullEventStats: bullPack.stats,
    buyEventStats: buyPack.stats,
    sellEventStats: sellPack.stats,
    eventStats: [...bearPack.stats, ...bullPack.stats, ...buyPack.stats, ...sellPack.stats],
  };
}
