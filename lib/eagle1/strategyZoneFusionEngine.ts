/**
 * StrategyZoneFusionEngine — 겹치는 StrategyZone → A+ 구간 1개 (방향별).
 * Intersection만 쓰지 않고 density peak + setupScore 가중.
 */

import type { StrategyZone } from './strategyZone';
import {
  buildZoneDensityProfile,
  type DensityEvidencePoint,
} from './zoneDensityProfile';

export type APlusZone = {
  id: string;
  side: 'LONG' | 'SHORT';
  labelEn: 'A+ LONG' | 'A+ SHORT';
  labelKo: string;
  lower: number;
  upper: number;
  midpoint: number;
  sourceTimeframe: string;
  setupScore: number | null;
  strategyIds: string[];
  strategyTypes: string[];
  note: string;
};

export type StrategyZoneFusionReport = {
  strategies: StrategyZone[];
  aPlusLong: APlusZone | null;
  aPlusShort: APlusZone | null;
  practical: APlusZone[];
  note: string;
};

function toEvidence(zs: StrategyZone[]): DensityEvidencePoint[] {
  return zs.map((z) => ({
    id: z.id,
    source: z.strategyType,
    lower: z.lower,
    upper: z.upper,
    weight: Math.max(0.5, (z.setupScore ?? 50) / 40),
    direction: z.direction === 'LONG' ? 'bullish' : 'bearish',
  }));
}

function fuseSide(side: 'LONG' | 'SHORT', zs: StrategyZone[]): APlusZone | null {
  const pool = zs.filter((z) => z.direction === side && z.upper > z.lower);
  if (pool.length < 2) return null;
  const dens = buildZoneDensityProfile({ evidence: toEvidence(pool), peakRatio: 0.6 });
  const band = dens.peakBand;
  if (!band) return null;
  const score =
    pool.reduce((s, z) => s + (z.setupScore ?? 0), 0) / pool.length;
  const tf = pool[0]!.sourceTimeframe;
  return {
    id: `aplus-${side.toLowerCase()}-${Math.round(band.lower)}-${Math.round(band.upper)}`,
    side,
    labelEn: side === 'LONG' ? 'A+ LONG' : 'A+ SHORT',
    labelKo: side === 'LONG' ? 'A+ 롱 합의구간' : 'A+ 숏 합의구간',
    lower: band.lower,
    upper: band.upper,
    midpoint: (band.lower + band.upper) / 2,
    sourceTimeframe: tf,
    setupScore: Math.round(score),
    strategyIds: pool.map((z) => z.id),
    strategyTypes: [...new Set(pool.map((z) => z.strategyType))],
    note: dens.note,
  };
}

export function runStrategyZoneFusionEngine(params: {
  strategies: StrategyZone[];
}): StrategyZoneFusionReport {
  const strategies = params.strategies ?? [];
  const aPlusLong = fuseSide('LONG', strategies);
  const aPlusShort = fuseSide('SHORT', strategies);
  const practical = [aPlusLong, aPlusShort].filter((z): z is APlusZone => z != null);
  return {
    strategies,
    aPlusLong,
    aPlusShort,
    practical,
    note:
      practical.length === 0
        ? strategies.length
          ? '전략 있음 · A+ 미달(겹침 부족)'
          : 'UNAVAILABLE'
        : `A+ ${practical.map((z) => z.labelEn).join(' · ')}`,
  };
}

/** Acceptance B — 3 strategy → single A+ LONG, not 3 boxes */
export function strategyFusionAcceptanceB(): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  const base = {
    symbol: 'BTCUSDT',
    sourceTimeframe: '15m',
    createdAt: 1,
    confirmedAt: 1,
    state: 'CONFIRMED' as const,
    triggerPrice: null,
    invalidationPrice: null,
    target1: null,
    target2: null,
    target3: null,
    rr: null,
    historicalSample: null,
    historicalWinRate: null,
    medianMFE: null,
    medianMAE: null,
    medianContinuation: null,
    medianDuration: null,
    evidence: [],
    note: 'test',
  };
  const strategies: StrategyZone[] = [
    {
      ...base,
      id: 't1',
      strategyType: 'TREND_BREAK',
      direction: 'LONG',
      lower: 64290,
      upper: 64370,
      midpoint: 64330,
      setupScore: 70,
      labelEn: 'BREAK LONG ZONE',
      labelKo: '돌파',
    },
    {
      ...base,
      id: 't2',
      strategyType: 'VCP',
      direction: 'LONG',
      lower: 64300,
      upper: 64360,
      midpoint: 64330,
      setupScore: 62,
      labelEn: 'VCP LONG ZONE',
      labelKo: '수축',
    },
    {
      ...base,
      id: 't3',
      strategyType: 'POC_RECLAIM',
      direction: 'LONG',
      lower: 64310,
      upper: 64350,
      midpoint: 64330,
      setupScore: 68,
      labelEn: 'POC RECLAIM LONG',
      labelKo: 'POC',
    },
  ];
  const report = runStrategyZoneFusionEngine({ strategies });
  if (report.strategies.length !== 3) notes.push('expected 3 strategies retained');
  if (!report.aPlusLong) notes.push('A+ LONG missing');
  if (report.practical.filter((z) => z.side === 'LONG').length !== 1) {
    notes.push('must not display 3 separate strategy boxes');
  }
  if (report.aPlusLong) {
    const span = report.aPlusLong.upper - report.aPlusLong.lower;
    if (span > 64370 - 64290) notes.push('A+ wider than outer strategies');
    if (report.aPlusLong.lower < 64290 - 1 || report.aPlusLong.upper > 64370 + 1) {
      notes.push('A+ outside union unexpectedly');
    }
  }
  return { ok: notes.length === 0, notes };
}
