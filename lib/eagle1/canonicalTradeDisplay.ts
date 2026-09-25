/**
 * 독수리1호 · 통합분석 — 화면용 매매 타점 1세트.
 * SuperStats Hub가 있으면 그것만. 없으면 기존 초강통계 → MainPlan → ActiveTrade.
 * 롱·숏 동시 표시 금지.
 */
import type { AnalyzeResponse } from '@/types';
import type { MasterFuturesDecision } from '@/lib/mergedDeskMasterFuturesDecision';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import type { Eagle1MainPlan } from '@/lib/eagle1/signalEngine';
import {
  buildMergedDeskSuperAdvancedStats,
  type MergedDeskSuperAdvancedStats,
} from '@/lib/mergedDeskSuperAdvancedStats';
import type { SuperStatsHubPack } from '@/lib/mergedDeskSuperStatsHub';
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import { AI_SUPER_BIANSHEN_STATS } from '@/lib/eagle1/aiSuperBianShenStats';

export type Eagle1CanonicalTradeDisplay = {
  direction: 'LONG' | 'SHORT' | 'WAIT';
  directionKo: string;
  entry: number | null;
  entryHigh: number | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  entryAllowed: boolean;
  sourceKo: string;
  noteKo: string;
  superStats: MergedDeskSuperAdvancedStats;
};

function asMainPlan(raw: unknown): Eagle1MainPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as Eagle1MainPlan;
}

function fromStats(
  superStats: MergedDeskSuperAdvancedStats,
  sourceKo: string
): Eagle1CanonicalTradeDisplay {
  if (superStats.verdict === 'CONFIRMED_LONG' || superStats.verdict === 'LONG_WATCH') {
    return {
      direction: 'LONG',
      directionKo: superStats.verdictKo,
      entry: superStats.entry,
      entryHigh: superStats.entry,
      stopLoss: superStats.stopLoss,
      tp1: superStats.tp1,
      tp2: superStats.tp2,
      tp3: superStats.tp3,
      entryAllowed: superStats.entryAllowed,
      sourceKo,
      noteKo: superStats.sampleHintKo,
      superStats,
    };
  }
  if (superStats.verdict === 'CONFIRMED_SHORT' || superStats.verdict === 'SHORT_WATCH') {
    return {
      direction: 'SHORT',
      directionKo: superStats.verdictKo,
      entry: superStats.entry,
      entryHigh: superStats.entry,
      stopLoss: superStats.stopLoss,
      tp1: superStats.tp1,
      tp2: superStats.tp2,
      tp3: superStats.tp3,
      entryAllowed: superStats.entryAllowed,
      sourceKo,
      noteKo: superStats.sampleHintKo,
      superStats,
    };
  }
  return {
    direction: 'WAIT',
    directionKo: superStats.verdictKo || '대기',
    entry: null,
    entryHigh: null,
    stopLoss: null,
    tp1: null,
    tp2: null,
    tp3: null,
    entryAllowed: false,
    sourceKo,
    noteKo: superStats.sampleHintKo || '합의 부족 · 대기',
    superStats,
  };
}

export function buildEagle1CanonicalTradeDisplay(params: {
  analysis?: AnalyzeResponse | null;
  master?: MasterFuturesDecision | null;
  activeTrade?: MergedDeskActiveTradePlan | null;
  judgment?: MergedTradeJudgment | null;
  tradePlan?: UnifiedDeskTradePlan | null;
  confluenceHint?: string | null;
  /** deskEngine SuperStats Hub — 있으면 최우선 */
  hub?: SuperStatsHubPack | null;
}): Eagle1CanonicalTradeDisplay {
  const analysis = params.analysis ?? null;
  const master = params.master ?? null;
  const active = params.activeTrade ?? null;
  const main = asMainPlan(analysis?.eagle1MainPlan);

  /** 0) Hub — 앱 전역 1판정 */
  if (params.hub?.stats) {
    return fromStats(params.hub.stats, AI_SUPER_BIANSHEN_STATS);
  }

  const superStats = buildMergedDeskSuperAdvancedStats({
    master,
    judgment: params.judgment,
    analysis,
    tradePlan: params.tradePlan ?? active?.asUnifiedPlan ?? null,
    confluenceHint: params.confluenceHint,
  });

  /** 1) 超强统计 확정·감시 */
  if (
    superStats.verdict === 'CONFIRMED_LONG' ||
    superStats.verdict === 'LONG_WATCH' ||
    superStats.verdict === 'CONFIRMED_SHORT' ||
    superStats.verdict === 'SHORT_WATCH'
  ) {
    return fromStats(superStats, '超强统计');
  }

  /** 2) eagle1 MainPlan — 마스터 WAIT일 때 */
  if (main?.direction === 'LONG' || main?.direction === 'SHORT') {
    return {
      direction: main.direction,
      directionKo: main.direction === 'LONG' ? '롱감시' : '숏감시',
      entry:
        main.entryLow != null && main.entryHigh != null
          ? (main.entryLow + main.entryHigh) / 2
          : main.entryLow ?? null,
      entryHigh: main.entryHigh ?? main.entryLow ?? null,
      stopLoss: main.sl ?? null,
      tp1: main.tp1 ?? null,
      tp2: main.tp2 ?? null,
      tp3: main.tp3 ?? null,
      entryAllowed: main.status === 'CONFIRMED_LONG' || main.status === 'CONFIRMED_SHORT',
      sourceKo: 'MainPlan',
      noteKo: '단일 판정 · 확정 수익 아님',
      superStats,
    };
  }

  /** 3) ActiveTrade — 방향이 마스터/통계와 같을 때만 */
  if (
    active &&
    (active.direction === 'LONG' || active.direction === 'SHORT') &&
    active.entry > 0 &&
    (!(master?.side === 'LONG' || master?.side === 'SHORT') || master.side === active.direction)
  ) {
    return {
      direction: active.direction,
      directionKo: active.statusKo || (active.direction === 'LONG' ? '롱' : '숏'),
      entry: active.entry,
      entryHigh: active.entry,
      stopLoss: active.stopLoss > 0 ? active.stopLoss : null,
      tp1: active.tp1 > 0 ? active.tp1 : null,
      tp2: active.tp2 > 0 ? active.tp2 : null,
      tp3: active.tp3 > 0 ? active.tp3 : null,
      entryAllowed: Boolean(active.entryAllowed),
      sourceKo: active.sourceKo || 'ActiveTrade',
      noteKo: active.invalidationKo || '참고·확정수익 아님',
      superStats,
    };
  }

  return fromStats(superStats, '超强统计');
}
