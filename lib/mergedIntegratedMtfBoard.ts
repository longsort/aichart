/**
 * 통합 허브 — 차트 TF 전환 없이 1m~1M 전 구간 카드용 요약.
 */
import type { AnalyzeResponse } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  MERGED_MTF_CONSENSUS_TFS,
  type MergedMtfConsensusResult,
} from '@/lib/mergedAnalysisMtfConsensus';

const TF_KO: Record<string, string> = {
  '1m': '1분',
  '3m': '3분',
  '5m': '5분',
  '15m': '15분',
  '1h': '1시간',
  '4h': '4시간',
  '1d': '일',
  '1w': '주',
  '1M': '월',
};

export type MergedIntegratedMtfTfRow = {
  tf: string;
  tfKo: string;
  isChartTf: boolean;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL' | 'WAIT';
  longScore: number;
  shortScore: number;
  confidence: number;
  price: number | null;
  verdictKo: string;
  summaryKo: string;
};

function verdictKo(v: string | undefined | null): string {
  const u = String(v ?? '').toUpperCase();
  if (u === 'LONG') return '롱';
  if (u === 'SHORT') return '숏';
  if (u === 'WATCH' || u === 'WAIT') return '관망';
  return u ? u : '—';
}

export function mergeMtfAnalyzesWithChart(
  chartTf: string,
  chartAnalysis: AnalyzeResponse | null | undefined,
  mtfAnalyzes: Array<{ tf: string; analyze: AnalyzeResponse | null }>
): Array<{ tf: string; analyze: AnalyzeResponse | null }> {
  const chart = normalizeChartTimeframe(chartTf);
  const map = new Map(mtfAnalyzes.map((r) => [normalizeChartTimeframe(r.tf), r.analyze]));
  if (chartAnalysis) map.set(chart, chartAnalysis);
  return MERGED_MTF_CONSENSUS_TFS.map((tf) => ({
    tf,
    analyze: map.get(tf) ?? null,
  }));
}

export function buildMergedIntegratedMtfBoard(params: {
  chartTf: string;
  chartAnalysis: AnalyzeResponse | null | undefined;
  consensus: MergedMtfConsensusResult | null | undefined;
  mtfAnalyzes: Array<{ tf: string; analyze: AnalyzeResponse | null }>;
}): MergedIntegratedMtfTfRow[] {
  const chart = normalizeChartTimeframe(params.chartTf);
  const merged = mergeMtfAnalyzesWithChart(params.chartTf, params.chartAnalysis, params.mtfAnalyzes);
  const consensusMap = new Map(
    (params.consensus?.rows ?? []).map((r) => [normalizeChartTimeframe(r.tf), r])
  );

  return MERGED_MTF_CONSENSUS_TFS.map((tf) => {
    const isChartTf = tf === chart;
    const analyze = merged.find((r) => normalizeChartTimeframe(r.tf) === tf)?.analyze ?? null;
    const crow = consensusMap.get(tf);
    const longScore = crow?.longScore ?? Math.round(Number(analyze?.longScore ?? 50));
    const shortScore = crow?.shortScore ?? Math.round(Number(analyze?.shortScore ?? 50));
    const direction = crow?.direction ?? (analyze ? 'NEUTRAL' : 'WAIT');
    const confidence = crow?.confidence ?? Math.round(Number(analyze?.confidence ?? 0));
    const price = analyze?.currentPrice ?? null;
    const verdict = verdictKo(analyze?.verdict);
    const summaryKo = analyze
      ? `${verdict} L${longScore} S${shortScore}${confidence ? ` · ${confidence}%` : ''}`
      : '데이터 로드…';

    return {
      tf,
      tfKo: TF_KO[tf] ?? tf,
      isChartTf,
      direction,
      longScore,
      shortScore,
      confidence,
      price,
      verdictKo: verdict,
      summaryKo,
    };
  });
}
