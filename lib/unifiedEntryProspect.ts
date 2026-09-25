/**
 * 현재 진입 타점 — 과거·현재·미래·누적·차트 6축 기반 조건부 적중률(참고).
 * 확정 수익·투자 권유 아님.
 */
import type { AnalyzeResponse } from '@/types';
import type { MtfStatisticsHistoryDashboard } from '@/lib/mtfStatisticsHistoryStore';
import type { MergedIntegratedHubSnapshot } from '@/lib/mergedAnalysisIntegratedHub';
import type { UnifiedMtfAnalysisStatistics } from '@/lib/unifiedMtfAnalysisStatistics';
import type { UnifiedChartFeatureContext } from '@/lib/unifiedChartFeatureContext';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import type { TemporalCompareDigest } from '@/lib/temporalCompareDigest';

export type UnifiedEntryProspectFactor = {
  key: string;
  labelKo: string;
  score: number;
  weight: number;
  detailKo: string;
};

export type UnifiedEntryProspect = {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  gradeLabelKo: string;
  headlineKo: string;
  summaryKo: string;
  pastKo: string | null;
  presentKo: string | null;
  futureKo: string | null;
  historyWinRate: number | null;
  learningRate: number | null;
  chartScore: number | null;
  mtfTierAlignPct: number | null;
  factors: UnifiedEntryProspectFactor[];
  disclaimerKo: string;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function gradeFromScore(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 72) return 'A';
  if (score >= 58) return 'B';
  if (score >= 42) return 'C';
  return 'D';
}

function dirKo(d: string): string {
  if (d === 'LONG') return '롱';
  if (d === 'SHORT') return '숏';
  return '관망';
}

