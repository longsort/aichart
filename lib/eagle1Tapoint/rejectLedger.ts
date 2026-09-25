/**
 * REJECTED SETUP / MISSED OPPORTUNITY 기록.
 * 거래한 신호만 저장하지 않음.
 */
import { markTapointAccumDirty } from '@/lib/tapointAccumDirty';

export type TapRejectRecord = {
  id: string;
  symbol: string;
  timeframe: string;
  at: number;
  direction: 'LONG' | 'SHORT' | null;
  decision: string;
  reasonKo: string;
  scores?: Record<string, number>;
  price: number;
  /** 이후 추적 */
  followUp?: {
    checkedAt: number;
    ret3?: number | null;
    ret5?: number | null;
    ret10?: number | null;
    tag?: 'MISSED_WINNER' | 'GOOD_REJECTION' | 'PENDING';
  };
};

const KEY = 'ailongshort.eagle1Tapoint.rejectLedger.v1';
const MAX = 400;

function load(): TapRejectRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const j = JSON.parse(raw);
    return Array.isArray(j) ? (j as TapRejectRecord[]) : [];
  } catch {
    return [];
  }
}

function save(list: TapRejectRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* ignore */
  }
  markTapointAccumDirty();
}

export function appendTapReject(rec: Omit<TapRejectRecord, 'id'> & { id?: string }): void {
  const list = load();
  const id = rec.id || `rej-${rec.symbol}-${rec.at}`;
  if (list.some((x) => x.id === id)) return;
  list.push({ ...rec, id });
  save(list);
}

export function listTapRejects(limit = 40): TapRejectRecord[] {
  return load().slice(-limit).reverse();
}

export function tagMissedOpportunity(params: {
  id: string;
  ret3?: number | null;
  ret5?: number | null;
  ret10?: number | null;
  direction: 'LONG' | 'SHORT' | null;
}): void {
  const list = load();
  const i = list.findIndex((x) => x.id === params.id);
  if (i < 0) return;
  const r = list[i]!;
  const ret = params.ret5 ?? params.ret3 ?? params.ret10 ?? 0;
  const goodDir =
    (params.direction === 'LONG' && ret > 0.004) ||
    (params.direction === 'SHORT' && ret < -0.004);
  const goodReject =
    (params.direction === 'LONG' && ret < -0.003) ||
    (params.direction === 'SHORT' && ret > 0.003);
  r.followUp = {
    checkedAt: Date.now(),
    ret3: params.ret3 ?? null,
    ret5: params.ret5 ?? null,
    ret10: params.ret10 ?? null,
    tag: goodDir ? 'MISSED_WINNER' : goodReject ? 'GOOD_REJECTION' : 'PENDING',
  };
  save(list);
}
