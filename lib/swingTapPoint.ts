/**
 * 스윙 매매용 90% 신뢰도 타점 판정.
 * 브리핑·차트 분석·종가 마감을 종합해 LONG/SHORT 타점만 필터.
 */

export type SwingTapPointResult = {
  active: boolean;
  direction: 'LONG' | 'SHORT' | null;
  confidence: number;
  reasons: string[];
  missing: string[];
  /** 현재 타임프레임에서 스윙 타점 표시 가능 여부 (모든 TF 지원) */
  swingTimeframe: boolean;
};

type AnalysisLike = {
  verdict: string;
  confidence: number;
  longScore?: number;
  shortScore?: number;
  riskFlags?: string[];
  mtf?: { alignmentScore?: number; htfBias?: string; ltfBias?: string };
  closeBias?: 'bullish' | 'bearish' | 'neutral';
  dailyState?: string | null;
  weeklyState?: string | null;
  timeframe: string;
  confidenceGrade?: string;
};

const MIN_CONFIDENCE = 90;
/** 실행 모드: 분·시·일·주·달·년 모든 타임프레임에서 스윙 타점 표시 */
const SWING_TFS = ['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1M', '1Y'];

/**
 * 현재 분석이 스윙용 90% 타점인지 판정.
 * - 신뢰도 90% 이상
 * - LONG 또는 SHORT 확정
 * - MTF 정렬 (상위/하위 타임프레임 방향 일치)
 * - 종가선 방향 일치 (롱이면 위 안착 쪽, 숏이면 아래 쪽)
 * - 리스크 플래그 없거나 경미
 * - 모든 타임프레임(1m~1Y) 지원
 */
export function computeSwingTapPoint(analysis: AnalysisLike): SwingTapPointResult {
  const reasons: string[] = [];
  const missing: string[] = [];
  const verdict = analysis.verdict as string;
  const confidence = analysis.confidence ?? 0;
  const swingTimeframe = SWING_TFS.includes(analysis.timeframe);

  if (verdict !== 'LONG' && verdict !== 'SHORT') {
    return {
      active: false,
      direction: null,
      confidence,
      reasons: [],
      missing: ['LONG 또는 SHORT 신호가 아님'],
      swingTimeframe,
    };
  }

  const direction = verdict as 'LONG' | 'SHORT';

  if (confidence >= MIN_CONFIDENCE) {
    reasons.push(`신뢰도 ${confidence}% (≥${MIN_CONFIDENCE}%)`);
  } else {
    missing.push(`신뢰도 ${confidence}% (목표 ${MIN_CONFIDENCE}%)`);
  }

  const alignmentScore = analysis.mtf?.alignmentScore ?? 0;
  if (alignmentScore >= 70) {
    reasons.push(`MTF 정렬 ${alignmentScore}%`);
  } else {
    missing.push(`MTF 정렬 부족 (${alignmentScore}%)`);
  }

  const closeBias = analysis.closeBias;
  const dailyState = analysis.dailyState;
  const weeklyState = analysis.weeklyState;
  const closeOkLong =
    closeBias === 'bullish' ||
    dailyState === 'accepted_above' ||
    weeklyState === 'accepted_above';
  const closeOkShort =
    closeBias === 'bearish' ||
    dailyState === 'accepted_below' ||
    weeklyState === 'accepted_below';
  if (direction === 'LONG' && closeOkLong) {
    reasons.push('종가선 위 안착·상승 정배열');
  } else if (direction === 'SHORT' && closeOkShort) {
    reasons.push('종가선 아래·하락 정배열');
  } else if (closeBias != null && closeBias !== 'neutral') {
    if (direction === 'LONG') missing.push('종가선 상승 정배열 미충족');
    else missing.push('종가선 하락 정배열 미충족');
  }

  const riskFlags = analysis.riskFlags ?? [];
  if (riskFlags.length === 0) {
    reasons.push('리스크 플래그 없음');
  } else if (riskFlags.some((f: string) => f.includes('충돌') || f.includes('불일치'))) {
    missing.push('신호 충돌/불일치');
  }

  const longScore = analysis.longScore ?? 50;
  const shortScore = analysis.shortScore ?? 50;
  const spread = direction === 'LONG' ? longScore - shortScore : shortScore - longScore;
  if (spread >= 20) {
    reasons.push(`방향 점수 차이 ${Math.round(spread)}`);
  } else if (spread < 12) {
    missing.push('롱/숏 점수 차이 부족');
  }

  if (swingTimeframe) {
    reasons.push(`TF ${analysis.timeframe}`);
  }

  const active =
    confidence >= MIN_CONFIDENCE &&
    alignmentScore >= 70 &&
    (direction === 'LONG' ? closeOkLong : closeOkShort) &&
    !riskFlags.some((f: string) => f.includes('충돌') || f.includes('불일치')) &&
    spread >= 12;

  return {
    active,
    direction: active ? direction : null,
    confidence,
    reasons,
    missing,
    swingTimeframe,
  };
}
