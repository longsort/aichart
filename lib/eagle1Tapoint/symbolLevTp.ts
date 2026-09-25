/**
 * 타점엔진 코인별 레버·익절 ROE (사용자 지정).
 * BTC·ETH 20x · 목표 7% ROE / 알트 10x · 목표 6% ROE.
 * 손절·비중은 기존 로직 유지. 확정 수익 아님.
 */

export type TapointLevTp = {
  leverage: number;
  tp1RoePct: number;
  labelKo: string;
};

function baseOf(symbol: string): string {
  return String(symbol || '')
    .toUpperCase()
    .replace(/USDT$/i, '')
    .replace(/PERP$/i, '')
    .trim();
}

/** BTC·ETH → 20x·7% · 그 외 알트 → 10x·6% */
export function resolveTapointSymbolLevTp(symbol: string): TapointLevTp {
  const b = baseOf(symbol);
  if (b === 'BTC' || b === 'ETH') {
    return { leverage: 20, tp1RoePct: 7, labelKo: 'BTC·ETH 20x·TP7%' };
  }
  return { leverage: 10, tp1RoePct: 6, labelKo: '알트 10x·TP6%' };
}
