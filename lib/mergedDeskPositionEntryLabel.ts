/**
 * 실포지션 카드용 · 어떤 신호로 진입했는지 (심볼당 1줄).
 * 확정 수익 아님.
 */
import { markTapointAccumDirty } from '@/lib/tapointAccumDirty';

const KEY = 'ailongshort.mergedDesk.positionEntryLabel.v1';

export type PositionEntryLabel = {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  signalKo: string;
  source?: string | null;
  signalId?: string | null;
  timeframe?: string | null;
  at: number;
};

function normSym(s: string): string {
  const u = String(s || '').toUpperCase();
  if (!u) return '';
  return u.endsWith('USDT') ? u : `${u.replace(/USDT$/i, '')}USDT`;
}

function readAll(): Record<string, PositionEntryLabel> {
  if (typeof window === 'undefined') return {};
  try {
    const j = JSON.parse(window.localStorage.getItem(KEY) || '{}') as Record<
      string,
      PositionEntryLabel
    >;
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, PositionEntryLabel>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** 진입 직후 저장 · 포지션 탭에 표시 */
export function rememberPositionEntryLabel(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  signalKo: string;
  source?: string | null;
  signalId?: string | null;
  timeframe?: string | null;
}): void {
  const symbol = normSym(params.symbol);
  const ko = String(params.signalKo || '').trim();
  if (!symbol || !ko) return;
  const map = readAll();
  map[symbol] = {
    symbol,
    direction: params.direction,
    signalKo: ko.slice(0, 160),
    source: params.source ?? null,
    signalId: params.signalId ?? null,
    timeframe: params.timeframe ?? null,
    at: Date.now(),
  };
  writeAll(map);
  markTapointAccumDirty();
}

export function clearPositionEntryLabel(symbol: string): void {
  const map = readAll();
  delete map[normSym(symbol)];
  writeAll(map);
}

/** 포지션 카드 한 줄용 · 없으면 null */
export function readPositionEntryLabel(
  symbol: string,
  direction?: 'LONG' | 'SHORT' | null
): PositionEntryLabel | null {
  const hit = readAll()[normSym(symbol)];
  if (!hit) return null;
  if (direction && hit.direction !== direction) return null;
  /** 7일 넘으면 폐기 */
  if (Date.now() - (hit.at || 0) > 7 * 24 * 3600 * 1000) return null;
  return hit;
}

/** 화면용 짧은 문구 */
export function formatPositionEntrySignalKo(
  label: PositionEntryLabel | null | undefined,
  fallbackKo?: string | null
): string {
  const raw = String(label?.signalKo || fallbackKo || '').trim();
  if (!raw) return '';
  const src = String(label?.source || '');
  const tf = label?.timeframe ? String(label.timeframe) : '';
  let head = '';
  if (/eagle1-tap|타점/i.test(`${src} ${raw}`)) head = '타점';
  else if (/rb-scalp|초단|Fast/i.test(`${src} ${raw}`)) head = '초단';
  else if (/rocket|로켓|btc-rocket/i.test(`${src} ${raw}`)) head = '로켓';
  else if (src) head = src.slice(0, 12);
  const body = raw.replace(/^\[실시간활동\]\s*/i, '').slice(0, 72);
  const tfBit = tf ? `${tf} · ` : '';
  return head ? `진입신호 · ${tfBit}${head} · ${body}` : `진입신호 · ${tfBit}${body}`;
}
