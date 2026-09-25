/**
 * 차트·분석 심볼 지원 — BTC뿐 아니라 ETH/알트(USDT) · USDKRW/CNYKRW.
 * 드롭다운(`SYMBOLS`)·검색 결과와 동일 계열을 분석 파이프에 통과시킨다.
 */
import { SYMBOLS } from '@/lib/constants';
import { isForexSymbol } from '@/lib/forexMarket';

export function normalizeAnalyzeSymbol(symbol: string): string {
  return String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function isUsdtMarketSymbol(symbol: string): boolean {
  const s = normalizeAnalyzeSymbol(symbol);
  return s.endsWith('USDT') && s.length >= 6;
}

/** 통합·분석 /api/analyze · 차트 로드 허용 */
export function isAnalyzableChartSymbol(symbol: string): boolean {
  const s = normalizeAnalyzeSymbol(symbol);
  if (!s) return false;
  if (isForexSymbol(s)) return true;
  if (isUsdtMarketSymbol(s)) return true;
  if ((SYMBOLS as readonly string[]).includes(s)) return true;
  return false;
}

/** 텔레그램 자동·멀티TF — 분석 가능 심볼이면 통과 (BTC/ETH만 한정하지 않음) */
export function isTelegramAnalyzableSymbol(symbol: string): boolean {
  return isAnalyzableChartSymbol(symbol);
}

export function telegramHashTagForSymbol(symbol: string): string {
  const s = normalizeAnalyzeSymbol(symbol);
  if (s.startsWith('BTC')) return '#BTC';
  if (s.startsWith('ETH')) return '#ETH';
  if (s === 'USDKRW') return '#USDKRW';
  if (s === 'CNYKRW') return '#CNYKRW';
  if (s.endsWith('USDT') && s.length > 4) return `#${s.slice(0, -4)}`;
  return s ? `#${s}` : '#MKT';
}

/** Bitget USDT-M 라벨 (심볼별) */
export function bitgetPerpLabel(symbol: string): string {
  const s = normalizeAnalyzeSymbol(symbol) || 'BTCUSDT';
  return `Bitget ${s}.P (USDT-M)`;
}
