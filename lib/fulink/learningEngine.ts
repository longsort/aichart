/**
 * 학습 엔진 포팅 (assets/lib engine/learning/learning_engine.dart)
 * 신호/결과 로그 기반 보수성 페널티 (승률 낮을수록 페널티 증가)
 * - 서버에서는 메모리 또는 파일(JSONL) 기반 선택 가능
 */

export type LearningStats = { win: number; loss: number; timeout: number };

const defaultStats: LearningStats = { win: 0, loss: 0, timeout: 0 };

let memoryLog: Array<{ type: string; outcome?: string }> = [];

/** 신호 기록 (선택적 호출) */
export function recordSignal(_payload: {
  symbol: string;
  tf: string;
  conclusion: string;
  confidence: number;
  evidenceCount: number;
  evidenceTotal: number;
  entry?: number;
  stop?: number;
  target?: number;
}) {
  memoryLog.push({ type: 'signal' });
  if (memoryLog.length > 500) memoryLog = memoryLog.slice(-400);
}

/** 결과 기록 (선택적 호출) */
export function recordOutcome(_payload: { symbol: string; tf: string; outcome: string; note?: string }) {
  memoryLog.push({ type: 'outcome', outcome: _payload.outcome });
  if (memoryLog.length > 500) memoryLog = memoryLog.slice(-400);
}

/** 최근 로그에서 승/패/타임아웃 집계 */
export function recentStats(maxLines = 200): LearningStats {
  const take = memoryLog.slice(-maxLines).filter(m => m.type === 'outcome');
  let win = 0, loss = 0, timeout = 0;
  for (const m of take) {
    const o = (m as { outcome?: string }).outcome ?? '';
    if (o === 'win') win++;
    else if (o === 'loss') loss++;
    else if (o === 'timeout') timeout++;
  }
  return { win, loss, timeout };
}

/**
 * 자가보정 페널티 (0~25)
 * - 최근 승률이 낮을수록 페널티 증가 → 확신도/진입 완화
 */
export function conservatismPenalty(window = 120): number {
  const s = recentStats(window);
  const total = s.win + s.loss + s.timeout;
  if (total < 10) return 0;
  const winRate = s.win / total;
  const p = Math.round((0.65 - winRate) * 60);
  if (p <= 0) return 0;
  return Math.min(25, p);
}
