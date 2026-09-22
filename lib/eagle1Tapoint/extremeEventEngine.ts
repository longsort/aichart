/**
 * §12 EXTREME EVENT — 점수 +10이 아니라 별도 판정.
 * 거래량 폭발만으로 반전 금지 · Acceptance/실패로 CONTINUATION vs REVERSAL 구분.
 */
import { atrAt, type Eagle1Bar, type StructureSnapshot } from '@/lib/eagle1/structureEngine';

export type ExtremeEventKind =
  | 'NONE'
  | 'VOLUME_SHOCK'
  | 'SELLING_CLIMAX_REVERSAL'
  | 'BUYING_CLIMAX_REVERSAL'
  | 'FAILED_BREAKDOWN'
  | 'FAILED_BREAKOUT'
  | 'BREAKDOWN_CONTINUATION'
  | 'BREAKOUT_CONTINUATION'
  | 'STOP_HUNT_RECLAIM';

export type ExtremeEventReport = {
  kind: ExtremeEventKind;
  score: number;
  directionHint: 'LONG' | 'SHORT' | null;
  /** true면 일반 게이트 일부 완화 가능(여전히 ENTRY/LOCATION 필요) */
  allowsEventPath: boolean;
  noteKo: string;
  evidence: string[];
};

function volZ(bars: Eagle1Bar[], i: number, look = 40): number {
  const from = Math.max(1, i - look);
  const vols: number[] = [];
  for (let k = from; k < i; k++) vols.push(Number(bars[k]?.volume) || 0);
  if (vols.length < 8) return 0;
  const mean = vols.reduce((s, v) => s + v, 0) / vols.length;
  const sd = Math.sqrt(
    vols.reduce((s, v) => s + (v - mean) ** 2, 0) / vols.length
  );
  if (!(sd > 0)) return 0;
  return ((Number(bars[i]?.volume) || 0) - mean) / sd;
}

