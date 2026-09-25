/**
 * 구조 판독 → 지정가/시장가 실행 플랜 (앱 표시용).
 * 실주문은 별도 arm. 기본 페이퍼.
 */
export type BtcEdgeExecMode = 'WAIT' | 'LIMIT_MAKER' | 'LIMIT_JOIN' | 'MARKET_TAKER';

export type BtcEdgeExecutionPlan = {
  execMode?: BtcEdgeExecMode | string;
  entryType?: 'limit' | 'market' | null;
  limitPrice?: number | null;
  workPrice?: number | null;
  invalidate?: number | null;
  takeProfit1?: number | null;
  timeoutBars?: number;
  urgency?: number;
  feeBias?: 'maker' | 'taker' | string;
  reasonKo?: string;
  playbookKo?: string;
  structureTags?: string[];
  autoTrade?: boolean;
  side?: string;
  structure?: {
    sessionKo?: string | null;
    regimeKo?: string | null;
    tags?: string[];
    volume_z?: number;
    vwap_atr?: number;
  };
};

export function btcEdgeExecModeKo(mode?: string | null): string {
  switch (mode) {
    case 'LIMIT_MAKER':
      return '지정가(메이커) 대기';
    case 'LIMIT_JOIN':
      return '지정가(스프레드 참여)';
    case 'MARKET_TAKER':
      return '시장가/테이커(빠른대응)';
    case 'WAIT':
      return '대기';
    default:
      return mode || '대기';
  }
}
