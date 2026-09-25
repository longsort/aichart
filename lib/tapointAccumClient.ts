/**
 * 타점엔진 누적 · 로컬↔서버 머지 동기.
 * 패치/캐시삭제 후에도 성적·거절·저널·시드·진입라벨 복구.
 * 확정 수익 아님.
 */
import {
  readSignalScorecard,
  type ScoreClosedTrade,
  type ScoreOpenTrade,
  type SignalScorecardStore,
} from '@/lib/mergedDeskSignalScorecard';
import { listTapRejects, type TapRejectRecord } from '@/lib/eagle1Tapoint/rejectLedger';
import { readTradeEventJournal, type TradeJournalEvent } from '@/lib/mergedDeskTradeEventJournal';
import {
  readVirtualSeedLedger,
  writeVirtualSeedLedger,
  type VirtualSeedLedger,
  type VirtualSeedTradeRecord,
} from '@/lib/mergedDeskVirtualSeedLedger';
import { rememberPositionEntryLabel } from '@/lib/mergedDeskPositionEntryLabel';
import { setTapointAccumDirtyHandler } from '@/lib/tapointAccumDirty';

const SCORE_KEY = 'ailongshort.mergedDesk.signalScorecard.v1';
const REJECT_KEY = 'ailongshort.eagle1Tapoint.rejectLedger.v1';
const JOURNAL_KEY = 'ailongshort.mergedDesk.tradeEventJournal.v1';
const LABEL_KEY = 'ailongshort.mergedDesk.positionEntryLabel.v1';
const SCORE_EVT = 'ailongshort-merged-desk-signal-scorecard';

type AccumBlob = {
  updatedAt?: number;
  scorecard?: SignalScorecardStore | null;
  rejects?: TapRejectRecord[] | null;
  journal?: TradeJournalEvent[] | null;
  seedLedger?: VirtualSeedLedger | null;
  entryLabels?: Record<
    string,
    {
      symbol: string;
      direction: 'LONG' | 'SHORT';
      signalKo: string;
      source?: string | null;
      signalId?: string | null;
      timeframe?: string | null;
      at: number;
    }
  > | null;
};

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let hydrating = false;

function mergeByTradeId<T extends { tradeId?: string }>(
  a: T[],
  b: T[],
  timeOf: (t: T) => number,
  max: number
): T[] {
  const map = new Map<string, T>();
  for (const row of [...a, ...b]) {
    const id = String(row.tradeId || '');
    if (!id) continue;
    const prev = map.get(id);
    if (!prev || timeOf(row) >= timeOf(prev)) map.set(id, row);
  }
  return [...map.values()]
    .sort((x, y) => timeOf(y) - timeOf(x))
    .slice(0, max);
}

function mergeByRowId<T extends { id?: string; at?: number }>(
  a: T[],
  b: T[],
  max: number
): T[] {
  const map = new Map<string, T>();
  for (const row of [...a, ...b]) {
    const id = String(row.id || '');
    if (!id) continue;
    const prev = map.get(id);
    if (!prev || Number(row.at || 0) >= Number(prev.at || 0)) map.set(id, row);
  }
  return [...map.values()]
    .sort((x, y) => Number(y.at || 0) - Number(x.at || 0))
    .slice(0, max);
}

function readLocalLabels(): NonNullable<AccumBlob['entryLabels']> {
  if (typeof window === 'undefined') return {};
  try {
    const j = JSON.parse(window.localStorage.getItem(LABEL_KEY) || '{}');
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

function snapshotLocal(): AccumBlob {
  const sc = readSignalScorecard();
  const seed = readVirtualSeedLedger();
  return {
    updatedAt: Date.now(),
    scorecard: sc,
    rejects: listTapRejects(400).reverse(),
    journal: readTradeEventJournal().slice(0, 400),
    seedLedger: seed,
    entryLabels: readLocalLabels(),
  };
}

/** 디바운스 푸시 — 쓰기 직후 호출 */
export function scheduleTapointAccumPush(delayMs = 1200): void {
  if (typeof window === 'undefined' || hydrating) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushTapointAccumNow();
  }, delayMs);
}