export function buildUnifiedEntryProspect(params: {
  snapshot: MergedIntegratedHubSnapshot;
  analysis: AnalyzeResponse | null | undefined;
  plan: UnifiedDeskTradePlan;
  temporal: TemporalCompareDigest | null;
  mtfStatistics: UnifiedMtfAnalysisStatistics | null;
  historyDashboard: MtfStatisticsHistoryDashboard | null;
  chartFeatures: UnifiedChartFeatureContext | null;
}): UnifiedEntryProspect | null {
  const master = params.snapshot.masterDirection;
  if (master === 'NEUTRAL' || params.plan.entry <= 0) return null;

  const factors: UnifiedEntryProspectFactor[] = [];
  const learning = params.analysis?.signalLearning;
  const learningRate =
    learning && learning.longCount + learning.shortCount > 0
      ? Math.round(learning.successRate * 1000) / 10
      : null;

  let histRate: number | null = null;
  if (params.historyDashboard && params.historyDashboard.closedCount >= 3) {
    histRate =
      master === 'LONG'
        ? params.historyDashboard.longCallWinRate
        : master === 'SHORT'
          ? params.historyDashboard.shortCallWinRate
          : params.historyDashboard.winRate;
  } else if (params.historyDashboard?.closedCount) {
    histRate = params.historyDashboard.winRate;
  }

  if (params.temporal) {
    const sim = params.analysis?.similarBriefing;
    const pastScore = clamp(
      (sim?.similarity ?? 0) * 0.55 +
        (params.temporal.pastVerdict.direction === master ? 28 : params.temporal.pastVerdict.direction === 'WATCH' ? 8 : 0),
      0,
      100
    );
    factors.push({
      key: 'past',
      labelKo: '과거 유사',
      score: Math.round(pastScore),
      weight: 0.18,
      detailKo: params.temporal.pastVerdict.oneLine.slice(0, 48),
    });
  }

  const gates = params.snapshot.consensus.gatesPassCount;
  const presentScore = clamp(
    (gates / 5) * 55 +
      (params.temporal?.presentVerdict.direction === master ? 25 : 8) +
      (params.snapshot.gauges.syncPct >= 60 ? 12 : 0),
    0,
    100
  );
  factors.push({
    key: 'present',
    labelKo: '현재 구조',
    score: Math.round(presentScore),
    weight: 0.22,
    detailKo: params.temporal?.presentVerdict.oneLine.slice(0, 48) ?? `확정 ${gates}/5 · 연동 ${params.snapshot.gauges.syncPct}%`,
  });

  const futureDir = params.temporal?.futureVerdict.direction;
  const futureScore = clamp(
    (futureDir === master ? 38 : futureDir === 'WATCH' ? 12 : 6) +
      Math.max(
        params.temporal?.futureVerdict.strength0to100 ?? 0,
        params.analysis?.probability?.longProbability ?? 0,
        params.analysis?.probability?.shortProbability ?? 0
      ) *
        0.35 -
      (params.temporal?.conflict ? 18 : 0),
    0,
    100
  );
  factors.push({
    key: 'future',
    labelKo: '미래 경로',
    score: Math.round(futureScore),
    weight: 0.16,
    detailKo: params.temporal?.futureVerdict.oneLine.slice(0, 48) ?? '경로·빔 대기',
  });

  if (histRate != null) {
    factors.push({
      key: 'history',
      labelKo: '누적 검증',
      score: Math.round(histRate),
      weight: 0.2,
      detailKo: `MTF 히스토리 ${dirKo(master)} ${histRate}% (${params.historyDashboard!.closedCount}건)`,
    });
  }

  if (learningRate != null) {
    factors.push({
      key: 'learning',
      labelKo: '학습 표본',
      score: Math.round(learningRate),
      weight: 0.12,
      detailKo: `확정 ${learning!.longCount + learning!.shortCount}건 · TP1 ${learning!.tp1Count} SL ${learning!.slCount}`,
    });
  }

  const chartScore = params.chartFeatures?.compositeScore ?? null;
  if (chartScore != null) {
    const aligned = params.chartFeatures!.chips.filter((c) => c.active && c.aligned).length;
    const active = params.chartFeatures!.chips.filter((c) => c.active).length;
    factors.push({
      key: 'chart',
      labelKo: '차트 6축',
      score: chartScore,
      weight: 0.12,
      detailKo: `정렬 ${aligned}/${active || 6} · ${params.chartFeatures!.summaryKo}`,
    });
  }

  let mtfTierAlignPct: number | null = null;
  if (params.mtfStatistics?.tiers.length) {
    const alignedTiers = params.mtfStatistics.tiers.filter((t) => t.dominantDirection === master).length;
    mtfTierAlignPct = Math.round((alignedTiers / params.mtfStatistics.tiers.length) * 100);
    factors.push({
      key: 'mtfTier',
      labelKo: 'MTF tier',
      score: mtfTierAlignPct,
      weight: 0.1,
      detailKo: `${alignedTiers}/${params.mtfStatistics.tiers.length} tier ${dirKo(master)}`,
    });
  }

  const weightSum = factors.reduce((s, f) => s + f.weight, 0) || 1;
  const score = Math.round(
    factors.reduce((s, f) => s + f.score * (f.weight / weightSum), 0)
  );
  const clamped = clamp(score, 0, 100);
  const grade = gradeFromScore(clamped);

  const gradeLabelKo =
    grade === 'A'
      ? '다축 정렬 양호 — 조건 검증 후 참고'
      : grade === 'B'
        ? '부분 정렬 — HTF·무효 우선'
        : grade === 'C'
          ? '신호 분산 — 추가 확인'
          : '표본·정렬 부족 — 관망 권장';

  return {
    score: clamped,
    grade,
    gradeLabelKo,
    headlineKo: `진입 참고 ${clamped}% · ${grade} · ${dirKo(master)}`,
    summaryKo: [
      `E ${Math.round(params.plan.entry)} SL ${Math.round(params.plan.stopLoss)}`,
      params.plan.sourceKo,
      gradeLabelKo,
    ].join(' · '),
    pastKo: params.temporal?.pastVerdict.oneLine ?? null,
    presentKo: params.temporal?.presentVerdict.oneLine ?? null,
    futureKo: params.temporal?.futureVerdict.oneLine ?? null,
    historyWinRate: histRate,
    learningRate,
    chartScore,
    mtfTierAlignPct,
    factors,
    disclaimerKo: '과거·누적·유사 케이스 기반 조건부 참고 — 확정 수익·승률 보장 아님',
  };
}
