/**
 * 타점엔진 코인별 실행 TF (사용자 세팅).
 * 전 코인 15m · 호칭 15분밴드자동(BAND15_AUTO)
 */
import type { AutoTradeSymbolId } from '@/lib/mergedDeskAutoTradeConfig';

export const TAPOINT_SYMBOL_ENTRY_TF: Record<AutoTradeSymbolId, string> = {
  BTCUSDT: '15m',
  ETHUSDT: '15m',
  SOLUSDT: '15m',
  XRPUSDT: '15m',
  BNBUSDT: '15m',
};

export function normalizeTapointTf(tf: string | null | undefined): string {
  const t = String(tf || '').trim();
  if (!t) return '';
  if (t === '1h' || t === '60m') return '1H';
  if (t === '4h') return '4H';
  if (t === '1d' || t === '1D') return '1D';
  if (t === '1w' || t === '1W') return '1W';
  if (t === '1M' || t === '1mo') return '1M';
  return t;
}

export function resolveTapointEntryTf(symbol: string): string {
  const u = String(symbol || '').toUpperCase();
  if (u.startsWith('BTC')) return TAPOINT_SYMBOL_ENTRY_TF.BTCUSDT;
  if (u.startsWith('ETH')) return TAPOINT_SYMBOL_ENTRY_TF.ETHUSDT;
  if (u.startsWith('SOL')) return TAPOINT_SYMBOL_ENTRY_TF.SOLUSDT;
  if (u.startsWith('XRP')) return TAPOINT_SYMBOL_ENTRY_TF.XRPUSDT;
  if (u.startsWith('BNB')) return TAPOINT_SYMBOL_ENTRY_TF.BNBUSDT;
  return '15m';
}

export function tapointEntryTfLabelKo(): string {
  return '전코인 15m';
}