export function runExtremeEventEngine(params: {
  bars: Eagle1Bar[];
  structure: StructureSnapshot | null;
  /** 마감봉 */
  iClosed?: number;
}): ExtremeEventReport {
  const bars = params.bars;
  const n = bars.length;
  const i = params.iClosed ?? Math.max(0, n - 2);
  if (i < 30 || !bars[i]) {
    return {
      kind: 'NONE',
      score: 0,
      directionHint: null,
      allowsEventPath: false,
      noteKo: '이벤트없음',
      evidence: [],
    };
  }

  const closed = bars[i]!;
  const prev = bars[i - 1]!;
  const atr = atrAt(bars.slice(0, i + 1), i + 1) || closed.close * 0.002;
  const z = volZ(bars, i);
  const evidence: string[] = [];
  const range = closed.high - closed.low;
  const body = Math.abs(closed.close - closed.open);
  const drop = prev.close > 0 ? (closed.close - prev.close) / prev.close : 0;
  const lowerWick = Math.min(closed.open, closed.close) - closed.low;
  const upperWick = closed.high - Math.max(closed.open, closed.close);

  const lastSweep = [...(params.structure?.events || [])]
    .reverse()
    .find((e) => e.kind === 'SWEEP' || e.kind === 'FAILED_BREAK');
  const state = params.structure?.state;

  /** 거래량 쇼크만 — 방향 없음 */
  if (z >= 3.0) {
    evidence.push(`VolumeZ=${z.toFixed(1)}`);
  }

  const sellClimaxCandidate =
    z >= 2.8 &&
    drop < -0.004 &&
    lowerWick >= atr * 0.35 &&
    closed.close > closed.low + range * 0.45;

  const buyClimaxCandidate =
    z >= 2.8 &&
    drop > 0.004 &&
    upperWick >= atr * 0.35 &&
    closed.close < closed.high - range * 0.45;

  const failedBd =
    lastSweep?.kind === 'FAILED_BREAK' && lastSweep.bias === 'bullish'
      ? true
      : state === 'SHIFT' &&
        lastSweep?.kind === 'SWEEP' &&
        lastSweep.bias === 'bullish' &&
        closed.close > (lastSweep.level || 0);

  const failedBo =
    lastSweep?.kind === 'FAILED_BREAK' && lastSweep.bias === 'bearish'
      ? true
      : lastSweep?.kind === 'SWEEP' &&
        lastSweep.bias === 'bearish' &&
        closed.close < (lastSweep.level || Infinity);

  /** 급락+고거래인데 종가가 저점 근처 유지 → CONTINUATION (반전 금지) */
  const breakdownCont =
    z >= 2.5 &&
    drop < -0.006 &&
    closed.close <= closed.low + range * 0.25 &&
    body >= range * 0.55;

  const breakoutCont =
    z >= 2.5 &&
    drop > 0.006 &&
    closed.close >= closed.high - range * 0.25 &&
    body >= range * 0.55;

  if (breakdownCont) {
    evidence.push('추가하락 Acceptance');
    return {
      kind: 'BREAKDOWN_CONTINUATION',
      score: 78,
      directionHint: 'SHORT',
      allowsEventPath: true,
      noteKo: '매도쇼크+수용 · 반전아님 · 지속숏 후보',
      evidence,
    };
  }
  if (breakoutCont) {
    evidence.push('추가상승 Acceptance');
    return {
      kind: 'BREAKOUT_CONTINUATION',
      score: 78,
      directionHint: 'LONG',
      allowsEventPath: true,
      noteKo: '매수쇼크+수용 · 지속롱 후보',
      evidence,
    };
  }

  if (sellClimaxCandidate && (failedBd || lowerWick > atr * 0.5)) {
    evidence.push('급락실패·아랫윅·고거래');
    if (failedBd) evidence.push('FailedBreakdown/SweepReclaim');
    return {
      kind: 'SELLING_CLIMAX_REVERSAL',
      score: 86,
      directionHint: 'LONG',
      allowsEventPath: true,
      noteKo: '매도클라이맥스 반전 후보 · 리클레임 확인필요',
      evidence,
    };
  }
  if (buyClimaxCandidate && (failedBo || upperWick > atr * 0.5)) {
    evidence.push('급등실패·윗윅·고거래');
    return {
      kind: 'BUYING_CLIMAX_REVERSAL',
      score: 86,
      directionHint: 'SHORT',
      allowsEventPath: true,
      noteKo: '매수클라이맥스 반전 후보 · 리클레임 확인필요',
      evidence,
    };
  }

  if (failedBd) {
    return {
      kind: 'FAILED_BREAKDOWN',
      score: 72,
      directionHint: 'LONG',
      allowsEventPath: true,
      noteKo: '가짜이탈 · 롱이벤트 후보',
      evidence: [...evidence, 'FailedBreakdown'],
    };
  }
  if (failedBo) {
    return {
      kind: 'FAILED_BREAKOUT',
      score: 72,
      directionHint: 'SHORT',
      allowsEventPath: true,
      noteKo: '가짜돌파 · 숏이벤트 후보',
      evidence: [...evidence, 'FailedBreakout'],
    };
  }

  if (
    lastSweep?.kind === 'SWEEP' &&
    (state === 'RETEST' || state === 'CONFIRMED')
  ) {
    const dir = lastSweep.bias === 'bullish' ? 'LONG' : 'SHORT';
    return {
      kind: 'STOP_HUNT_RECLAIM',
      score: 68,
      directionHint: dir as 'LONG' | 'SHORT',
      allowsEventPath: true,
      noteKo: '스톱헌트 후 재탈환 후보',
      evidence: [...evidence, 'Sweep+ReclaimState'],
    };
  }

  if (z >= 3.0) {
    return {
      kind: 'VOLUME_SHOCK',
      score: 45,
      directionHint: null,
      allowsEventPath: false,
      noteKo: '거래량쇼크만 · 반전판단금지',
      evidence,
    };
  }

  return {
    kind: 'NONE',
    score: 20,
    directionHint: null,
    allowsEventPath: false,
    noteKo: '이벤트없음',
    evidence: [],
  };
}
