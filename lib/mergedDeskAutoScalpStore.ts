/**
 * 자동초단 페이퍼 상태·이력 — localStorage + 서버 저널 업로드용.
 */
import type { AutoScalpJournalEvent, AutoScalpPaperTrade } from '@/lib/mergedDeskAutoScalpEngine';
import { summarizeAutoScalpTrades } from '@/lib/mergedDeskAutoScalpEngine';
import { recordFourStrategyClosedTrade } from '@/lib/doksuri1/fourStrategyStats';
import type { FourStrategyId, MarketRegime } from '@/lib/doksuri1/fourStrategyTypes';
import { FOUR_STRATEGY_IDS } from '@/lib/doksuri1/fourStrategyTypes';

const LIVE_KEY = 'ailongshort.mergedDesk.autoScalp.live.v1';
const HIST_KEY = 'ailongshort.mergedDesk.autoScalp.history.v1';
const MAX_HIST = 200;

export type AutoScalpLiveBag = {
  symbol: string;
  timeframe: string;
  trade: AutoScalpPaperTrade | null;
  stripKo: string;
  detailKo: string;
  updatedAt: number;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readAutoScalpLive(symbol: string, timeframe: string): AutoScalpLiveBag | null {
  if (typeof window === 'undefined') return null;
  const all = safeParse<Record<string, AutoScalpLiveBag>>(window.localStorage.getItem(LIVE_KEY), {});
  const k = `${symbol}:${timeframe}`;
  return all[k] ?? null;
}

export function writeAutoScalpLive(bag: AutoScalpLiveBag): void {
  if (typeof window === 'undefined') return;
  try {
    const all = safeParse<Record<string, AutoScalpLiveBag>>(window.localStorage.getItem(LIVE_KEY), {});
    const k = `${bag.symbol}:${bag.timeframe}`;
    all[k] = { ...bag, updatedAt: Date.now() };
    window.localStorage.setItem(LIVE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function readAutoScalpHistory(symbol?: string): AutoScalpPaperTrade[] {
  if (typeof window === 'undefined') return [];
  const rows = safeParse<AutoScalpPaperTrade[]>(window.localStorage.getItem(HIST_KEY), []);
  if (!symbol) return rows;
  return rows.filter((r) => r.symbol === symbol);
}

export function appendAutoScalpHistory(trade: AutoScalpPaperTrade): void {
  if (typeof window === 'undefined') return;
  if (trade.phase !== 'CLOSED') return;
  try {
    const prev = readAutoScalpHistory();
    const next = [trade, ...prev.filter((t) => t.id !== trade.id)].slice(0, MAX_HIST);
    window.localStorage.setItem(HIST_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  /** 4전략 통계 — strategyId 있을 때만 (합산 승률 금지 · 버킷 분리) */
  const sid = trade.fourStrategyId;
  if (sid && (FOUR_STRATEGY_IDS as readonly string[]).includes(sid) && trade.entry != null) {
    const win = (trade.realizedRoePct || 0) > 0.15;
    recordFourStrategyClosedTrade({
      tradeId: trade.id,
      strategyId: sid as FourStrategyId,
      supportingStrategies: (trade.fourSupporting || []).filter((x) =>
        (FOUR_STRATEGY_IDS as readonly string[]).includes(x)
      ) as FourStrategyId[],
      symbol: trade.symbol,
      timeframe: trade.timeframe,
      regime: (trade.fourRegime as MarketRegime) || 'UNKNOWN',
      side: trade.direction,
      entryScore: trade.fourEntryScore ?? 0,
      entryReason: trade.noteKo || 'SCALP',
      entryPrice: trade.entry,
      stopPrice: trade.sl ?? trade.entry,
      tp1: trade.tp1 ?? trade.entry,
      tp2: trade.tp2 ?? trade.entry,
      tp3: trade.tp2 ?? trade.entry,
      leverage: trade.leverage,
      feeRoePct: 0.5,
      slippageRoePct: 0.2,
      grossRoePct: trade.realizedRoePct,
      netRoePct: trade.realizedRoePct - 0.7,
      mfeRoePct: trade.mfeRoePct,
      maeRoePct: trade.maeRoePct,
      holdingBars: trade.barsHeld,
      exitReason: trade.closeReason || 'CLOSE',
      win,
      paper: true,
      closedAt: trade.closedAt || Date.now(),
    });
  }
}

export function autoScalpExpectancyKo(symbol: string): string {
  return summarizeAutoScalpTrades(readAutoScalpHistory(symbol)).expectancyKo;
}

/** 기록부 이벤트로 변환할 페이로드 */
export function autoScalpEventsToJournalRows(
  events: AutoScalpJournalEvent[],
  symbol: string,
  chartTf: string
): Array<{
  symbol: string;
  chartTf: string;
  kind: string;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  price: number;
  levelPrice: number;
  levelLabel: string;
  noteKo: string;
  signalId: string;
  meta?: Record<string, string | number | boolean | null>;
}> {
  return events.map((e) => ({
    symbol,
    chartTf,
    kind: e.kind,
    direction: e.direction,
    price: e.price,
    levelPrice: e.price,
    levelLabel: '자동초단',
    noteKo: e.noteKo,
    signalId: e.tradeId,
    meta: e.meta,
  }));
}
