/**
 * 직전 확정봉 기준 라칭 종가 상태 — /api/analyze 의 computeLatchedCloseStateFromClosedCandles 와 동일 문자열.
 * 차트 TF·일·주·월·분·시간 종가가 모두 같은 방향이면 확정/스윙 타점 등에서 종가 충족으로 인정.
 */

export type LatchedCloseState = 'accepted_above' | 'accepted_below' | 'reclaiming' | null | undefined;

export type LatchedCloseStatesBundle = {
  state1m?: LatchedCloseState;
  state5m?: LatchedCloseState;
  state15m?: LatchedCloseState;
  state1h?: LatchedCloseState;
  state4h?: LatchedCloseState;
  dailyState?: LatchedCloseState;
  weeklyState?: LatchedCloseState;
  monthlyState?: LatchedCloseState;
};

/** 현재 차트 TF에 해당하는 라칭 상태 (3m은 5m 데이터로 근사, 1Y는 월 상태 근사) */
export function latchedStateForChartTimeframe(tf: string, s: LatchedCloseStatesBundle): LatchedCloseState {
  switch (tf) {
    case '1m':
      return s.state1m ?? null;
    case '3m':
      return s.state5m ?? null;
    case '5m':
      return s.state5m ?? null;
    case '15m':
      return s.state15m ?? null;
    case '1h':
      return s.state1h ?? null;
    case '4h':
      return s.state4h ?? null;
    case '1d':
      return s.dailyState ?? null;
    case '1w':
      return s.weeklyState ?? null;
    case '1M':
      return s.monthlyState ?? null;
    case '1Y':
      return s.monthlyState ?? null;
    default:
      return null;
  }
}

/**
 * 롱: 차트 TF·일·주·월(및 해당 시 분·시간) 중 null 이 아닌 값이 전부 accepted_above 여야 함.
 * 숏: 전부 accepted_below. reclaiming 은 불일치로 처리.
 * 비교할 값이 하나도 없으면 false.
 */
export function latchedClosesAlignedWithVerdict(
  direction: 'LONG' | 'SHORT',
  chartTimeframe: string,
  s: LatchedCloseStatesBundle
): boolean {
  const want: 'accepted_above' | 'accepted_below' = direction === 'LONG' ? 'accepted_above' : 'accepted_below';
  const chartSt = latchedStateForChartTimeframe(chartTimeframe, s);
  const candidates: LatchedCloseState[] = [chartSt, s.dailyState, s.weeklyState, s.monthlyState];
  const relevant = candidates.filter((x): x is 'accepted_above' | 'accepted_below' | 'reclaiming' => x != null);
  if (relevant.length === 0) return false;
  return relevant.every((x) => x === want);
}
