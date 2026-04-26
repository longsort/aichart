import type { AnalyzeResponse, Candle } from '@/types';
import {
  getLastInstitutionalBandEdges,
  INSTITUTIONAL_BAND_DEFAULT_MULT,
  INSTITUTIONAL_BAND_DEFAULT_PERIOD,
} from '@/lib/institutionalSuperBand';

/** 차트 좌측 스트립용 — 투자 권유·확정 신호 아님, 참고용 */
export type ChartHtfBandFusionHint = {
  htfLine: string;
  ltfStructureLine: string;
  bandLine: string;
  /** 짧은 한 줄 */
  compactLine: string;
};

function htfLineFromMtf(mtf: NonNullable<AnalyzeResponse['mtf']>): string {
  const b = String(mtf.htfBias || '').toLowerCase();
  if (b === 'bullish') return 'HTF: 상승 맥락';
  if (b === 'bearish') return 'HTF: 하락 맥락';
  if (b === 'range') return 'HTF: 횡보';
  return 'HTF: —';
}

function trendFromEngine(engine: Record<string, unknown> | undefined): string {
  const t = engine?.trend;
  if (t === 'bullish') return '차트 TF 구조: 상승';
  if (t === 'bearish') return '차트 TF 구조: 하락';
  return '차트 TF 구조: 횡보';
}

/**
 * `analysis.mtf` + `engine.trend` + 기관 밴드 대비 종가.
 * `mtf`가 없으면 API `multiTF.htf` 문자열만 보조 표시.
 */
export function buildChartHtfBandFusionHint(
  analysis: AnalyzeResponse | null,
  candles: Candle[]
): ChartHtfBandFusionHint | null {
  if (!analysis || candles.length < 3) return null;

  let htfLine: string;
  if (analysis.mtf?.htfBias) {
    htfLine = htfLineFromMtf(analysis.mtf);
  } else {
    const multi = (analysis as { multiTF?: { htf?: string | null; htfLabel?: string } }).multiTF;
    if (multi?.htf) {
      const label = multi.htfLabel ? `${multi.htfLabel} ` : '';
      htfLine = `HTF: ${label}${multi.htf}`;
    } else {
      htfLine = 'HTF: —';
    }
  }

  const ltfStructureLine = trendFromEngine(analysis.engine as Record<string, unknown> | undefined);

  const edges = getLastInstitutionalBandEdges(candles, INSTITUTIONAL_BAND_DEFAULT_PERIOD, INSTITUTIONAL_BAND_DEFAULT_MULT);
  let bandLine = '가격·밴드: —';
  if (edges) {
    const last = candles[candles.length - 1];
    const close = last.close;
    const span = Math.max(1e-9, edges.upper - edges.lower);
    const frac = 0.22;
    const nearLower = close <= edges.lower + span * frac;
    const nearUpper = close >= edges.upper - span * frac;
    if (nearLower && nearUpper) bandLine = '가격·밴드: 수렴 구간';
    else if (nearLower) bandLine = '가격·밴드: 지지부 근접(롱 관심)';
    else if (nearUpper) bandLine = '가격·밴드: 저항부 근접(숏 관심)';
    else bandLine = '가격·밴드: 밴드 중간';
  }

  const shortHtf = htfLine.replace(/^HTF:\s*/, '').trim();
  const shortBand = bandLine.replace(/^가격·밴드:\s*/, '').trim();
  const compactLine = `${shortHtf} · ${ltfStructureLine.replace(/^차트 TF 구조:\s*/, '')} · ${shortBand}`;

  return { htfLine, ltfStructureLine, bandLine, compactLine };
}
