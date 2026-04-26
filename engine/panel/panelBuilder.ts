import type { AnalysisPanelData, EngineMvpInput, StructureSnapshot, ZoneSignalPack } from '@/engine/types';

export function buildAnalysisPanel(input: EngineMvpInput, structure: StructureSnapshot, zoneSignal: ZoneSignalPack): AnalysisPanelData {
  const direction =
    input.trend === 'bullish' ? 'Bullish' : input.trend === 'bearish' ? 'Bearish' : 'Neutral';
  const structureUi =
    structure.state === 'trend_up' || structure.state === 'trend_down'
      ? 'Trending'
      : structure.state === 'reversal'
        ? 'Reversal'
        : 'Range';
  return {
    direction,
    structure: structureUi,
    htfBias: input.htfBias ?? 'range',
    zoneState: zoneSignal.zone,
    longConfirmed: zoneSignal.zone === 'long_confirm',
    shortConfirmed: zoneSignal.zone === 'short_confirm',
    score: zoneSignal.score,
    reasons: zoneSignal.reasons.slice(0, 5),
  };
}
