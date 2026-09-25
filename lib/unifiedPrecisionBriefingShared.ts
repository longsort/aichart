/**
 * 통합 AI 정밀 브리핑 — 마감·안착·통합분석 공용 보조 로직.
 * 조건부 참고 — 확정 수익·투자 권유 아님.
 */
import type { AnalyzeResponse } from '@/types';
import type { MonthDeskGatePartial } from '@/lib/monthDeskPrecisionAnalysis';
import type { MergedTradeSignal } from '@/lib/mergedAnalysisTradeLayer';

export type UnifiedPrecisionScenario = {
  key: 'bull' | 'bear' | 'invalid';
  labelKo: string;
  lineKo: string;
  level?: number;
  levelLabel?: string;
};

export type UnifiedMtfDirRow = {
  tf: string;
  direction: string;
};

const HTF_TFS = ['1M', '1w', '1d', '4h', '1h'] as const;
const LTF_TFS = ['15m', '5m', '3m', '1m'] as const;

function dirKo(d: string): string {
  if (d === 'LONG') return '롱';
  if (d === 'SHORT') return '숏';
  return '관망';
}

export function buildPrecisionScenarios(params: {
  analysis: AnalyzeResponse | null | undefined;
  trade: MergedTradeSignal | null | undefined;
  masterDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
}): UnifiedPrecisionScenario[] {
  const a = params.analysis;
  const t = params.trade;
  const invPrice = t?.stopLoss ?? a?.invalidationLevel?.price ?? null;
  const invLine =
    t?.invalidationKo ??
    a?.invalidationLevel?.reason ??
    a?.invalidation ??
    'SL·구조 무효 이탈 시 시나리오 재검토';

  const bullLine =
    a?.bullishScenario ??
    (params.masterDirection === 'LONG' && t?.tp1
      ? `TP1 ${t.tp1.toLocaleString(undefined, { maximumFractionDigits: 2 })} 돌파·확장`
      : a?.mustBreak
        ? String(a.mustBreak)
        : '상방 돌파·지지 유지 시 추세 연장');

  const bearLine =
    a?.bearishScenario ??
    (params.masterDirection === 'SHORT' && t?.tp1
      ? `TP1 ${t.tp1.toLocaleString(undefined, { maximumFractionDigits: 2 })} 하향·확장`
      : a?.mustHold
        ? String(a.mustHold)
        : '하방 이탈·저항 재테스트 실패 시 약세');

  return [
    {
      key: 'bull',
      labelKo: '상방',
      lineKo: bullLine,
      level: t?.tp1 ?? a?.breakoutLevel?.price ?? a?.resistanceLevel?.price ?? undefined,
      levelLabel: t?.tp1 ? 'TP1' : a?.breakoutLevel ? '돌파' : '저항',
    },
    {
      key: 'bear',
      labelKo: '하방',
      lineKo: bearLine,
      level: t?.tp2 ?? a?.supportLevel?.price ?? undefined,
      levelLabel: t?.tp2 ? 'TP2' : '지지',
    },
    {
      key: 'invalid',
      labelKo: '무효',
      lineKo: invLine,
      level: invPrice ?? undefined,
      levelLabel: 'SL/무효',
    },
  ];
}

export function buildHtfLtfContext(
  rows: UnifiedMtfDirRow[],
  masterDirection: 'LONG' | 'SHORT' | 'NEUTRAL'
): { htfContextKo: string | null; ltfContextKo: string | null } {
  const pick = (tfs: readonly string[]) =>
    tfs
      .map((tf) => rows.find((r) => r.tf === tf))
      .filter(Boolean) as UnifiedMtfDirRow[];

  const htf = pick(HTF_TFS);
  const ltf = pick(LTF_TFS);

  const summarize = (list: UnifiedMtfDirRow[], label: string) => {
    if (!list.length) return null;
    const aligned = list.filter((r) => r.direction === masterDirection).length;
    const parts = list.map((r) => `${r.tf} ${dirKo(r.direction)}`).join(' · ');
    return `${label} ${aligned}/${list.length} 정렬 — ${parts}`;
  };

  return {
    htfContextKo: summarize(htf, '상위 TF'),
    ltfContextKo: summarize(ltf, '하위 TF'),
  };
}