export async function pushTapointAccumNow(): Promise<void> {
  if (typeof window === 'undefined' || hydrating) return;
  try {
    const body = snapshotLocal();
    await fetch('/api/eagle1/tapoint-accum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
  } catch {
    /* ignore */
  }
}

function applyScorecard(remote: SignalScorecardStore | null | undefined): boolean {
  if (!remote || typeof window === 'undefined') return false;
  const local = readSignalScorecard();
  const closed = mergeByTradeId(
    local.closed as ScoreClosedTrade[],
    (Array.isArray(remote.closed) ? remote.closed : []) as ScoreClosedTrade[],
    (t) => Number(t.closedAt) || Number(t.openedAt) || 0,
    800
  );
  const open = mergeByTradeId(
    local.open as ScoreOpenTrade[],
    (Array.isArray(remote.open) ? remote.open : []) as ScoreOpenTrade[],
    (t) => Number(t.openedAt) || 0,
    80
  );
  /** 로컬이 더 많고 서버가 비면 유지 */
  if (closed.length === 0 && local.closed.length > 0) return false;
  if (
    closed.length === local.closed.length &&
    open.length === local.open.length &&
    Number(remote.updatedAt) <= Number(local.updatedAt)
  ) {
    return false;
  }
  const next: SignalScorecardStore = {
    open,
    closed,
    updatedAt: Math.max(Number(local.updatedAt) || 0, Number(remote.updatedAt) || 0, Date.now()),
  };
  try {
    window.localStorage.setItem(SCORE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(SCORE_EVT));
  } catch {
    return false;
  }
  return true;
}

function applyRejects(remote: TapRejectRecord[] | null | undefined): boolean {
  if (!remote || typeof window === 'undefined') return false;
  const local = listTapRejects(400).reverse() as TapRejectRecord[];
  if (!remote.length && local.length) return false;
  const merged = mergeByRowId(local, remote, 400);
  if (merged.length <= local.length && remote.length <= local.length) {
    /** 내용 동일하면 스킵 */
    if (merged.length === local.length) return false;
  }
  try {
    window.localStorage.setItem(REJECT_KEY, JSON.stringify(merged));
  } catch {
    return false;
  }
  return true;
}

function applyJournal(remote: TradeJournalEvent[] | null | undefined): boolean {
  if (!remote || typeof window === 'undefined') return false;
  const local = readTradeEventJournal();
  if (!remote.length && local.length) return false;
  const merged = mergeByRowId(local, remote, 800);
  if (merged.length === local.length && Number(remote[0]?.at || 0) <= Number(local[0]?.at || 0)) {
    return false;
  }
  try {
    window.localStorage.setItem(JOURNAL_KEY, JSON.stringify(merged));
  } catch {
    return false;
  }
  return true;
}

function applySeed(remote: VirtualSeedLedger | null | undefined): boolean {
  if (!remote || typeof window === 'undefined') return false;
  const local = readVirtualSeedLedger();
  const remoteTrades = Array.isArray(remote.trades) ? remote.trades : [];
  if (!remoteTrades.length && local.trades.length) return false;
  const map = new Map<string, VirtualSeedTradeRecord>();
  for (const t of [...local.trades, ...remoteTrades]) {
    const id = String(t.id || '');
    if (!id) continue;
    const prev = map.get(id);
    if (!prev || Number(t.closedAt || t.at) >= Number(prev.closedAt || prev.at)) {
      map.set(id, t);
    }
  }
  const trades = [...map.values()]
    .sort((a, b) => Number(b.closedAt || b.at) - Number(a.closedAt || a.at))
    .slice(0, 400);
  if (trades.length < local.trades.length && remoteTrades.length < local.trades.length) {
    return false;
  }
  writeVirtualSeedLedger({
    seedUsdt: Math.max(local.seedUsdt, Number(remote.seedUsdt) || 0, 10),
    equityUsdt:
      Number(remote.updatedAt) >= Number(local.updatedAt)
        ? Number(remote.equityUsdt) || local.equityUsdt
        : local.equityUsdt,
    trades,
    updatedAt: Math.max(local.updatedAt, Number(remote.updatedAt) || 0, Date.now()),
  });
  return true;
}

function applyLabels(remote: AccumBlob['entryLabels']): boolean {
  if (!remote || typeof window === 'undefined') return false;
  let n = 0;
  for (const memo of Object.values(remote)) {
    if (!memo?.symbol || !memo?.signalKo) continue;
    if (memo.direction !== 'LONG' && memo.direction !== 'SHORT') continue;
    rememberPositionEntryLabel({
      symbol: memo.symbol,
      direction: memo.direction,
      signalKo: memo.signalKo,
      source: memo.source ?? null,
      signalId: memo.signalId ?? null,
      timeframe: memo.timeframe ?? null,
    });
    n += 1;
  }
  return n > 0;
}

export type HydrateTapointAccumResult = {
  ok: boolean;
  restoredKo: string;
  closedN: number;
};

/** 부팅 시 1회 · 서버→로컬 머지 후 로컬→서버 백업 */
export async function hydrateTapointAccumFromServer(): Promise<HydrateTapointAccumResult> {
  if (typeof window === 'undefined') {
    return { ok: false, restoredKo: 'SSR', closedN: 0 };
  }
  hydrating = true;
  try {
    const res = await fetch('/api/eagle1/tapoint-accum', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      blob?: AccumBlob;
      error?: string;
    };
    if (!res.ok || !j.ok) {
      return {
        ok: false,
        restoredKo: j.error || '누적복구 실패',
        closedN: readSignalScorecard().closed.length,
      };
    }
    const blob = j.blob || {};
    const bits: string[] = [];
    if (applyScorecard(blob.scorecard || null)) bits.push('성적');
    if (applyRejects(blob.rejects || null)) bits.push('거절');
    if (applyJournal(blob.journal || null)) bits.push('저널');
    if (applySeed(blob.seedLedger || null)) bits.push('시드');
    if (applyLabels(blob.entryLabels || null)) bits.push('진입라벨');

    /** 로컬 보유분 서버 백업(머지) */
    hydrating = false;
    await pushTapointAccumNow();

    const closedN = readSignalScorecard().closed.length;
    return {
      ok: true,
      restoredKo: bits.length
        ? `타점누적 복구 · ${bits.join('+')} · 청산${closedN}`
        : `타점누적 동기 · 청산${closedN} · 패치유지`,
      closedN,
    };
  } catch {
    return {
      ok: false,
      restoredKo: '누적동기 네트워크오류 · 로컬유지',
      closedN: readSignalScorecard().closed.length,
    };
  } finally {
    hydrating = false;
  }
}

if (typeof window !== 'undefined') {
  setTapointAccumDirtyHandler((ms) => scheduleTapointAccumPush(ms));
}
