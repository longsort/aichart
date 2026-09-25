/**
 * 코인별 매매 전기록 — 스킵·확장 메타 헬퍼.
 * 진입/청산 FIRE는 openVirtual·maybeLiveOpen 기존 경로에 메타만 보강.
 * 확정 수익·승률 아님.
 */
import { appendTradeJournalEvent } from '@/lib/mergedDeskTradeEventJournal';

const SKIP_DEDUP_MS = 90_000;
const lastSkipAt = new Map<string, number>();

export function coinTradeOpenMetaExtra(params: {
  evidenceKo?: string | null;
  analysisTags?: string[] | null;
  entryScore?: number | null;
  leverage?: number | null;
  marginUsdt?: number | null;
  size?: number | null;
  netRoePct?: number | null;
  rr?: number | null;
  role?: 'A' | 'B' | string | null;
  fourStrategyId?: string | null;
}): Record<string, string | number | boolean | null> {
  const tags = (params.analysisTags || []).filter(Boolean).slice(0, 12);
  return {
    evidenceKo: params.evidenceKo ?? null,
    entryScore: params.entryScore ?? null,
    leverage: params.leverage ?? null,
    marginUsdt: params.marginUsdt ?? null,
    size: params.size ?? null,
    netRoePct: params.netRoePct ?? null,
    rr: params.rr ?? null,
    role: params.role ?? null,
    fourStrategyId: params.fourStrategyId ?? null,
    tags: tags.length ? tags.join('|') : null,
    ledger: 'coin-trade',
  };
}

/** 게이트·조건미달 스킵 — 90초 동일키 중복 억제 */
export function recordCoinTradeSkip(params: {
  symbol: string;
  timeframe?: string;
  direction?: 'LONG' | 'SHORT' | 'NEUTRAL';
  price?: number | null;
  reasonKo: string;
  source?: string | null;
  role?: 'A' | 'B' | string | null;
  meta?: Record<string, string | number | boolean | null>;
}): void {
  const key = `${String(params.symbol).toUpperCase()}|${params.source || ''}|${params.reasonKo.slice(0, 48)}`;
  const now = Date.now();
  const prev = lastSkipAt.get(key) || 0;
  if (now - prev < SKIP_DEDUP_MS) return;
  lastSkipAt.set(key, now);
  appendTradeJournalEvent({
    symbol: params.symbol,
    chartTf: params.timeframe || '—',
    kind: 'NOTE',
    direction: params.direction || 'NEUTRAL',
    price: params.price != null && params.price > 0 ? params.price : 0,
    levelPrice: params.price != null && params.price > 0 ? params.price : 0,
    levelLabel: '스킵',
    noteKo: `스킵 · ${params.reasonKo}`,
    meta: {
      skip: true,
      source: params.source ?? null,
      role: params.role ?? null,
      ledger: 'coin-trade-skip',
      ...(params.meta || {}),
    },
  });
}
