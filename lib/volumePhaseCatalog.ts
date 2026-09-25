import type { Candle } from '@/types';
import { detectVolumeRangePhases, type VolumeRangePhaseKind } from '@/lib/volumeRangeAccumDist';
import { evalBarVolumeShock, RVOL_SHOCK_MIN } from '@/lib/volumeShockMetrics';
import type { VolumeShockForecastResult } from '@/lib/volumeShockForecast';
import { buildPhaseRegimeKey, tagRegimeAt, type PhaseRegimeTags } from '@/lib/volumePhaseRegime';
import { phaseHorizonsForTf } from '@/lib/volumePhaseTimeframes';
import {
  analyzeCandleVolumeJoint,
  candleVolKeyTokens,
  type CandleVolumeJoint,
  type CandleVolScenarioId,
} from '@/lib/volumeCandleJoint';

export type VolumePhaseEventType = 'RANGE_DIST' | 'RANGE_ACC' | 'VOL_SHOCK';

export type VolumePhaseEvent = {
  type: VolumePhaseEventType;
  time: number;
  endIdx: number;
  fromIdx?: number;
  sellPct: number;
  compression: number;
  rvol?: number;
  regimeKey: string;
  tags: PhaseRegimeTags;
  scenarioId?: CandleVolScenarioId;
  scenarioKo?: string;
  candleJoint?: CandleVolumeJoint;
  /** +H봉 종가 대비 */
  outcomes: Record<string, { usd: number; pct: number } | undefined>;
};


function outcomeAt(candles: Candle[], idx: number, h: number): { usd: number; pct: number } | undefined {
  const c0 = candles[idx];
  const c1 = candles[idx + h];
  if (!c0 || !c1 || c0.close <= 0) return undefined;
  return {
    usd: c1.close - c0.close,
    pct: ((c1.close / c0.close) - 1) * 100,
  };
}

function mapPhaseType(phase: VolumeRangePhaseKind): VolumePhaseEventType | null {
  if (phase === 'distribution') return 'RANGE_DIST';
  if (phase === 'accumulation') return 'RANGE_ACC';
  return null;
}

/**
 * 전 기간 횡보·매집/분산 + RVOL 쇼크 이벤트 추출 (배치·API 공용)
 */
export function extractVolumePhaseEvents(
  candles: Candle[],
  timeframe: string,
  options?: {
    horizons?: number[];
    htfCandles?: Candle[];
    vs?: VolumeShockForecastResult | null;
    minGapBars?: number;
  }
): VolumePhaseEvent[] {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const n = sorted.length;
  const horizons = options?.horizons ?? phaseHorizonsForTf(timeframe);
  const maxH = Math.max(...horizons, 6);
  if (n < maxH + 30) return [];

  const events: VolumePhaseEvent[] = [];
  const usedEnd = new Set<number>();
  const minGap = options?.minGapBars ?? 5;

  const phases = detectVolumeRangePhases(sorted, timeframe, n - maxH - 2, Math.max(...horizons));
  for (const p of phases) {
    const type = mapPhaseType(p.phase);
    if (!type) continue;
    if (usedEnd.has(p.toIdx)) continue;
    let blocked = false;
    for (const u of usedEnd) {
      if (Math.abs(u - p.toIdx) < minGap) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const tags = tagRegimeAt(sorted, p.toIdx, p.sellPct, options?.htfCandles);
    const joint = analyzeCandleVolumeJoint(sorted, p.fromIdx, p.toIdx, p.phase);
    const regimeKey = joint
      ? `${buildPhaseRegimeKey(timeframe, type, tags)}|${candleVolKeyTokens(joint)}`
      : buildPhaseRegimeKey(timeframe, type, tags);
    const outcomes: VolumePhaseEvent['outcomes'] = {};
    for (const h of horizons) {
      outcomes[`h${h}`] = outcomeAt(sorted, p.toIdx, h);
    }
    events.push({
      type,
      time: sorted[p.toIdx].time,
      endIdx: p.toIdx,
      fromIdx: p.fromIdx,
      sellPct: p.sellPct,
      compression: p.compression,
      regimeKey,
      tags,
      scenarioId: joint?.scenarioId,
      scenarioKo: joint?.scenarioKo,
      candleJoint: joint ?? undefined,
      outcomes,
    });
    usedEnd.add(p.toIdx);
  }

  const vsStub = options?.vs ?? null;
  for (let i = maxH; i < n - maxH; i++) {
    const shock = evalBarVolumeShock(sorted, i, vsStub);
    if (!shock || shock.rvol < RVOL_SHOCK_MIN) continue;
    if (!shock.tags.includes('P99') && shock.rvol < RVOL_SHOCK_MIN * 1.35) continue;
    if (usedEnd.has(i)) continue;
    let blocked = false;
    for (const u of usedEnd) {
      if (Math.abs(u - i) < minGap) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const sellPct = shock.side === 'short' ? 0.58 : 0.42;
    const tags = tagRegimeAt(sorted, i, sellPct, options?.htfCandles);
    const from = Math.max(0, i - 8);
    const joint = analyzeCandleVolumeJoint(
      sorted,
      from,
      i,
      shock.side === 'short' ? 'distribution' : 'accumulation'
    );
    const regimeKey = joint
      ? `${buildPhaseRegimeKey(timeframe, 'VOL_SHOCK', tags)}|${candleVolKeyTokens(joint)}`
      : buildPhaseRegimeKey(timeframe, 'VOL_SHOCK', tags);
    const outcomes: VolumePhaseEvent['outcomes'] = {};
    for (const h of horizons) {
      outcomes[`h${h}`] = outcomeAt(sorted, i, h);
    }
    events.push({
      type: 'VOL_SHOCK',
      time: sorted[i].time,
      endIdx: i,
      fromIdx: from,
      sellPct,
      compression: 0,
      rvol: shock.rvol,
      regimeKey,
      tags,
      scenarioId: joint?.scenarioId,
      scenarioKo: joint?.scenarioKo,
      candleJoint: joint ?? undefined,
      outcomes,
    });
    usedEnd.add(i);
  }

  return events.sort((a, b) => a.time - b.time);
}
