/**
 * 거래량 — 매수(상승)·매도(하락) 볼륨 통계 분류 (taker buy 우선, 없으면 체결 위치 추정)
 */
import type { HistogramData, UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '@/types';
import type { ChartCandleStyleFields } from '@/lib/chartCandleOptions';
import { normalizeHex6 } from '@/lib/chartHexColor';
import {
  sanitizeChartCandlesForSeries,
  smaTotalVolumeAt,
  type VolumeHistogramIntelOpts,
} from '@/lib/volumeHistogramIntelligence';

export type VolumeBarDirection = 'buy' | 'sell' | 'mixed';

export type VolumeBarSplit = {
  buyVol: number;
  sellVol: number;
  buyPct: number;
  sellPct: number;
  deltaPct: number;
  direction: VolumeBarDirection;
  source: 'taker' | 'closePos' | 'wad';
};

export type VolumeSegmentDirectionStats = {
  fromIdx: number;
  toIdx: number;
  bars: number;
  totalVol: number;
  buyVol: number;
  sellVol: number;
  buyPct: number;
  sellPct: number;
  netPct: number;
  direction: VolumeBarDirection;
  directionKo: string;
  strengthKo: string;
  headlineKo: string;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** 봉별 매수·매도 볼륨 추정 */
export function estimateBarBuySell(c: Candle): VolumeBarSplit {
  const vol = Math.max(0, Number(c.volume) || 0);
  if (vol <= 0) {
    return {
      buyVol: 0,
      sellVol: 0,
      buyPct: 0.5,
      sellPct: 0.5,
      deltaPct: 0,
      direction: 'mixed',
      source: 'wad',
    };
  }

  const tb = c.takerBuyBaseVolume;
  if (typeof tb === 'number' && Number.isFinite(tb) && tb >= 0 && tb <= vol * 1.002) {
    const buyVol = tb;
    const sellVol = Math.max(0, vol - buyVol);
    const buyPct = buyVol / vol;
    const deltaPct = clamp(((buyVol - sellVol) / vol) * 100, -100, 100);
    return finalizeSplit(buyVol, sellVol, buyPct, deltaPct, 'taker');
  }

  const hi = Number(c.high);
  const lo = Number(c.low);
  const cl = Number(c.close);
  const o = Number(c.open);
  if ([hi, lo, cl, o].every(Number.isFinite) && hi > lo) {
    const pos = clamp((cl - lo) / (hi - lo), 0, 1);
    const buyPct = clamp(0.12 + pos * 0.76, 0.08, 0.92);
    const buyVol = vol * buyPct;
    const sellVol = vol - buyVol;
    const deltaPct = clamp((pos - 0.5) * 110, -55, 55);
    return finalizeSplit(buyVol, sellVol, buyPct, deltaPct, 'closePos');
  }

  const bull = cl >= o;
  const buyVol = bull ? vol : 0;
  const sellVol = bull ? 0 : vol;
  const buyPct = bull ? 1 : 0;
  const deltaPct = bull ? 100 : -100;
  return finalizeSplit(buyVol, sellVol, buyPct, deltaPct, 'wad');
}

function finalizeSplit(
  buyVol: number,
  sellVol: number,
  buyPct: number,
  deltaPct: number,
  source: VolumeBarSplit['source']
): VolumeBarSplit {
  const sellPct = 1 - buyPct;
  let direction: VolumeBarDirection = 'mixed';
  if (buyPct >= 0.55) direction = 'buy';
  else if (buyPct <= 0.45) direction = 'sell';
  return {
    buyVol,
    sellVol,
    buyPct,
    sellPct,
    deltaPct,
    direction,
    source,
  };
}

function directionColor(direction: VolumeBarDirection, buyPct: number, rvolTier: number): string {
  const t = Math.min(4, Math.max(0, rvolTier));
  if (direction === 'buy') {
    const up = ['#22C55E', '#16A34A', '#4ADE80', '#34D399', '#14B8A6'];
    return up[t];
  }
  if (direction === 'sell') {
    const dn = ['#EF4444', '#DC2626', '#F87171', '#FB7185', '#E11D48'];
    return dn[t];
  }
  const mix = buyPct >= 0.5 ? ['#FBBF24', '#F59E0B', '#FCD34D', '#FDE047', '#FACC15'] : ['#FB923C', '#F97316', '#FDBA74', '#FED7AA', '#EA580C'];
  return mix[t];
}

function rvolTierIndex(rvol: number): number {
  if (!Number.isFinite(rvol) || rvol < 1.12) return 0;
  if (rvol < 1.48) return 1;
  if (rvol < 2.15) return 2;
  if (rvol < 2.85) return 3;
  return 4;
}

/**
 * Bitget Vol — 매수/매도 볼륨 통계 기반 히스토그램 (상승=녹·하락=적·혼조=황)
 */
export function candlesToVolumeDirectionHistogram(
  candles: Candle[],
  _style: ChartCandleStyleFields,
  _chartBgHex: string,
  partial?: Partial<VolumeHistogramIntelOpts>
): HistogramData<UTCTimestamp>[] {
  const rvolPeriod = Math.max(8, Math.min(60, Math.floor(partial?.rvolSmaPeriod ?? 20)));
  /** 차트 setData 캔들을 그대로 사용 — 무TF 재sanitize는 축 시각을 어긋나게 함 */
  const rows = candles;

  return rows.map((c, idx) => {
    const split = estimateBarBuySell(c);
    const vol = Math.max(0, c.volume || 0);
    const sma = idx >= rvolPeriod - 1 ? smaTotalVolumeAt(rows, idx, rvolPeriod) : 0;
    const rvol = sma > 0 ? vol / sma : 1;
    const tier = partial?.rvolTiers !== false ? rvolTierIndex(rvol) : 0;
    const color = directionColor(split.direction, split.buyPct, tier);
    const boost = tier >= 3 ? 1.08 : tier >= 2 ? 1.04 : 1;
    return {
      time: Number(c.time) as UTCTimestamp,
      value: vol * boost,
      color,
    };
  });
}

/** 구간(1·2번 네모 같은 연속 봉) 상승/하락 거래량 통계 */
export function computeVolumeSegmentDirection(
  candles: Candle[],
  fromIdx: number,
  toIdx: number
): VolumeSegmentDirectionStats | null {
  const rows = sanitizeChartCandlesForSeries(candles);
  const from = Math.max(0, fromIdx);
  const to = Math.min(rows.length - 1, toIdx);
  if (to <= from) return null;

  let buyVol = 0;
  let sellVol = 0;
  let totalVol = 0;
  for (let i = from; i <= to; i++) {
    const s = estimateBarBuySell(rows[i]!);
    buyVol += s.buyVol;
    sellVol += s.sellVol;
    totalVol += Math.max(0, rows[i]!.volume || 0);
  }
  if (totalVol <= 0) return null;

  const buyPct = buyVol / totalVol;
  const sellPct = sellVol / totalVol;
  const o0 = rows[from]!.open;
  const c1 = rows[to]!.close;
  const netPct = o0 > 0 ? ((c1 / o0) - 1) * 100 : 0;

  let direction: VolumeBarDirection = 'mixed';
  if (buyPct >= 0.55) direction = 'buy';
  else if (sellPct >= 0.55) direction = 'sell';

  const edge = Math.abs(buyPct - sellPct);
  const strengthKo =
    edge >= 0.25 ? '강함' : edge >= 0.12 ? '보통' : '약함';
  const directionKo =
    direction === 'buy'
      ? '상승(매수) 거래량 우세'
      : direction === 'sell'
        ? '하락(매도) 거래량 우세'
        : '매수·매도 혼조';

  return {
    fromIdx: from,
    toIdx: to,
    bars: to - from + 1,
    totalVol,
    buyVol,
    sellVol,
    buyPct,
    sellPct,
    netPct,
    direction,
    directionKo,
    strengthKo,
    headlineKo: `${directionKo} · B${Math.round(buyPct * 100)}%/S${Math.round(sellPct * 100)}% · ${strengthKo}`,
  };
}

/** 최근 N봉 + RVOL 상위 구간 자동 탐지 (차트 1·2 구간 요약용) */
export function detectVolumeHighlightSegments(
  candles: Candle[],
  opts?: { recentBars?: number; peakLookback?: number; minBars?: number }
): VolumeSegmentDirectionStats[] {
  const recentBars = opts?.recentBars ?? 12;
  const peakLookback = opts?.peakLookback ?? 120;
  const minBars = opts?.minBars ?? 4;
  const rows = sanitizeChartCandlesForSeries(candles);
  const n = rows.length;
  if (n < minBars + 5) return [];

  const out: VolumeSegmentDirectionStats[] = [];
  const recent = computeVolumeSegmentDirection(rows, Math.max(0, n - recentBars), n - 1);
  if (recent) out.push(recent);

  const rvolPeriod = 20;
  let peakIdx = -1;
  let peakRvol = 0;
  const from = Math.max(rvolPeriod, n - peakLookback);
  for (let i = from; i < n - minBars; i++) {
    const vol = Math.max(0, rows[i]!.volume || 0);
    const sma = smaTotalVolumeAt(rows, i, rvolPeriod);
    const rvol = sma > 0 ? vol / sma : 0;
    if (rvol > peakRvol) {
      peakRvol = rvol;
      peakIdx = i;
    }
  }
  if (peakIdx >= 0 && peakRvol >= 1.5) {
    const segFrom = Math.max(0, peakIdx - Math.floor(minBars / 2));
    const segTo = Math.min(n - 1, segFrom + minBars + 2);
    const peak = computeVolumeSegmentDirection(rows, segFrom, segTo);
    if (peak && !out.some((x) => x.fromIdx === peak.fromIdx)) out.push(peak);
  }

  return out.slice(0, 3);
}

export function formatVolumeSegmentKo(seg: VolumeSegmentDirectionStats): string {
  return `${seg.bars}봉 ${seg.directionKo} · B${Math.round(seg.buyPct * 100)}% S${Math.round(seg.sellPct * 100)}% · 가격 ${seg.netPct >= 0 ? '+' : ''}${seg.netPct.toFixed(1)}%`;
}
