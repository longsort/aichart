import type { Verdict } from '@/types';
import type { RegimeResult } from './regimeEngine';

export type SignalScoreInput = {
  structure: {
    trend?: 'bullish' | 'bearish' | 'range';
    bos: unknown[];
    choch: unknown[];
    fvg: unknown[];
    sweeps: unknown[];
    patterns: Array<{ bias?: string }>;
    score?: number;
  };
  volumeDelta?: number;
  orderbookImbalance?: number;
  oiState?: 'increasing' | 'decreasing' | 'neutral';
  fundingState?: 'positive' | 'negative' | 'neutral';
  longShortRatio?: number;
  regime: RegimeResult;
  mtfAlignmentScore?: number;
  patternRecallScore?: number;
};

export type SignalScoreResult = {
  signal: Verdict;
  longScore: number;
  shortScore: number;
  reason: string[];
};

/** LONG / SHORT / WATCH 결정은 서버 엔진만 수행. AI는 변경하지 않음 */
export function computeSignalScore(input: SignalScoreInput): SignalScoreResult {
  const reason: string[] = [];
  let longScore = 50;
  let shortScore = 50;

  const { structure, regime, mtfAlignmentScore = 50 } = input;

  if (structure.trend === 'bullish') {
    longScore += 15;
    shortScore -= 15;
    reason.push('구조 상승');
  } else if (structure.trend === 'bearish') {
    shortScore += 15;
    longScore -= 15;
    reason.push('구조 하락');
  }

  const fvg = (structure.fvg || []) as Array<{ bias: string }>;
  longScore += fvg.filter(f => f.bias === 'bullish').length * 5;
  shortScore += fvg.filter(f => f.bias === 'bearish').length * 5;
  shortScore -= fvg.filter(f => f.bias === 'bullish').length * 5;
  longScore -= fvg.filter(f => f.bias === 'bearish').length * 5;

  const sweeps = (structure.sweeps || []) as Array<{ side: string }>;
  if (sweeps.some(s => s.side === 'sell')) {
    longScore += 8;
    reason.push('매도 유동성 스윕');
  }
  if (sweeps.some(s => s.side === 'buy')) {
    shortScore += 8;
    reason.push('매수 유동성 스윕');
  }

  (structure.patterns || []).forEach((p: { bias?: string }) => {
    if (p.bias === 'bullish') { longScore += 6; shortScore -= 6; }
    else if (p.bias === 'bearish') { shortScore += 6; longScore -= 6; }
  });

  if (input.volumeDelta != null) {
    if (input.volumeDelta > 0) { longScore += 5; shortScore -= 5; reason.push('볼륨 델타 매수'); }
    else if (input.volumeDelta < 0) { shortScore += 5; longScore -= 5; reason.push('볼륨 델타 매도'); }
  }

  if (input.orderbookImbalance != null) {
    if (input.orderbookImbalance > 0.05) { longScore += 4; shortScore -= 4; }
    else if (input.orderbookImbalance < -0.05) { shortScore += 4; longScore -= 4; }
  }

  if (regime.regime === 'trend_up') { longScore += 8; shortScore -= 8; }
  else if (regime.regime === 'trend_down') { shortScore += 8; longScore -= 8; }
  else if (regime.regime === 'squeeze') { reason.push('스퀴즈'); }

  if (mtfAlignmentScore >= 70) {
    longScore += 6;
    shortScore += 6;
    reason.push('MTF 정렬');
  } else if (mtfAlignmentScore <= 40) {
    longScore -= 4;
    shortScore -= 4;
    reason.push('MTF 불일치');
  }

  if (input.patternRecallScore != null && input.patternRecallScore > 0.7) {
    longScore += 3;
    shortScore += 3;
  }

  longScore = Math.max(0, Math.min(100, longScore));
  shortScore = Math.max(0, Math.min(100, shortScore));

  let signal: Verdict = 'WATCH';
  if (longScore >= 58 && longScore - shortScore >= 12) {
    signal = 'LONG';
    reason.unshift('롱 신호');
  } else if (shortScore >= 58 && shortScore - longScore >= 12) {
    signal = 'SHORT';
    reason.unshift('숏 신호');
  } else {
    reason.unshift('관망');
  }

  return { signal, longScore, shortScore, reason };
}
