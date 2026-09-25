import type { AmzOutcomeAgg } from './replayEngine';
import type { AmzOutcomeRecord } from './outcomeEngine';
import type { AmzMlCase } from './mlPredict';

export type AmzStatsFile = {
  version: 1;
  symbol: string;
  timeframe: string;
  builtAt: string;
  totalBars: number;
  replaySteps: number;
  eventCount: number;
  sampleLowTrust: boolean;
  sampleTrustMin: number;
  horizons: number[];
  byKind: AmzOutcomeAgg[];
  byRole: Record<string, AmzOutcomeAgg[]>;
  recentOutcomes: AmzOutcomeRecord[];
  /** STEP17 — Feature+outcome 학습 케이스 (lookahead 없는 Replay만) */
  mlCases: AmzMlCase[];
  disclaimerKo: string;
  sameCoreAsLive: true;
};
