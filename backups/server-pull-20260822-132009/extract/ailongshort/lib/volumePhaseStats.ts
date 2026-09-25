import type { Candle } from '@/types';
import type { VolumePhaseEvent, VolumePhaseEventType } from '@/lib/volumePhaseCatalog';
import { extractVolumePhaseEvents } from '@/lib/volumePhaseCatalog';
import { regimeKeyLabel, tagRegimeAt, buildPhaseRegimeKey } from '@/lib/volumePhaseRegime';
import { detectVolumeRangePhases, getVolumeRangePhaseAt } from '@/lib/volumeRangeAccumDist';
import { computeVolumeShockForecast } from '@/lib/volumeShockForecast';
import { phaseHorizonsForTf } from '@/lib/volumePhaseTimeframes';
import {
  analyzeCandleVolumeJoint,
  candleVolKeyTokens,
  type CandleVolumeJoint,
} from '@/lib/volumeCandleJoint';

const SAMPLE_TRUST_MIN = 30;

export type PhaseHorizonAgg = {
  bars: number;
  sampleCount: number;
  sampleLowTrust: boolean;
  probFavorable: number;
  medianUsd: number | null;
  medianPct: number | null;
  usdP25: number | null;
  usdP90: number | null;
};

export type PhaseKeyStats = {
  regimeKey: string;
  label: string;
  eventType: VolumePhaseEventType;
  horizons: PhaseHorizonAgg[];
};

export type VolumePhaseCurrentMatch = {
  regimeKey: string;
  label: string;
  eventType: VolumePhaseEventType;
  sellPct: number;
  inRangePhase: boolean;
  horizons: PhaseHorizonAgg[];
  primaryHorizon: number;
  /** 캔들+거래량 결합 시나리오 (횡보후하락·거래량↑ 등) */
  scenarioKo?: string;
  theoryKo?: string;
  candleJoint?: CandleVolumeJoint;
};

export type VolumePhaseStatsFile = {
  version: 1;
  symbol: string;
  timeframe: string;
  builtAt: string;
  totalBars: number;
  eventCount: number;
  horizons: number[];
  keys: PhaseKeyStats[];
};

