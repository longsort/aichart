/**
 * §19 ORDER FLOW — pipe.flowConfirmation / moneyFlow 래핑.
 * 데이터 없으면 UNAVAILABLE · 가짜 점수 금지.
 */
import type { FlowConfirmationReport } from '@/lib/eagle1/flowConfirmationEngine';

export type TapFlowSnap = {
  bias: string;
  score: number | null;
  usableForConfirm: boolean;
  alignsWithDir: boolean | null;
  summaryKo: string;
  flowScore: number;
};

export function buildTapFlowSnap(params: {
  flowConfirmation?: FlowConfirmationReport | null;
  moneyFlowStateKo?: string | null;
  direction: 'LONG' | 'SHORT' | null;
}): TapFlowSnap {
  const fc = params.flowConfirmation;
  if (fc && fc.bias !== 'UNAVAILABLE' && fc.availableCount > 0) {
    const score = fc.score;
    let aligns: boolean | null = null;
    if (params.direction === 'LONG') {
      aligns =
        fc.bias === 'STRONG_BUY' ||
        fc.bias === 'BUY' ||
        (score != null && score >= 15);
    } else if (params.direction === 'SHORT') {
      aligns =
        fc.bias === 'STRONG_SELL' ||
        fc.bias === 'SELL' ||
        (score != null && score <= -15);
    }
    const flowScore =
      score == null
        ? 48
        : Math.max(0, Math.min(100, Math.round(50 + score * 0.45)));
    return {
      bias: fc.bias,
      score,
      usableForConfirm: fc.usableForConfirm,
      alignsWithDir: aligns,
      summaryKo: fc.summaryKo || fc.bias,
      flowScore,
    };
  }

  const ko = String(params.moneyFlowStateKo || '');
  if (ko) {
    const buy = ko.includes('매수') || ko.includes('롱') || ko.includes('흡수');
    const sell = ko.includes('매도') || ko.includes('숏');
    let aligns: boolean | null = null;
    if (params.direction === 'LONG') aligns = buy && !sell ? true : sell ? false : null;
    if (params.direction === 'SHORT') aligns = sell && !buy ? true : buy ? false : null;
    return {
      bias: buy ? 'BUY' : sell ? 'SELL' : 'NEUTRAL',
      score: null,
      usableForConfirm: false,
      alignsWithDir: aligns,
      summaryKo: `머니흐름 ${ko} · 풀오더플로 없음`,
      flowScore: buy || sell ? 58 : 45,
    };
  }

  return {
    bias: 'UNAVAILABLE',
    score: null,
    usableForConfirm: false,
    alignsWithDir: null,
    summaryKo: '오더플로 UNAVAILABLE',
    flowScore: 45,
  };
}
