/**
 * 초단타 목표 ROE → 거래소 수수료·펀딩 반영 순수익(증거금 대비 %).
 * Bitget USDT-M 공개 요율 근사. 확정 수익 아님 · 교육/게이트용.
 */

/** Bitget USDT-M 테이커 기본(대략) */
export const BITGET_TAKER_FEE_RATE = 0.0006;
/** 8시간 펀딩 1회 가정 기본(중립·변동) */
export const DEFAULT_FUNDING_RATE_8H = 0.0001;

export type ScalpNetRoeInput = {
  /** 목표 총 ROE % (예: 7) */
  grossRoePct: number;
  leverage: number;
  /** 편도 수수료율 (notional) · 기본 테이커 */
  takerFeeRate?: number;
  /** 8h 펀딩율 (부호 무시·절대비용) */
  fundingRate8h?: number;
  /** 보유 시간(시간) · 펀딩 차감용. 초단 기본 0.5h */
  holdHours?: number;
};

export type ScalpNetRoeResult = {
  grossRoePct: number;
  /** 목표 ROE에 필요한 대략 가격 변동 % */
  priceMovePct: number;
  roundTripFeeOnMarginPct: number;
  fundingOnMarginPct: number;
  netRoePct: number;
  leverage: number;
  detailKo: string[];
};

/**
 * 증거금 대비: 총 ROE − (왕복 수수료×레버) − (펀딩×레버).
 * 예) 7% · 30x · 테이커 0.06%×2 → 수수료만 ~3.6%p → 순 ~3.4%p (펀딩 무시 시).
 */
export function estimateScalpNetRoe(input: ScalpNetRoeInput): ScalpNetRoeResult {
  const lev = Math.max(1, Math.min(125, Number(input.leverage) || 10));
  const gross = Math.max(0, Number(input.grossRoePct) || 0);
  const fee = Math.max(0, input.takerFeeRate ?? BITGET_TAKER_FEE_RATE);
  const fund = Math.max(0, input.fundingRate8h ?? DEFAULT_FUNDING_RATE_8H);
  const hold = Math.max(0, input.holdHours ?? 0.5);

  const priceMovePct = gross / lev;
  /** 왕복 수수료가 증거금에서 차지하는 %p */
  const roundTripFeeOnMarginPct = fee * 2 * lev * 100;
  const periods = hold / 8;
  const fundingOnMarginPct = fund * periods * lev * 100;
  const netRoePct = gross - roundTripFeeOnMarginPct - fundingOnMarginPct;

  const detailKo = [
    `목표 ROE ${gross.toFixed(1)}% · ${lev}x → 가격약 ${priceMovePct.toFixed(3)}% 움직임`,
    `왕복 수수료(테이커 ${(fee * 100).toFixed(3)}%×2) → 증거금 −${roundTripFeeOnMarginPct.toFixed(2)}%p`,
    hold > 0
      ? `펀딩 가정(${(fund * 100).toFixed(3)}%/8h · ${hold}h) → −${fundingOnMarginPct.toFixed(2)}%p`
      : '펀딩 0 (초단·미보유 가정)',
    `나에게 남는 대략 순ROE ≈ ${netRoePct.toFixed(2)}% (확정 아님)`,
  ];

  return {
    grossRoePct: gross,
    priceMovePct,
    roundTripFeeOnMarginPct,
    fundingOnMarginPct,
    netRoePct,
    leverage: lev,
    detailKo,
  };
}
