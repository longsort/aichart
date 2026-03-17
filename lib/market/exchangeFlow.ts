export type ExchangeFlow = {
  netflow: number;
  inExchange: number;
  outExchange: number;
  label: string;
};

export function calculateExchangeNetflow(_symbol: string): ExchangeFlow {
  return { netflow: 0, inExchange: 0, outExchange: 0, label: '데이터 없음 (연동 대기)' };
}
