/**
 * AMZ Outcome thresholds — Config 분리 (하드코딩 분석값 금지 원칙).
 * 확정 승률 UI용 아님.
 */
export type AmzOutcomeConfig = {
  /** 유의미 반응 최소 % */
  holdMinReactionPct: number;
  /** 유의미 반응 최소 ATR 배수 */
  holdMinReactionAtr: number;
  /** Break 종가 확인: ATR 버퍼 */
  breakCloseAtrBuffer: number;
  /** Break 후 지속 확인 봉 수 */
  breakConfirmBars: number;
  /** Fake: 돌파 후 Zone 복귀 허용 봉 수 */
  fakeReclaimBars: number;
  /** Sweep: 꼬리 penetration 최소 (0~1) */
  sweepMinWickPenetration: number;
  /** Sweep: 복귀 후 반대방향 최소 % */
  sweepMinReversalPct: number;
  /** Flip: Break 확정 후 retest hold 최소 봉 */
  flipRetestHoldBars: number;
  /** Outcome 측정 horizon 봉 수 */
  outcomeHorizons: number[];
  /** 통계 신뢰 최소 표본 */
  sampleTrustMin: number;
};

export const DEFAULT_AMZ_OUTCOME_CONFIG: AmzOutcomeConfig = {
  holdMinReactionPct: 0.12,
  holdMinReactionAtr: 0.18,
  breakCloseAtrBuffer: 0.05,
  breakConfirmBars: 1,
  fakeReclaimBars: 5,
  sweepMinWickPenetration: 0.15,
  sweepMinReversalPct: 0.1,
  flipRetestHoldBars: 2,
  outcomeHorizons: [5, 8, 13],
  sampleTrustMin: 30,
};

export function mergeAmzOutcomeConfig(
  partial?: Partial<AmzOutcomeConfig> | null
): AmzOutcomeConfig {
  return { ...DEFAULT_AMZ_OUTCOME_CONFIG, ...(partial ?? {}) };
}