function percentileSorted(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function isFavorable(e: VolumePhaseEvent, usd: number): boolean {
  if (e.type === 'RANGE_DIST') return usd < 0;
  if (e.type === 'RANGE_ACC') return usd > 0;
  return e.sellPct >= 0.55 ? usd < 0 : usd > 0;
}

function aggregateHorizon(
  events: VolumePhaseEvent[],
  h: number,
  type: VolumePhaseEventType
): PhaseHorizonAgg {
  const usds: number[] = [];
  const pcts: number[] = [];
  let favorable = 0;
  for (const e of events) {
    if (e.type !== type) continue;
    const o = e.outcomes[`h${h}`];
    if (!o) continue;
    usds.push(o.usd);
    pcts.push(o.pct);
    if (isFavorable(e, o.usd)) favorable++;
  }
  const n = usds.length;
  const sortedUsd = [...usds].sort((a, b) => a - b);
  const sortedPct = [...pcts].sort((a, b) => a - b);
  return {
    bars: h,
    sampleCount: n,
    sampleLowTrust: n < SAMPLE_TRUST_MIN,
    probFavorable: n ? favorable / n : 0,
    medianUsd: n ? percentileSorted(sortedUsd, 0.5) : null,
    medianPct: n ? percentileSorted(sortedPct, 0.5) : null,
    usdP25: n ? percentileSorted(sortedUsd, 0.25) : null,
    usdP90: n ? percentileSorted(sortedUsd, 0.9) : null,
  };
}

export function buildVolumePhaseStatsFile(
  symbol: string,
  timeframe: string,
  candles: Candle[],
  events: VolumePhaseEvent[],
  horizons?: number[]
): VolumePhaseStatsFile {
  const h = horizons ?? phaseHorizonsForTf(timeframe);
  const byKey = new Map<string, VolumePhaseEvent[]>();
  for (const e of events) {
    const list = byKey.get(e.regimeKey) ?? [];
    list.push(e);
    byKey.set(e.regimeKey, list);
  }

  const keys: PhaseKeyStats[] = [];
  for (const [regimeKey, list] of byKey) {
    const type = list[0]?.type ?? 'RANGE_DIST';
    const horizonAggs = h.map((bars) => aggregateHorizon(list, bars, type));
    keys.push({
      regimeKey,
      label: regimeKeyLabel(regimeKey),
      eventType: type,
      horizons: horizonAggs,
    });
  }

  keys.sort((a, b) => {
    const na = a.horizons[0]?.sampleCount ?? 0;
    const nb = b.horizons[0]?.sampleCount ?? 0;
    return nb - na;
  });

  return {
    version: 1,
    symbol,
    timeframe,
    builtAt: new Date().toISOString(),
    totalBars: candles.length,
    eventCount: events.length,
    horizons: h,
    keys,
  };
}

export function computeVolumePhaseStatsFromCandles(
  symbol: string,
  timeframe: string,
  candles: Candle[],
  options?: { htfCandles?: Candle[]; horizons?: number[] }
): VolumePhaseStatsFile {
  const horizons = options?.horizons ?? phaseHorizonsForTf(timeframe);
  const vs = computeVolumeShockForecast(candles, {
    timeframe,
    includeDynamic: true,
    dataSource: 'bitget-futures-csv',
  });
  const vsOk = vs && !('error' in vs) ? vs : null;
  const events = extractVolumePhaseEvents(candles, timeframe, {
    horizons,
    htfCandles: options?.htfCandles,
    vs: vsOk,
  });
  return buildVolumePhaseStatsFile(symbol, timeframe, candles, events, horizons);
}

export function matchCurrentPhase(
  candles: Candle[],
  timeframe: string,
  file: VolumePhaseStatsFile,
  htfCandles?: Candle[]
): VolumePhaseCurrentMatch | null {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const n = sorted.length;
  if (n < 20) return null;
  const lastIdx = n - 1;
  const phases = detectVolumeRangePhases(sorted, timeframe, 120, 6);
  const active = getVolumeRangePhaseAt(phases, lastIdx);
  const primaryH = file.horizons[0] ?? 6;

  let eventType: VolumePhaseEventType = 'RANGE_DIST';
  let sellPct = 0.5;
  let inRange = false;

  if (active && active.phase !== 'neutral') {
    inRange = true;
    sellPct = active.sellPct;
    eventType = active.phase === 'distribution' ? 'RANGE_DIST' : 'RANGE_ACC';
  } else {
    const last = sorted[lastIdx];
    const buy = last.volume * 0.5;
    sellPct = 0.52;
    eventType = last.close < last.open ? 'RANGE_DIST' : 'RANGE_ACC';
  }

  const tags = tagRegimeAt(sorted, lastIdx, sellPct, htfCandles);
  const phaseKind =
    eventType === 'RANGE_DIST' ? 'distribution' : eventType === 'RANGE_ACC' ? 'accumulation' : 'neutral';
  const fromIdx = active?.fromIdx ?? Math.max(0, lastIdx - 10);
  const joint = analyzeCandleVolumeJoint(sorted, fromIdx, lastIdx, phaseKind);
  const baseKey = buildPhaseRegimeKey(timeframe, eventType, tags);
  const regimeKey = joint ? `${baseKey}|${candleVolKeyTokens(joint)}` : baseKey;

  const exact = file.keys.find((k) => k.regimeKey === regimeKey || k.regimeKey.startsWith(`${baseKey}|`));
  if (exact) {
    return {
      regimeKey: exact.regimeKey,
      label: exact.label,
      eventType,
      sellPct,
      inRangePhase: inRange,
      horizons: exact.horizons,
      primaryHorizon: primaryH,
      scenarioKo: joint?.scenarioKo,
      theoryKo: joint?.theoryKo,
      candleJoint: joint ?? undefined,
    };
  }

  const prefix = regimeKey.split('|').slice(0, 4).join('|');
  const relaxed = file.keys
    .filter((k) => k.regimeKey.startsWith(prefix) && k.eventType === eventType)
    .sort((a, b) => (b.horizons[0]?.sampleCount ?? 0) - (a.horizons[0]?.sampleCount ?? 0))[0];

  if (relaxed) {
    return {
      regimeKey: relaxed.regimeKey,
      label: relaxed.label,
      eventType,
      sellPct,
      inRangePhase: inRange,
      horizons: relaxed.horizons,
      primaryHorizon: primaryH,
      scenarioKo: joint?.scenarioKo,
      theoryKo: joint?.theoryKo,
      candleJoint: joint ?? undefined,
    };
  }

  const fallback = file.keys.find((k) => k.eventType === eventType);
  if (!fallback) return null;
  return {
    regimeKey: fallback.regimeKey,
    label: fallback.label,
    eventType,
    sellPct,
    inRangePhase: inRange,
    horizons: fallback.horizons,
    primaryHorizon: primaryH,
    scenarioKo: joint?.scenarioKo,
    theoryKo: joint?.theoryKo,
    candleJoint: joint ?? undefined,
  };
}
