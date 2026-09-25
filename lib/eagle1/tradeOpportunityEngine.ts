/**
 * TradeOpportunityEngine — MainPlan + combination + 진입품질 → 등급.
 * A_PLUS_LONG | A_LONG | WAIT | A_SHORT | A_PLUS_SHORT | NO_ENTRY
 * 방향 OK여도 타점 불량이면 NO_ENTRY.
 */
import type { Eagle1MainPlan } from './signalEngine';
import type { CombinationReport } from './combinationEngine';
import type { MtfSmartZoneReport } from './mtfSmartZoneEngine';
import type { LegendaryFusionReport } from './legendaryStrategyFusion';
import type { ReEntryReport } from './reEntryEngine';
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';

export type TradeOpportunityGrade =
  | 'A_PLUS_LONG'
  | 'A_LONG'
  | 'WAIT'
  | 'A_SHORT'
  | 'A_PLUS_SHORT'
  | 'NO_ENTRY';

export type TradeOpportunityReport = {
  grade: TradeOpportunityGrade;
  labelEn: string;
  labelKo: string;
  note: string;
  direction: 'LONG' | 'SHORT' | null;
  allowEntry: boolean;
  chartTag: string;
};

const LABEL: Record<TradeOpportunityGrade, { en: string; ko: string }> = {
  A_PLUS_LONG: { en: 'A+ LONG', ko: 'A+ 롱 기회' },
  A_LONG: { en: 'A LONG', ko: 'A 롱 기회' },
  WAIT: { en: 'WAIT', ko: '대기' },
  A_SHORT: { en: 'A SHORT', ko: 'A 숏 기회' },
  A_PLUS_SHORT: { en: 'A+ SHORT', ko: 'A+ 숏 기회' },
  NO_ENTRY: { en: 'NO ENTRY', ko: '진입 불가' },
};

function pack(
  grade: TradeOpportunityGrade,
  note: string,
  direction: 'LONG' | 'SHORT' | null,
  allowEntry: boolean
): TradeOpportunityReport {
  return {
    grade,
    labelEn: LABEL[grade].en,
    labelKo: LABEL[grade].ko,
    note,
    direction,
    allowEntry,
    chartTag: LABEL[grade].en,
  };
}

export function runTradeOpportunityEngine(params: {
  plan: Eagle1MainPlan;
  combination?: CombinationReport | null;
  mtfSmartZone?: MtfSmartZoneReport | null;
  legendary?: LegendaryFusionReport | null;
  reEntry?: ReEntryReport | null;
}): TradeOpportunityReport {
  const plan = params.plan;
  const status = plan.status;
  const poorEntry = plan.entryQuality === 'poor';
  const missed = status === 'LONG_MISSED' || status === 'SHORT_MISSED';
  const reBlock = params.reEntry?.state === 'BLOCKED' || params.reEntry?.state === 'COOLDOWN';
  const promote = Boolean(params.combination?.promoted);
  const sampleOk = plan.sampleSize >= EAGLE1_MIN_STAT_SAMPLE;
  const aPlus =
    params.legendary?.aPlusEligible === true ||
    (promote &&
      sampleOk &&
      (params.mtfSmartZone?.primary?.grade === 'A_PLUS' ||
        params.legendary?.chartTag === 'A+ LONG' ||
        params.legendary?.chartTag === 'A+ SHORT'));

  if (missed) {
    return pack('NO_ENTRY', '추격 금지 · 놓친 진입', plan.direction, false);
  }
  if (poorEntry && (status === 'CONFIRMED_LONG' || status === 'CONFIRMED_SHORT')) {
    return pack('NO_ENTRY', '타점 불량 · 방향과 무관 NO ENTRY', plan.direction, false);
  }
  if (reBlock && (status === 'CONFIRMED_LONG' || status === 'CONFIRMED_SHORT')) {
    return pack('NO_ENTRY', params.reEntry?.note || '재진입 차단', plan.direction, false);
  }
  if (status === 'WAIT') {
    return pack('WAIT', plan.noTradeGates[0] || '조건 미충족 · 대기', null, false);
  }

  if (status === 'CONFIRMED_LONG' || status === 'LONG_WATCH') {
    const grade: TradeOpportunityGrade =
      (status === 'CONFIRMED_LONG' || promote) && aPlus ? 'A_PLUS_LONG' : 'A_LONG';
    return pack(
      grade,
      grade === 'A_PLUS_LONG' ? '표본·조합 승격 롱' : '롱 기회 · A+ 미달 가능',
      'LONG',
      status === 'CONFIRMED_LONG' && !poorEntry && plan.rrGate !== 'reject'
    );
  }

  if (status === 'CONFIRMED_SHORT' || status === 'SHORT_WATCH') {
    const grade: TradeOpportunityGrade =
      (status === 'CONFIRMED_SHORT' || promote) && aPlus ? 'A_PLUS_SHORT' : 'A_SHORT';
    return pack(
      grade,
      grade === 'A_PLUS_SHORT' ? '표본·조합 승격 숏' : '숏 기회 · A+ 미달 가능',
      'SHORT',
      status === 'CONFIRMED_SHORT' && !poorEntry && plan.rrGate !== 'reject'
    );
  }

  return pack('WAIT', '기회 등급 대기', plan.direction, false);
}
