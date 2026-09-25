/**
 * 4전략 ENTRY CANDIDATE 자동 기록 · 전략별 분리.
 * WIN/LOSS/NO_ENTRY 결과 추적. 확정 승률 아님.
 */
import type {
  FourStrategyGrade,
  FourStrategyId,
  FourStrategySide,
  MarketRegime,
} from '@/lib/doksuri1/fourStrategyTypes';

const KEY = 'ailongshort.doksuri1.fourStrategy.candidates.v1';
const MAX = 400;

export type FourStrategyCandidateRecord = {
  id: string;
  strategy: FourStrategyId;
  side: FourStrategySide;
  timeframe: string;
  symbol: string;
  entryTime: number;
  mandatoryCount: number;
  bonusScore: number;
  totalScore: number;
  grade: FourStrategyGrade;
  regime: MarketRegime | string;
  entryPrice: number;
  result: 'WIN' | 'LOSS' | 'NO_ENTRY' | 'OPEN';
  failReason?: string | null;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readFourStrategyCandidates(): FourStrategyCandidateRecord[] {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(KEY), []);
}

export function recordFourStrategyCandidate(
  row: Omit<FourStrategyCandidateRecord, 'id' | 'result'> & {
    id?: string;
    result?: FourStrategyCandidateRecord['result'];
  }
): void {
  if (typeof window === 'undefined') return;
  const list = readFourStrategyCandidates();
  const id =
    row.id ||
    `fc-${row.strategy}-${row.timeframe}-${row.side}-${row.entryTime}`;
  if (list.some((x) => x.id === id)) return;
  list.unshift({
    id,
    strategy: row.strategy,
    side: row.side,
    timeframe: row.timeframe,
    symbol: row.symbol,
    entryTime: row.entryTime,
    mandatoryCount: row.mandatoryCount,
    bonusScore: row.bonusScore,
    totalScore: row.totalScore,
    grade: row.grade,
    regime: row.regime,
    entryPrice: row.entryPrice,
    result: row.result ?? 'OPEN',
    failReason: row.failReason ?? null,
  });
  window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}

export function markFourStrategyCandidateResult(
  id: string,
  result: 'WIN' | 'LOSS' | 'NO_ENTRY',
  failReason?: string
): void {
  if (typeof window === 'undefined') return;
  const list = readFourStrategyCandidates();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  list[i] = { ...list[i]!, result, failReason: failReason ?? list[i]!.failReason };
  window.localStorage.setItem(KEY, JSON.stringify(list));
}
