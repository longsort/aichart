/**
 * LegendaryStrategyFusion — 내부 전략군 투표만. UI에 Turtle/Darvas 등 이름 나열 금지.
 * 차트 표기: A+ LONG/SHORT | BREAKOUT | REVERSAL | COMPRESSION | TREND
 * A+는 combination promote + 표본 게이트 시에만.
 */
import type { StructureSnapshot } from './structureEngine';
import type { CombinationReport } from './combinationEngine';
import type { MtfSmartZoneReport } from './mtfSmartZoneEngine';
import type { BigMoveReport } from './bigMoveEngine';
import type { Eagle1MainPlan } from './signalEngine';
import { EAGLE1_MIN_STAT_SAMPLE } from './noFakeNumbers';

/** 차트·HUD에만 노출 */
export type LegendaryChartTag =
  | 'A+ LONG'
  | 'A+ SHORT'
  | 'BREAKOUT'
  | 'REVERSAL'
  | 'COMPRESSION'
  | 'TREND'
  | null;

/** 내부 전용 — UI/텔레그램에 나열하지 않음 */
type InternalFamily =
  | 'trend_follow'
  | 'mean_reversion'
  | 'breakout'
  | 'compression'
  | 'momentum'
  | 'multi_edge';

export type LegendaryFusionReport = {
  chartTag: LegendaryChartTag;
  labelEn: string;
  labelKo: string;
  note: string;
  /** 내부 합의 강도 0~100 — 승률 아님 */
  fusionScore: number | null;
  aPlusEligible: boolean;
  /** 디버그/연구용만 — 기본 HUD에 이름 나열 금지 */
  internalFamilies: InternalFamily[];
};

function empty(note = '데이터 없음'): LegendaryFusionReport {
  return {
    chartTag: null,
    labelEn: 'NONE',
    labelKo: '데이터 없음',
    note,
    fusionScore: null,
    aPlusEligible: false,
    internalFamilies: [],
  };
}

export function runLegendaryStrategyFusion(params: {
  structure: StructureSnapshot;
  plan?: Eagle1MainPlan | null;
  combination?: CombinationReport | null;
  mtfSmartZone?: MtfSmartZoneReport | null;
  bigMove?: BigMoveReport | null;
}): LegendaryFusionReport {
  const plan = params.plan;
  if (!plan) return empty();

  const families: InternalFamily[] = [];
  const regime = params.structure.regime;
  const big = params.bigMove?.state;
  const promoted = params.combination?.promoted;
  const hit = (params.combination?.hits ?? []).find((h) => h.id === promoted) ?? null;
  const sampleOk =
    (hit?.sampleSize ?? plan.sampleSize ?? 0) >= EAGLE1_MIN_STAT_SAMPLE &&
    hit?.promote === true &&
    Boolean(promoted);
  const smartA =
    params.mtfSmartZone?.primary?.grade === 'A_PLUS' ||
    params.mtfSmartZone?.long?.grade === 'A_PLUS' ||
    params.mtfSmartZone?.short?.grade === 'A_PLUS';

  if (regime === 'BULL' || regime === 'BEAR') families.push('trend_follow');
  if (regime === 'RANGE') families.push('mean_reversion');
  if (big === 'COMPRESSION') families.push('compression');
  if (big === 'EXPANSION' || big === 'READY') families.push('momentum');
  if (hit?.id?.includes('breakout')) families.push('breakout');
  if (hit?.id?.includes('reversal')) families.push('mean_reversion');
  if (families.length >= 2) families.push('multi_edge');

  const aPlusEligible = sampleOk && smartA;
  const dir =
    plan.direction === 'LONG' || plan.status === 'CONFIRMED_LONG' || plan.status === 'LONG_WATCH'
      ? 'LONG'
      : plan.direction === 'SHORT' || plan.status === 'CONFIRMED_SHORT' || plan.status === 'SHORT_WATCH'
        ? 'SHORT'
        : null;

  let chartTag: LegendaryChartTag = null;
  if (aPlusEligible && dir === 'LONG') chartTag = 'A+ LONG';
  else if (aPlusEligible && dir === 'SHORT') chartTag = 'A+ SHORT';
  else if (families.includes('breakout') || hit?.id?.includes('breakout')) chartTag = 'BREAKOUT';
  else if (hit?.id?.includes('reversal')) chartTag = 'REVERSAL';
  else if (families.includes('compression') || big === 'COMPRESSION') chartTag = 'COMPRESSION';
  else if (families.includes('trend_follow')) chartTag = 'TREND';

  const scoreParts = [
    families.length * 12,
    aPlusEligible ? 40 : sampleOk ? 22 : 0,
    plan.agreementScore != null ? Math.min(30, plan.agreementScore) : 0,
    params.bigMove?.expansionReady != null ? params.bigMove.expansionReady * 0.15 : 0,
  ];
  const fusionScore = Math.max(0, Math.min(100, Math.round(scoreParts.reduce((a, b) => a + b, 0))));

  if (!chartTag) {
    return {
      ...empty(plan.status === 'WAIT' ? '합의 태그 없음 · 대기' : '차트 태그 약함'),
      fusionScore,
      internalFamilies: families,
    };
  }

  const labelKo =
    chartTag === 'A+ LONG'
      ? 'A+ 롱 합의'
      : chartTag === 'A+ SHORT'
        ? 'A+ 숏 합의'
        : chartTag === 'BREAKOUT'
          ? '돌파형 합의'
          : chartTag === 'REVERSAL'
            ? '반전형 합의'
            : chartTag === 'COMPRESSION'
              ? '압축형 합의'
              : '추세형 합의';

  return {
    chartTag,
    labelEn: chartTag,
    labelKo,
    note: aPlusEligible
      ? '표본 승격·조합 충족 · 확률 아님'
      : '전략군 합의 태그 · 내부 이름 비공개',
    fusionScore,
    aPlusEligible,
    internalFamilies: families,
  };
}
