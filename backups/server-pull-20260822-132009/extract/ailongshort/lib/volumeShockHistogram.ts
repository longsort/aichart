import type { HistogramData, UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '@/types';
import type { ChartCandleStyleFields } from '@/lib/chartCandleOptions';
import {
  candlesToVolumeHistogramData,
  wadBuyVolume,
  wadSellVolume,
  type VolumeHistogramIntelOpts,
} from '@/lib/volumeHistogramIntelligence';
import { candlesToVolumeDirectionHistogram } from '@/lib/volumeDirectionStats';
import type { VolumeShockForecastResult } from '@/lib/volumeShockForecast';
import { evalBarVolumeShock, RVOL_SHOCK_MIN } from '@/lib/volumeShockMetrics';
import { detectVolumeRangePhases, getVolumeRangePhaseAt } from '@/lib/volumeRangeAccumDist';
import { scoreGreenTrapSegment } from '@/lib/volumeCandleJoint';

const TIER_UP = ['#22C55E', '#4ADE80', '#34D399', '#22D3EE'] as const;
const TIER_DN = ['#EF4444', '#F87171', '#FB7185', '#FBBF24'] as const;

function rvolTierFromShock(shock: NonNullable<ReturnType<typeof evalBarVolumeShock>>): 0 | 1 | 2 | 3 {
  if (shock.tags.includes('P99')) return 3;
  if (shock.rvol >= RVOL_SHOCK_MIN * 1.5) return 3;
  if (shock.rvol >= RVOL_SHOCK_MIN * 1.2 || shock.tags.includes('P95')) return 2;
  if (shock.rvol >= RVOL_SHOCK_MIN) return 1;
  return 1;
}

/**
 * RVOL·P99 기준 막대 강조 (15m 고정 k는 보조)
 */
export function candlesToVolumeHistogramWithShock(
  candles: Candle[],
  style: ChartCandleStyleFields,
  chartBgHex: string,
  vs: VolumeShockForecastResult | null,
  partial?: Partial<VolumeHistogramIntelOpts & { directional?: boolean }>,
  timeframe?: string
): HistogramData<UTCTimestamp>[] {
  const base = partial?.directional
    ? candlesToVolumeDirectionHistogram(candles, style, chartBgHex, partial)
    : candlesToVolumeHistogramData(candles, style, chartBgHex, partial, timeframe);
  const rows = candles.length ? candles : [];
  const lastT = rows.length ? Number(rows[rows.length - 1]?.time) : 0;
  const phases = vs ? detectVolumeRangePhases(rows, vs.timeframe, 100, 6) : [];

  return base.map((bar, i) => {
    const c = rows[i];
    if (!c) return bar;
    const phase = phases.length ? getVolumeRangePhaseAt(phases, i) : null;
    const shock = evalBarVolumeShock(rows, i, vs);
    if (!shock && phase?.phase === 'distribution') {
      const seg =
        phase.fromIdx != null && phase.toIdx != null
          ? rows.slice(phase.fromIdx, phase.toIdx + 1)
          : [];
      const trap = seg.length >= 5 ? scoreGreenTrapSegment(seg) : null;
      return {
        ...bar,
        value: (bar.value ?? 0) * (trap?.isTrap ? 1.04 : 1.06),
        color: trap?.isTrap ? '#FACC15' : '#FB923C',
      };
    }
    if (!shock && phase?.phase === 'accumulation') {
      return {
        ...bar,
        value: (bar.value ?? 0) * 1.05,
        color: '#2DD4BF',
      };
    }
    if (!shock) return bar;
    const tier = rvolTierFromShock(shock);
    const isUp = shock.side === 'long';
    const palette = isUp ? TIER_UP : TIER_DN;
    const color = palette[Math.min(tier, 3)];
    const boost = tier >= 3 ? 1.22 : tier >= 2 ? 1.1 : 1.04;
    const isLast = Number(c.time) === lastT;
    return {
      ...bar,
      value: (bar.value ?? shock.eventVol) * boost,
      color: isLast ? (isUp ? '#A7F3D0' : '#FECACA') : color,
    };
  });
}
