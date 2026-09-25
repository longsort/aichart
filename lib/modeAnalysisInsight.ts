import type { AnalyzeResponse } from '@/types';
import type { UIMode } from '@/lib/settings';
import type { MonthDeskBoardMetrics } from '@/lib/monthDeskBoardMetrics';
import type { MonthDeskWhaleSnapshot } from '@/lib/monthDeskWhaleDesk';

export type ModeInsight = {
  accent: string;
  title: string;
  bullets: string[];
};

const MODE_ACCENT: Partial<Record<UIMode, string>> = {
  AI_ZONE: '#38bdf8',
  WHALE: '#22d3ee',
  UNIFIED_DESK: '#a78bfa',
  MONTH_START_DESK: '#c4b5fd',
  ZONE_LINE_PRO: '#5eead4',
  REFERENCE_DESK: '#38bdf8',
  FUSION_MODE: '#f472b6',
  MAX_ANALYSIS: '#fbbf24',
  EXECUTION: '#4ade80',
  SMART: '#2dd4bf',
  HOT_ZONE: '#fb923c',
  TAPPOINT: '#fcd34d',
};

export function buildModeAnalysisInsight(
  uiMode: UIMode | undefined,
  analysis: AnalyzeResponse | null,
  metrics: MonthDeskBoardMetrics,
  whale: MonthDeskWhaleSnapshot | null
): ModeInsight | null {
  if (!analysis) return null;
  const accent = (uiMode && MODE_ACCENT[uiMode]) || '#67e8f9';
  const bullets: string[] = [];

  if (metrics.mtfHtf || metrics.mtfLtf) {
    bullets.push(`MTF 상위 ${metrics.mtfHtf ?? '–'} · 하위 ${metrics.mtfLtf ?? '–'}${metrics.mtfAlignment != null ? ` · 정합 ${metrics.mtfAlignment}` : ''}`);
  }
  if (metrics.probLong != null || metrics.probShort != null) {
    bullets.push(`확률 L ${metrics.probLong ?? '–'}% / S ${metrics.probShort ?? '–'}%`);
  }

  switch (uiMode) {
    case 'AI_ZONE': {
      const ai = analysis.aiUnifiedLongShort;
      const az = analysis.aiZoneSignal;
      if (ai?.headline) bullets.unshift(ai.headline.slice(0, 100));
      if (ai?.watch) bullets.unshift(`감시존 ${ai.watch.low}~${ai.watch.high} · ${ai.watch.side}`);
      else if (az?.zone?.low != null) {
        bullets.unshift(`AI 존 ${az.zone.low}~${az.zone.high} · ${az.zone.side ?? '–'}`);
      }
      if (ai?.invalidation) bullets.push(`무효 ${ai.invalidation.price} · ${ai.invalidation.context}`);
      if (metrics.gatesPassCount >= 4) bullets.push(`확정 ${metrics.gatesPassCount}/5`);
      if (ai?.integrationStrength != null) bullets.push(`정합 ${ai.integrationStrength}/100 (참고)`);
      if (ai?.scenarioA) bullets.push(`A) ${ai.scenarioA.slice(0, 80)}`);
      const flow = (analysis as { aiZoneFlowSummary?: string }).aiZoneFlowSummary;
      if (flow) bullets.push(String(flow).slice(0, 100));
      return { accent, title: 'AI 통합 분석', bullets: bullets.slice(0, 5) };
    }
    case 'WHALE': {
      if (analysis.volumeFlowSummary?.label) bullets.unshift(analysis.volumeFlowSummary.label);
      if (whale?.headlineKo) bullets.unshift(whale.headlineKo);
      if (analysis.structureBouncePath?.headline) bullets.push(analysis.structureBouncePath.headline);
      return { accent, title: '고래 · 체결·존', bullets: bullets.slice(0, 4) };
    }
    case 'MONTH_START_DESK': {
      const sz = analysis.settlementZone;
      const ai = analysis.aiUnifiedLongShort;
      if (sz?.state && sz.state !== 'none') {
        bullets.unshift(
          `안착 ${sz.state} ${sz.grade} · ${sz.direction} · ${sz.level != null ? sz.level : '–'} · ${Math.round(sz.score)}`
        );
      }
      if (ai?.headline) bullets.push(ai.headline.slice(0, 90));
      if (ai?.invalidation) bullets.push(`무효 ${ai.invalidation.price}`);
      if (metrics.gatesPassCount >= 4) bullets.push(`구조 확정 ${metrics.gatesPassCount}/5`);
      if (metrics.readinessText) bullets.unshift(metrics.readinessText);
      return { accent, title: '마감·안착 · AI 통합', bullets: bullets.slice(0, 5) };
    }
    case 'ZONE_LINE_PRO': {
      const ai = analysis.aiUnifiedLongShort;
      if (ai?.headline) bullets.unshift(ai.headline.slice(0, 90));
      bullets.push('LinReg + CP 채널 + HotZone + Strike E/SL/TP — 차트 zone·line 참고');
      if (ai?.invalidation) bullets.push(`무효 ${ai.invalidation.price}`);
      return { accent, title: '존·라인 · 개선', bullets: bullets.slice(0, 4) };
    }
    case 'REFERENCE_DESK':
      return {
        accent,
        title: '벤치마크 · 레퍼런스',
        bullets: ['GitHub OSS·LWC·ailongshort 대조는 벤치마크 모드 보드에서 확인'],
      };
    case 'UNIFIED_DESK':
    case 'FUSION_MODE': {
      const sum = (analysis.summary || metrics.fusionLine || '').trim();
      if (sum) bullets.unshift(sum.slice(0, 140));
      return { accent, title: uiMode === 'FUSION_MODE' ? '융합 브리핑' : '합성 신호', bullets: bullets.slice(0, 3) };
    }
    case 'MAX_ANALYSIS': {
      if (analysis.dominantPattern?.label) bullets.unshift(`패턴 ${analysis.dominantPattern.label}`);
      if (analysis.patternVisionSummary) bullets.push(analysis.patternVisionSummary.slice(0, 100));
      return { accent, title: '최강 분석', bullets: bullets.slice(0, 3) };
    }
    case 'SMART_MONEY_MVP': {
      const sm = analysis.smartMoneyMvpSignal;
      if (sm?.alertText) bullets.unshift(sm.alertText);
      if (sm?.workflowState) bullets.push(`워크플로 ${sm.workflowState}`);
      return { accent, title: '스마트머니', bullets: bullets.slice(0, 3) };
    }
    default:
      if ((analysis.summary || '').trim()) bullets.unshift((analysis.summary || '').trim().slice(0, 120));
      return bullets.length ? { accent, title: '분석 요약', bullets: bullets.slice(0, 3) } : null;
  }
}
