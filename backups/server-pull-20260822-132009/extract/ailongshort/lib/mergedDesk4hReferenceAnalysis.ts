/**
 * 통합·분석 — 차트 TF(분·시·일·주·월)와 무관하게 **15m 분석**을 공동 사용.
 * - `/api/analyze` · verdict · 스코어 · AI 지지/저항: 항상 15m
 * - 차트 setData · 존·핵심지지/저항 기하: **선택 TF 마켓 캔들** (15m 봉을 일·주봉에 얹지 않음)
 * (이전 4h → 1h → 15m 공동. 15m 기능 세트를 전 TF에 동일 경로로 적용.)
 */
import type { AnalyzeResponse } from '@/types';
import { analysisMatchesSymbolAndTf, normalizeChartTimeframe } from '@/lib/constants';
import { isMergedDeskChartTimeframe } from '@/lib/mergedDesk4hReference';

/** 통합·분석 공동 분석 TF — 15m */
export const MERGED_DESK_SHARED_ANALYZE_TF = '15m' as const;

/** @deprecated — MERGED_DESK_SHARED_ANALYZE_TF 사용 */
export const MERGED_DESK_4H_REFERENCE_TF = MERGED_DESK_SHARED_ANALYZE_TF;

/** 통합·분석 모드에서 15m 공동 분석 사용 */
export function isMergedDesk4hSharedAnalysisMode(uiMode: string | null | undefined): boolean {
  return String(uiMode || '') === 'MERGED_ANALYSIS_DESK';
}

/**
 * /api/analyze 에 넣을 timeframe.
 * 통합·분석이면 항상 15m — 분·시·일·주·월 차트에서도 동일 분석.
 */
export function mergedDeskAnalyzeTimeframe(
  chartTimeframe: string,
  uiMode: string | null | undefined
): string {
  if (isMergedDesk4hSharedAnalysisMode(uiMode)) {
    return MERGED_DESK_SHARED_ANALYZE_TF;
  }
  return normalizeChartTimeframe(chartTimeframe) || chartTimeframe;
}

/** 15m 분석이 현재 차트 TF에서 유효한가 (심볼 일치 + 차트는 데스크 TF) */
export function analysisMatchesMergedDesk4hShared(
  analysis: AnalyzeResponse | null | undefined,
  symbol: string,
  chartTimeframe: string
): boolean {
  if (!analysis) return false;
  if (String(analysis.symbol || '') !== String(symbol || '')) return false;
  const atf = normalizeChartTimeframe(String(analysis.timeframe || ''));
  if (atf !== MERGED_DESK_SHARED_ANALYZE_TF) return false;
  return isMergedDeskChartTimeframe(chartTimeframe);
}

/**
 * 차트에 분석을 붙여도 되는가.
 * - 일반: 심볼+TF 일치
 * - 통합·분석: 심볼 일치 + (차트TF 일치 | 15m 공동 분석)
 */
export function analysisUsableOnChart(
  analysis: AnalyzeResponse | null | undefined,
  symbol: string,
  chartTimeframe: string,
  uiMode?: string | null
): boolean {
  if (analysisMatchesSymbolAndTf(analysis, symbol, chartTimeframe)) return true;
  if (isMergedDesk4hSharedAnalysisMode(uiMode)) {
    return analysisMatchesMergedDesk4hShared(analysis, symbol, chartTimeframe);
  }
  return false;
}

/** TF 전환 중 in-flight 15m 분석 결과를 적용해도 되는지 */
export function mergedDeskMayApplySharedAnalyzeResult(
  uiMode: string | null | undefined,
  chartTimeframeNow: string
): boolean {
  if (!isMergedDesk4hSharedAnalysisMode(uiMode)) return false;
  return isMergedDeskChartTimeframe(chartTimeframeNow);
}
