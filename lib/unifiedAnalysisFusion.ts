/**
 * 통합 분석 융합 — 구조·MTF·수급·게이트·외부 컨텍스트를 다차원 점수·확인 포인트로 집계.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { AnalyzeResponse } from '@/types';
import type { MergedMtfConsensusResult } from '@/lib/mergedAnalysisMtfConsensus';
import type { MergedIntegratedHubSnapshot } from '@/lib/mergedAnalysisIntegratedHub';
import type { MergedTradeJudgment } from '@/lib/mergedAnalysisTradeJudgment';
import type { MergedTradeSignal } from '@/lib/mergedAnalysisTradeLayer';
import type { UnifiedBriefingExternalContext } from '@/lib/unifiedBriefingExternalContext';
import type { UnifiedMtfAnalysisStatistics } from '@/lib/unifiedMtfAnalysisStatistics';
import type { UnifiedChartFeatureContext } from '@/lib/unifiedChartFeatureContext';
import {
  buildPrecisionScenarios,
  type UnifiedPrecisionScenario,
} from '@/lib/unifiedPrecisionBriefingShared';

export type UnifiedAnalysisDimensionTone = 'strong' | 'weak' | 'neutral' | 'conflict';

export type UnifiedAnalysisDimension = {
  key: string;
  labelKo: string;
  score: number;
  detailKo: string;
  tone: UnifiedAnalysisDimensionTone;
};

export type UnifiedAnalysisKeyLevel = {
  kind: 'support' | 'resistance' | 'entry' | 'sl' | 'tp' | 'invalid' | 'breakout';
  labelKo: string;
  price: number;
  reasonKo?: string;
};

export type UnifiedAnalysisConfirmationPoint = {
  labelKo: string;
  met: boolean;
  detailKo?: string;
};

export type UnifiedAnalysisFusion = {
  depthScore: number;
  depthGrade: 'A' | 'B' | 'C' | 'D';
  depthLabelKo: string;
  dimensions: UnifiedAnalysisDimension[];
  keyLevels: UnifiedAnalysisKeyLevel[];
  confirmationPoints: UnifiedAnalysisConfirmationPoint[];
  rsiContextKo: string | null;
  regimeContextKo: string | null;
  mtfAlignmentKo: string | null;
  headlineKo: string;
  summaryKo: string;
  enhancedScenarios: UnifiedPrecisionScenario[];
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function dirKo(d: string): string {
  if (d === 'LONG') return '롱';
  if (d === 'SHORT') return '숏';
  return '관망';
}

function toneFromScore(score: number, conflict?: boolean): UnifiedAnalysisDimensionTone {
  if (conflict) return 'conflict';
  if (score >= 72) return 'strong';
  if (score >= 48) return 'neutral';
  return 'weak';
}

function gradeFromDepth(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 78) return 'A';
  if (score >= 62) return 'B';
  if (score >= 45) return 'C';
  return 'D';
}

function fmtPrice(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 1 : 2 });
}

function buildRsiContextKo(analysis: AnalyzeResponse | null | undefined): string | null {
  const rsiArr = analysis?.indicators?.rsi;
  if (!rsiArr?.length) return null;
  const rsi = rsiArr[rsiArr.length - 1];
  if (!Number.isFinite(rsi)) return null;
  const zone =
    rsi >= 70 ? '과매수권' : rsi <= 30 ? '과매도권' : rsi >= 55 ? '상단' : rsi <= 45 ? '하단' : '중립';
  return `RSI ${Math.round(rsi)} · ${zone} (조건부)`;
}

function buildRegimeContextKo(analysis: AnalyzeResponse | null | undefined): string | null {
  const parts: string[] = [];
  if (analysis?.regime) parts.push(`레짐 ${analysis.regime}`);
  const mtf = analysis?.mtf;
  if (mtf?.htfBias) parts.push(`HTF ${mtf.htfBias}`);
  if (mtf?.ltfEntryBias) parts.push(`LTF ${mtf.ltfEntryBias}`);
  if (mtf?.alignmentScore != null) parts.push(`정렬 ${Math.round(mtf.alignmentScore)}%`);
  if (analysis?.probability?.reason?.[0]) parts.push(analysis.probability.reason[0].slice(0, 48));
  return parts.length ? parts.join(' · ') : null;
}

function buildKeyLevels(params: {
  analysis: AnalyzeResponse | null | undefined;
  trade: MergedTradeSignal | null | undefined;
  snapshot: MergedIntegratedHubSnapshot;
  chartFeatures?: UnifiedChartFeatureContext | null;
}): UnifiedAnalysisKeyLevel[] {
  const { analysis, trade, snapshot, chartFeatures } = params;
  const levels: UnifiedAnalysisKeyLevel[] = [];
  const push = (kind: UnifiedAnalysisKeyLevel['kind'], labelKo: string, price: number | null | undefined, reasonKo?: string) => {
    if (price == null || !Number.isFinite(price) || price <= 0) return;
    if (levels.some((l) => l.kind === kind && Math.abs(l.price - price) < price * 0.0005)) return;
    levels.push({ kind, labelKo, price, reasonKo });
  };

  const plan = params.snapshot.unifiedTradePlan;
  if (plan && plan.entry > 0) {
    push('entry', '진입 E', plan.entry);
    push('sl', '손절 SL', plan.stopLoss, plan.invalidationKo);
    push('tp', 'TP1', plan.tp1);
    push('tp', 'TP2', plan.tp2);
    push('tp', 'TP3', plan.tp3);
  }

  push('support', '지지', analysis?.supportLevel?.price, analysis?.supportLevel?.reason);
  push('resistance', '저항', analysis?.resistanceLevel?.price, analysis?.resistanceLevel?.reason);
  push('breakout', '돌파', analysis?.breakoutLevel?.price, analysis?.breakoutLevel?.reason);
  if (!plan?.stopLoss) {
    push('invalid', '무효', analysis?.invalidationLevel?.price ?? trade?.stopLoss, analysis?.invalidationLevel?.reason);
  }
  if (!plan?.entry) {
    push('entry', '진입', trade?.entry ?? snapshot.tradeLevels.entry);
  }
  if (!plan?.stopLoss) {
    push('sl', 'SL', trade?.stopLoss ?? snapshot.tradeLevels.stopLoss);
  }
  if (!plan?.tp1) {
    push('tp', 'TP1', trade?.tp1 ?? snapshot.tradeLevels.tp1);
    push('tp', 'TP2', trade?.tp2 ?? snapshot.tradeLevels.tp2);
    push('tp', 'TP3', trade?.tp3 ?? snapshot.tradeLevels.tp3);
  }

  const card = analysis?.zoneBiasCard;
  if (card?.low && card?.high) {
    push('support', 'OB 하단', card.low);
    push('resistance', 'OB 상단', card.high);
  }

  if (chartFeatures?.nearestDemand) {
    push('support', chartFeatures.nearestDemand.labelKo, zoneMid(chartFeatures.nearestDemand), '차트 demand zone');
  }
  if (chartFeatures?.nearestSupply) {
    push('resistance', chartFeatures.nearestSupply.labelKo, zoneMid(chartFeatures.nearestSupply), '차트 supply zone');
  }
  if (chartFeatures?.activeFvg) {
    const f = chartFeatures.activeFvg;
    push(
      f.bias === 'bullish' ? 'support' : 'resistance',
      f.labelKo,
      (f.top + f.bot) / 2,
      `${f.bot.toFixed(0)}~${f.top.toFixed(0)}`
    );
  }

  return levels.sort((a, b) => b.price - a.price);
}

function zoneMid(z: { top: number; bot: number; price?: number }): number {
  if (Number.isFinite(z.price) && (z.price ?? 0) > 0) return z.price!;
  return (z.top + z.bot) / 2;
}

function buildEnhancedScenarios(params: {
  analysis: AnalyzeResponse | null | undefined;
  trade: MergedTradeSignal | null | undefined;
  masterDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  consensus: MergedMtfConsensusResult;
  mtfStatistics: UnifiedMtfAnalysisStatistics | null;
}): UnifiedPrecisionScenario[] {
  const base = buildPrecisionScenarios({
    analysis: params.analysis,
    trade: params.trade,
    masterDirection: params.masterDirection,
  });

  const mtfHint =
    params.consensus.finalDirection !== 'NEUTRAL'
      ? `MTF ${dirKo(params.consensus.finalDirection)} ${params.consensus.alignedTfCount}TF`
      : null;
  const statHint = params.mtfStatistics
    ? `통계 ${dirKo(params.mtfStatistics.statisticalVerdict)} L${params.mtfStatistics.weightedLongPct}%`
    : null;
  const mustBreak = params.analysis?.mustBreak;
  const mustHold = params.analysis?.mustHold;

  return base.map((sc) => {
    if (sc.key === 'bull') {
      const extras = [mtfHint, statHint, mustBreak ? `돌파: ${mustBreak}` : null].filter(Boolean);
      return extras.length
        ? { ...sc, lineKo: `${sc.lineKo} · ${extras.join(' · ')}`.slice(0, 180) }
        : sc;
    }
    if (sc.key === 'bear') {
      const extras = [mtfHint, mustHold ? `유지: ${mustHold}` : null].filter(Boolean);
      return extras.length ? { ...sc, lineKo: `${sc.lineKo} · ${extras.join(' · ')}`.slice(0, 180) } : sc;
    }
    return sc;
  });
}

export function buildUnifiedAnalysisFusion(params: {
  snapshot: MergedIntegratedHubSnapshot;
  analysis: AnalyzeResponse | null | undefined;
  trade: MergedTradeSignal | null | undefined;
  judgment: MergedTradeJudgment | null | undefined;
  external?: UnifiedBriefingExternalContext | null;
  mtfStatistics?: UnifiedMtfAnalysisStatistics | null;
  chartFeatures?: UnifiedChartFeatureContext | null;
}): UnifiedAnalysisFusion {
  const { snapshot: s, analysis, trade, judgment, external, mtfStatistics } = params;
  const chartFeatures = params.chartFeatures ?? s.chartFeatures ?? null;
  const master = s.masterDirection;
  const consensus = s.consensus;

  const structureScore = clamp(
    (analysis?.structureBouncePath ? 28 : 0) +
      (analysis?.zoneBiasCard ? 22 : 0) +
      (analysis?.patternVisionSummary ? 12 : 0) +
      (analysis?.dominantPattern ? 10 : 0) +
      (analysis?.confirmedSignal?.structure ? 18 : 0) +
      (s.gauges.syncPct >= 60 ? 10 : 0),
    0,
    100
  );

  const mtfScore = clamp(
    (consensus.alignedTfCount / Math.max(consensus.rows.length, 1)) * 55 +
      consensus.confidence * 0.35 +
      (consensus.finalDirection === master ? 18 : consensus.finalDirection === 'NEUTRAL' ? 6 : 0) -
      (consensus.mtfBlocked ? 22 : 0) -
      (consensus.conflict ? 12 : 0),
    0,
    100
  );

  const buy = analysis?.buyPressure ?? 50;
  const sell = analysis?.sellPressure ?? 50;
  const flowAligned =
    master === 'LONG' ? buy > sell + 4 : master === 'SHORT' ? sell > buy + 4 : Math.abs(buy - sell) < 8;
  const flowScore = clamp(
    (flowAligned ? 35 : 12) +
      (analysis?.oiState === 'increasing' && master === 'LONG' ? 15 : 0) +
      (analysis?.oiState === 'decreasing' && master === 'SHORT' ? 15 : 0) +
      (analysis?.liquidityState === 'above' && master === 'LONG' ? 10 : 0) +
      (analysis?.liquidityState === 'below' && master === 'SHORT' ? 10 : 0) +
      Math.min(30, Math.abs(buy - sell) * 0.4),
    0,
    100
  );

  const gatesScore = clamp(
    (consensus.gatesPassCount / 5) * 70 + s.gauges.gatesPct * 0.25 - (consensus.mtfBlocked ? 15 : 0),
    0,
    100
  );

  let externalScore = 50;
  if (external?.whale) {
    externalScore += external.whale.alignedWithMaster ? 28 : -18;
  }
  if (external?.news?.level === 'HIGH') externalScore -= 12;
  if (external?.signalHistory?.alignedWithMaster) externalScore += 12;
  externalScore = clamp(externalScore, 0, 100);

  const tradeAligned =
    !trade || trade.primary === 'NEUTRAL' || trade.primary === master || master === 'NEUTRAL';
  const tradeScore = clamp(
    (tradeAligned ? 42 : 14) +
      (judgment?.direction === master ? 22 : 0) +
      (s.gauges.rr != null && s.gauges.rr >= 1.5 ? 18 : s.gauges.rr != null ? 8 : 0) +
      (trade ? 12 : 0),
    0,
    100
  );

  const dimensions: UnifiedAnalysisDimension[] = [
    {
      key: 'structure',
      labelKo: '구조·패턴',
      score: Math.round(structureScore),
      detailKo: analysis?.structureBouncePath?.headline ?? analysis?.patternVisionSummary?.slice(0, 40) ?? '구조 데이터 수집',
      tone: toneFromScore(structureScore),
    },
    {
      key: 'chartZone',
      labelKo: '차트 ZONE',
      score: Math.round(chartFeatures?.zoneScore ?? 20),
      detailKo: chartFeatures?.chips.find((c) => c.key === 'zone')?.detailKo ?? 'zone 대기',
      tone: toneFromScore(
        chartFeatures?.zoneScore ?? 20,
        chartFeatures ? !chartFeatures.chips.find((c) => c.key === 'zone')?.aligned : false
      ),
    },
    {
      key: 'chartConfirm',
      labelKo: '롱·숏 확정',
      score: Math.round(chartFeatures?.confirmScore ?? 15),
      detailKo: chartFeatures?.lastConfirm?.labelKo ?? '확정 대기',
      tone: toneFromScore(
        chartFeatures?.confirmScore ?? 15,
        chartFeatures ? !chartFeatures.chips.find((c) => c.key === 'confirm')?.aligned : false
      ),
    },
    {
      key: 'chartFvg',
      labelKo: 'FVG',
      score: Math.round(chartFeatures?.fvgScore ?? 12),
      detailKo: chartFeatures?.activeFvg?.labelKo ?? 'FVG —',
      tone: toneFromScore(chartFeatures?.fvgScore ?? 12),
    },
    {
      key: 'mtf',
      labelKo: 'MTF 합의',
      score: Math.round(mtfScore),
      detailKo: `${consensus.alignedTfCount}/${consensus.rows.length} TF · ${dirKo(consensus.finalDirection)}`,
      tone: toneFromScore(mtfScore, consensus.conflict || consensus.mtfBlocked),
    },
    {
      key: 'flow',
      labelKo: '수급·유동성',
      score: Math.round(flowScore),
      detailKo: `B${Math.round(buy)} S${Math.round(sell)}${analysis?.oiState ? ` · OI ${analysis.oiState}` : ''}`,
      tone: toneFromScore(flowScore, !flowAligned && master !== 'NEUTRAL'),
    },
    {
      key: 'gates',
      labelKo: '확정 게이트',
      score: Math.round(gatesScore),
      detailKo: `${consensus.gatesPassCount}/5 · ${s.gauges.gatesPct}%`,
      tone: toneFromScore(gatesScore, consensus.mtfBlocked),
    },
    {
      key: 'chartLine',
      labelKo: 'LINE E/SL/TP',
      score: Math.round(chartFeatures?.lineScore ?? 18),
      detailKo: s.unifiedTradePlan.sourceKo?.slice(0, 36) ?? 'line —',
      tone: toneFromScore(chartFeatures?.lineScore ?? 18),
    },
    {
      key: 'chartTrend',
      labelKo: '추세·구조선',
      score: Math.round(chartFeatures?.trendScore ?? 16),
      detailKo: chartFeatures?.trendKo?.slice(0, 32) ?? '추세 —',
      tone: toneFromScore(
        chartFeatures?.trendScore ?? 16,
        chartFeatures ? !chartFeatures.chips.find((c) => c.key === 'trend')?.aligned : false
      ),
    },
    {
      key: 'chartBand',
      labelKo: '밴드·VRVP',
      score: Math.round(chartFeatures?.bandScore ?? 14),
      detailKo: chartFeatures?.bandKo?.slice(0, 32) ?? chartFeatures?.chips.find((c) => c.key === 'band')?.detailKo ?? '밴드 —',
      tone: toneFromScore(chartFeatures?.bandScore ?? 14),
    },
    {
      key: 'trade',
      labelKo: '트레이드 정렬',
      score: Math.round(tradeScore),
      detailKo: trade ? `${dirKo(trade.primary)} E ${fmtPrice(trade.entry)}` : '시그널 대기',
      tone: toneFromScore(tradeScore, !tradeAligned),
    },
    {
      key: 'external',
      labelKo: '외부·매크로',
      score: Math.round(externalScore),
      detailKo: external?.news?.headlineKo?.slice(0, 36) ?? external?.whale?.headlineKo?.slice(0, 36) ?? '외부 데이터',
      tone: toneFromScore(externalScore, external?.news?.level === 'HIGH'),
    },
  ];

  const conflictCount = s.modules.filter((m) => m.live && !m.aligned).length;

  const depthScore = Math.round(
    dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length -
      conflictCount * 4 -
      (consensus.mtfBlocked ? 6 : 0)
  );
  const clampedDepth = clamp(depthScore, 0, 100);
  const depthGrade = gradeFromDepth(clampedDepth);
  const depthLabelKo =
    depthGrade === 'A'
      ? '다차원 정렬 양호 — 조건 검증 후 참고'
      : depthGrade === 'B'
        ? '부분 정렬 — HTF·무효 우선 확인'
        : depthGrade === 'C'
          ? '신호 분산 — 확정 게이트·상위 TF 대기'
          : '분석 깊이 부족 — 추가 동기화 필요';

  const confirmationPoints: UnifiedAnalysisConfirmationPoint[] = [
    {
      labelKo: 'MTF 상위 정렬',
      met: consensus.finalDirection === master && !consensus.conflict,
      detailKo: `${dirKo(consensus.finalDirection)} · ${consensus.alignedTfCount}TF`,
    },
    {
      labelKo: '확정 게이트 3+/5',
      met: consensus.gatesPassCount >= 3 && !consensus.mtfBlocked,
      detailKo: `${consensus.gatesPassCount}/5`,
    },
    {
      labelKo: '구조 경로 존재',
      met: !!(analysis?.structureBouncePath || analysis?.zoneBiasCard),
      detailKo: analysis?.structureBouncePath?.headline?.slice(0, 32),
    },
    {
      labelKo: '수급 방향 일치',
      met: flowAligned,
      detailKo: `B${Math.round(buy)} S${Math.round(sell)}`,
    },
    {
      labelKo: '트레이드·마스터 정렬',
      met: tradeAligned,
      detailKo: trade ? dirKo(trade.primary) : '—',
    },
    {
      labelKo: '차트 zone·FVG 정렬',
      met: !!(
        chartFeatures &&
        chartFeatures.chips.filter((c) => c.active && c.aligned).length >=
          Math.max(2, Math.ceil(chartFeatures.chips.filter((c) => c.active).length * 0.5))
      ),
      detailKo: chartFeatures?.summaryKo,
    },
    {
      labelKo: '확정 시그널(5게이트)',
      met: !!analysis?.confirmedSignal?.confirmed,
      detailKo: analysis?.confirmedSignal?.readinessTier ?? 'building',
    },
  ];

  const metCount = confirmationPoints.filter((p) => p.met).length;
  const rsiContextKo = buildRsiContextKo(analysis);
  const regimeContextKo = buildRegimeContextKo(analysis);
  const mtfAlignmentKo =
    consensus.summaryKo ??
    `${dirKo(consensus.finalDirection)} · ${consensus.alignedTfCount}/${consensus.rows.length} TF`;

  const enhancedScenarios = buildEnhancedScenarios({
    analysis,
    trade,
    masterDirection: master,
    consensus,
    mtfStatistics: mtfStatistics ?? null,
  });

  const keyLevels = buildKeyLevels({ analysis, trade, snapshot: s, chartFeatures });

  const headlineKo = `심층 ${depthGrade} · ${clampedDepth}pt · 확인 ${metCount}/${confirmationPoints.length}`;
  const summaryKo = [
    headlineKo,
    `${dirKo(master)} · 연동 ${s.gauges.syncPct}%`,
    rsiContextKo,
    regimeContextKo,
    mtfStatistics ? `통계 ${dirKo(mtfStatistics.statisticalVerdict)}` : null,
    metCount >= 4 ? '확인 포인트 다수 충족(조건부)' : '확인 포인트 부족 — 대기 권장(조건부)',
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    depthScore: clampedDepth,
    depthGrade,
    depthLabelKo,
    dimensions,
    keyLevels,
    confirmationPoints,
    rsiContextKo,
    regimeContextKo,
    mtfAlignmentKo,
    headlineKo,
    summaryKo,
    enhancedScenarios,
  };
}
