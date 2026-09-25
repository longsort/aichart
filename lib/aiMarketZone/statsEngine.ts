/**
 * STEP15–16 — AMZ 통계 파일 생성.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { runAmzReplay, aggregateAmzOutcomes } from './replayEngine';
import { mergeAmzOutcomeConfig } from './outcomeConfig';
import type { AmzStatsFile } from './statsTypes';

export type { AmzStatsFile } from './statsTypes';
export { empiricRatesFromStats } from './empiricRates';

export function computeAmzStatsFromCandles(params: {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  stride?: number;
  maxSteps?: number;
}): AmzStatsFile {
  const tf = normalizeChartTimeframe(params.timeframe);
  const cfg = mergeAmzOutcomeConfig();
  const replay = runAmzReplay({
    candles: params.candles,
    timeframe: tf,
    symbol: params.symbol,
    stride: params.stride ?? 4,
    maxSteps: params.maxSteps ?? 60,
    outcomeConfig: cfg,
  });
  const agg = aggregateAmzOutcomes(replay.outcomes, cfg.sampleTrustMin);

  return {
    version: 1,
    symbol: params.symbol.toUpperCase(),
    timeframe: tf,
    builtAt: new Date().toISOString(),
    totalBars: params.candles.length,
    replaySteps: replay.steps,
    eventCount: replay.outcomes.length,
    sampleLowTrust: agg.sampleLowTrust,
    sampleTrustMin: cfg.sampleTrustMin,
    horizons: cfg.outcomeHorizons,
    byKind: agg.byKind,
    byRole: agg.byRole,
    recentOutcomes: replay.outcomes.slice(-40).reverse(),
    mlCases: replay.mlCases.slice(-400),
    disclaimerKo: agg.sampleLowTrust
      ? `표본 ${agg.total} < ${cfg.sampleTrustMin} · LOW CONFIDENCE · 확률 WAIT`
      : `경험률+유사사례 보정 참고 · 확정 승률 아님 · n=${agg.total} · ml=${replay.mlCases.length}`,
    sameCoreAsLive: true,
  };
}
