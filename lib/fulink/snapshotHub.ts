/**
 * Fulink 스타일 Evidence 집계 (assets/lib data/snapshot SnapshotHub 로직 포팅)
 * - Evidence 리스트를 bias, longPct, shortPct, consensus, confidence, state로 집계
 */

export type EvidenceKind = 'trend' | 'momentum' | 'flow' | 'pattern' | 'volatility' | 'risk';

export type Evidence = {
  id: string;
  kind: EvidenceKind;
  tf: string;
  score: number;   // -1..+1
  weight: number;  // 0..1
  confidence: number; // 0..1
  meta?: Record<string, unknown>;
};

export type TradeState = 'allow' | 'caution' | 'block';

export type EngineSnapshot = {
  tsMs: number;
  bias: number;
  longPct: number;
  shortPct: number;
  consensus: number;
  confidence: number;
  state: TradeState;
  top: Evidence[];
};

function emptySnapshot(): EngineSnapshot {
  return {
    tsMs: Date.now(),
    bias: 0,
    longPct: 0.5,
    shortPct: 0.5,
    consensus: 0.5,
    confidence: 0.5,
    state: 'caution',
    top: [],
  };
}

/**
 * Evidence 배열을 한 번에 집계해 EngineSnapshot 생성 (Dart SnapshotHub._emit 로직)
 */
export function aggregateToSnapshot(evidences: Evidence[], last?: EngineSnapshot | null): EngineSnapshot {
  const now = Date.now();
  if (!evidences.length) {
    return last ? { ...last, tsMs: now } : emptySnapshot();
  }

  let wSum = 0, sSum = 0, cSum = 0;
  for (const e of evidences) {
    const w = Math.max(0, Math.min(1.2, e.weight * (0.4 + 0.6 * e.confidence)));
    wSum += w;
    sSum += w * Math.max(-1, Math.min(1, e.score));
    cSum += w * Math.max(0, Math.min(1, e.confidence));
  }

  const bias = wSum <= 0 ? 0 : Math.max(-1, Math.min(1, sSum / wSum));
  const conf = wSum <= 0 ? 0.5 : Math.max(0, Math.min(1, cSum / wSum));

  let variance = 0;
  for (const e of evidences) {
    const d = e.score - bias;
    variance += d * d;
  }
  variance /= evidences.length;
  const consensus = Math.max(0, Math.min(1, 1 - variance));

  const state: TradeState =
    conf >= 0.72 && consensus >= 0.62 ? 'allow' :
    conf >= 0.52 && consensus >= 0.45 ? 'caution' : 'block';

  const top = [...evidences]
    .sort((a, b) => {
      const aa = (a.weight * a.confidence) * Math.abs(a.score);
      const bb = (b.weight * b.confidence) * Math.abs(b.score);
      return bb - aa;
    })
    .slice(0, 8);

  return {
    tsMs: now,
    bias,
    longPct: Math.max(0, Math.min(1, (bias + 1) / 2)),
    shortPct: 1 - Math.max(0, Math.min(1, (bias + 1) / 2)),
    consensus,
    confidence: conf,
    state,
    top,
  };
}
