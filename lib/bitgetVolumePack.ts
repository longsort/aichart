import type { UIMode, UserSettings } from '@/lib/settings';
import { isBitgetPerpChartSymbol } from '@/lib/bitgetFuturesSymbol';
import { isBitgetVolumeLinkedMode } from '@/lib/analysisModeLinkBus';

/**
 * TV USDT.P — Bitget 캔들·거래량·고래 빔 (BTC·ETH·알트).
 * AI 통계·세력 매수/매도를 **연동 모드 전역**에서 같은 차트 경로로 씀 (카드 아님).
 * USDKRW/CNYKRW 등 환율은 Bitget 경로 제외 → /api/market(Yahoo).
 */
export function isBitgetVolumePackActive(
  uiMode: UIMode,
  settings: Pick<UserSettings, 'chartMonthDeskBitgetCandles'>,
  symbol: string
): boolean {
  if (settings.chartMonthDeskBitgetCandles === false) return false;
  if (!isBitgetPerpChartSymbol(symbol)) return false;
  return isBitgetVolumeLinkedMode(uiMode);
}
