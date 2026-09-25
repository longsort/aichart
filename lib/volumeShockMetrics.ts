import type { Candle } from '@/types';
import { wadBuyVolume, wadSellVolume, smaTotalVolumeAt } from '@/lib/volumeHistogramIntelligence';
import type { VolumeShockForecastResult, VolumeShockStat } from '@/lib/volumeShockForecast';
import { normalizeChartTimeframe } from '@/lib/constants';
import { bestVolumeShockStat } from '@/lib/volumeShockFormat';

/** RVOL(거래량/20봉 SMA) 이 값 이상이면 쇼크 후보 */
export const RVOL_SHOCK_MIN = 2;
export const RVOL_SMA_PERIOD = 20;

export type BarVolumeShock = {
  side: 'long' | 'short';
  eventVol: number;
  totalVol: number;
  rvol: number;
  zScore: number | null;
  isShock: boolean;
  /** 표시용: RVOL2.4×·P99·5k */
  tags: string[];
  primaryTag: string;
};

function percentile(values: number[], p: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

function fmtVolK(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return String(Math.round(v));
}

function fixedTvThresholds(tf: string, thresholds: number[]): number[] {
  if (normalizeChartTimeframe(tf) !== '15m') return [];
  return thresholds.filter((t) => t >= 1500 && t <= 15000);
}

function zScoreAt(values: number[], value: number): number | null {
  if (values.length < 8) return null;
  const mean = values.reduce((s, x) => s + x, 0) / values.length;
  let varSum = 0;
  for (const x of values) varSum += (x - mean) ** 2;
  const sd = Math.sqrt(varSum / values.length);
  if (sd <= 0) return null;
  return (value - mean) / sd;
}

/** 매수/매도 방향별 이벤트 거래량 + 총량 */
export function eventVolumesForBar(c: Candle): { side: 'long' | 'short'; eventVol: number; totalVol: number } {
  const totalVol = Math.max(0, c.volume || 0);
  const buy = wadBuyVolume(c);
  const sell = wadSellVolume(c);
  const isLong = buy >= sell && c.close >= c.open;
  return {
    side: isLong ? 'long' : 'short',
    eventVol: isLong ? Math.max(buy, totalVol) : Math.max(sell, totalVol),
    totalVol,
  };
}

/**
 * 주력: RVOL ≥ 2 · P99
 * 보조: 15m Bitget 고정 2k/5k/10k
 */
export function evalBarVolumeShock(
  candles: Candle[],
  idx: number,
  vs: VolumeShockForecastResult | null,
  partial?: { rvolPeriod?: number; rvolMin?: number }
): BarVolumeShock | null {
  const c = candles[idx];
  if (!c || idx < 0 || idx >= candles.length) return null;

  const period = Math.max(8, Math.min(60, partial?.rvolPeriod ?? RVOL_SMA_PERIOD));
  const rvolMin = partial?.rvolMin ?? RVOL_SHOCK_MIN;
  const { side, eventVol, totalVol } = eventVolumesForBar(c);

  const sma = idx >= period - 1 ? smaTotalVolumeAt(candles, idx, period) : 0;
  const rvol = sma > 0 ? eventVol / sma : 0;

  const lookSlice = candles.slice(Math.max(0, idx - 120), idx);
  const sideSlice =
    side === 'long'
      ? lookSlice.map((x) => wadBuyVolume(x)).filter((v) => v > 0)
      : lookSlice.map((x) => wadSellVolume(x)).filter((v) => v > 0);
  const totalSlice = lookSlice.map((x) => Math.max(0, x.volume || 0));

  const p99Side = percentile(sideSlice, 0.99);
  const p99Total = vs?.dynamicVolume?.p99 ?? percentile(totalSlice, 0.99);
  const p95Total = vs?.dynamicVolume?.p95 ?? percentile(totalSlice, 0.95);

  const z = zScoreAt(totalSlice, eventVol);

  const tags: string[] = [];
  if (rvol >= rvolMin) tags.push(`RVOL${rvol.toFixed(1)}×`);
  if (Number.isFinite(p99Side) && eventVol >= p99Side) tags.push('P99');
  else if (Number.isFinite(p99Total) && eventVol >= p99Total) tags.push('P99');
  else if (Number.isFinite(p95Total) && eventVol >= p95Total) tags.push('P95');

  const fixed = vs ? fixedTvThresholds(vs.timeframe, vs.thresholds) : [];
  for (const thr of fixed.sort((a, b) => b - a)) {
    if (eventVol >= thr) {
      tags.push(fmtVolK(thr));
      break;
    }
  }

  if (z != null && z >= 2) tags.push(`Z${z.toFixed(1)}`);

  const isShock =
    (rvol >= rvolMin) ||
    tags.includes('P99') ||
    (tags.includes('P95') && rvol >= 1.45) ||
    fixed.some((thr) => eventVol >= thr);

  if (!isShock) return null;

  const primaryTag = tags.filter((t) => !/^\d/.test(t) || t.includes('k')).slice(0, 3).join('·') || `RVOL${rvol.toFixed(1)}×`;

  return { side, eventVol, totalVol, rvol, zScore: z, isShock, tags, primaryTag };
}

export function pickVolumeShockStatForSide(
  side: 'long' | 'short',
  vs: VolumeShockForecastResult
): VolumeShockStat | null {
  if (side === 'long') {
    return (
      bestVolumeShockStat(vs.buyEventStats) ??
      bestVolumeShockStat(vs.bullEventStats) ??
      null
    );
  }
  return (
    bestVolumeShockStat(vs.sellEventStats) ??
    bestVolumeShockStat(vs.bearEventStats) ??
    null
  );
}
