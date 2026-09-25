/** TV BTCUSDT.P — Bitget USDT-M 무기한 (클라이언트·서버 공용, fs 없음) */
export function isBitgetPerpChartSymbol(symbol: string): boolean {
  return String(symbol || '').toUpperCase().endsWith('USDT');
}
