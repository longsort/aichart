/**
 * 신호감지 라이브 카드 순서 — 사용자 배치 · localStorage.
 */
import type { SignalLiveRow } from '@/lib/eagle1Tapoint/signalLiveBriefing';

const KEY = 'ailongshort.eagle1Tapoint.sigLiveCardOrder.v1';

/** 엔진 기본 순서 (decision 다음 coinAuto) */
export const DEFAULT_SIG_LIVE_CARD_ORDER: string[] = [
  'decision',
  'coinAuto',
  'sweepLive',
  'htfSweep',
  'candleRsiAdv',
  'volBurst',
  'advVol',
  'dailyFace',
  'gate',
  'event',
  'flow',
  'hist',
];

export function readSigLiveCardOrder(): string[] {
  if (typeof window === 'undefined') return [...DEFAULT_SIG_LIVE_CARD_ORDER];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [...DEFAULT_SIG_LIVE_CARD_ORDER];
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j) || !j.length) return [...DEFAULT_SIG_LIVE_CARD_ORDER];
    const ids = j.map((x) => String(x || '')).filter(Boolean);
    return mergeOrderWithDefaults(ids);
  } catch {
    return [...DEFAULT_SIG_LIVE_CARD_ORDER];
  }
}

export function writeSigLiveCardOrder(order: string[]): string[] {
  const next = mergeOrderWithDefaults(order);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}

export function resetSigLiveCardOrder(): string[] {
  return writeSigLiveCardOrder([...DEFAULT_SIG_LIVE_CARD_ORDER]);
}

function mergeOrderWithDefaults(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of DEFAULT_SIG_LIVE_CARD_ORDER) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function sortSigLiveRowsByOrder(
  rows: SignalLiveRow[],
  order: string[]
): SignalLiveRow[] {
  if (!rows?.length) return [];
  const map = new Map(rows.map((r) => [r.id, r]));
  const out: SignalLiveRow[] = [];
  const used = new Set<string>();
  for (const id of order) {
    const row = map.get(id);
    if (!row || used.has(id)) continue;
    out.push(row);
    used.add(id);
  }
  for (const row of rows) {
    if (used.has(row.id)) continue;
    out.push(row);
    used.add(row.id);
  }
  return out;
}

export function moveSigLiveCard(
  order: string[],
  id: string,
  dir: 'up' | 'down'
): string[] {
  const list = mergeOrderWithDefaults(order);
  const i = list.indexOf(id);
  if (i < 0) return list;
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  const tmp = next[i]!;
  next[i] = next[j]!;
  next[j] = tmp;
  return writeSigLiveCardOrder(next);
}

export function reorderSigLiveCard(
  order: string[],
  fromId: string,
  toId: string
): string[] {
  if (!fromId || !toId || fromId === toId) return mergeOrderWithDefaults(order);
  const list = mergeOrderWithDefaults(order);
  const from = list.indexOf(fromId);
  const to = list.indexOf(toId);
  if (from < 0 || to < 0) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return writeSigLiveCardOrder(next);
}