export function buildConflictModuleLabels(
  modules: Array<{ labelKo: string; live: boolean; aligned: boolean }>
): string[] {
  return modules.filter((m) => m.live && !m.aligned).map((m) => m.labelKo);
}

export function buildConfirmHeadline(gatesPassCount: number, gatesPct: number, mtfBlocked?: boolean): string {
  if (mtfBlocked) return `확정 ${gatesPassCount}/5 · MTF 반대로 억제`;
  if (gatesPassCount >= 5) return '확정 5/5 · MTF 검증 후 실행';
  if (gatesPassCount >= 3) return `확정 ${gatesPassCount}/5 · 추가 게이트 대기 (${gatesPct}%)`;
  return `확정 ${gatesPassCount}/5 · 신호 축적 (${gatesPct}%)`;
}

export function buildDeterministicBriefingNarrative(params: {
  symbol: string;
  chartTf: string;
  masterDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  masterGrade: string;
  syncPct: number;
  gatesPct: number;
  actionLine: string;
  htfContextKo: string | null;
  conflictModules: string[];
  precisionGrade?: string | null;
  flowKo?: string | null;
  structurePathKo?: string | null;
}): string {
  const dir = dirKo(params.masterDirection);
  const parts = [
    `${params.symbol} ${params.chartTf} 통합 ${dir} · 등급 ${params.masterGrade} · 모듈 연동 ${params.syncPct}%.`,
    `확정 게이트 ${params.gatesPct}%.`,
    params.precisionGrade ? `AI정밀 ${params.precisionGrade}.` : null,
    params.htfContextKo,
    params.flowKo,
    params.structurePathKo,
    params.conflictModules.length
      ? `엇갈림: ${params.conflictModules.join(', ')} — 상위 TF·무효 조건 우선 검증.`
      : '모듈 방향 대체로 일치.',
    params.actionLine,
    '조건부 참고, SL·무효 이탈 시 재판단.',
  ].filter(Boolean);

  return parts.join(' ').replace(/\s+/g, ' ').slice(0, 420);
}

export function buildFlowContextKo(analysis: AnalyzeResponse | null | undefined): string | null {
  if (!analysis) return null;
  const buy = analysis.buyPressure;
  const sell = analysis.sellPressure;
  const um = analysis.unifiedMarketMetrics;
  const cvd = um?.aggregatedCvdUsd;
  const parts: string[] = [];
  if (buy != null && sell != null) {
    parts.push(`수급 B${Math.round(buy)} S${Math.round(sell)}`);
  }
  if (analysis.oiState && analysis.oiState !== 'neutral') {
    parts.push(`OI ${analysis.oiState === 'increasing' ? '증가' : '감소'}`);
  }
  if (analysis.liquidityState && analysis.liquidityState !== 'neutral') {
    parts.push(`유동성 ${analysis.liquidityState === 'above' ? '상단' : '하단'}`);
  }
  if (cvd != null && Number.isFinite(cvd)) {
    parts.push(`CVD ${cvd >= 0 ? '+' : ''}${Math.round(cvd / 1e6)}M`);
  }
  if (um?.oiDeltaPct != null && Number.isFinite(um.oiDeltaPct)) {
    parts.push(`OIΔ ${um.oiDeltaPct >= 0 ? '+' : ''}${um.oiDeltaPct.toFixed(2)}%`);
  }
  return parts.length ? parts.join(' · ') : null;
}

export function buildStructurePathKo(analysis: AnalyzeResponse | null | undefined): string | null {
  const path = analysis?.structureBouncePath;
  if (path?.summaryLine) return path.summaryLine;
  if (path?.headline) return path.headline;
  const card = analysis?.zoneBiasCard;
  if (card?.summaryLines?.[0]) return card.summaryLines[0];
  return analysis?.patternVisionSummary?.slice(0, 120) ?? null;
}

export function gatePartialsFromPrecision(
  gatePartials: MonthDeskGatePartial[] | null | undefined
): MonthDeskGatePartial[] {
  return gatePartials?.length ? gatePartials : [];
}
