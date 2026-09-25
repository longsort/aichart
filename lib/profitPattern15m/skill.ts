/**
 * 호칭: 수익패턴엔진 (PROFIT_PATTERN_15M)
 * 전 코인 15m · 50x · 비용후 NET+5% · 롱만 · H1 · 확정 수익 아님.
 */
export const PROFIT_PATTERN_HOCHUNG = '수익패턴엔진' as const;
export const PROFIT_PATTERN_CALLSIGN = 'PROFIT_PATTERN_15M' as const;
export const PROFIT_PATTERN_SKILL_ID = 'profitPattern15m' as const;
export const PROFIT_PATTERN_ENGINE_ID = 'COIN_15M_PROFIT_PATTERN' as const;
export const PROFIT_PATTERN_TF = '15m' as const;

/** 1차 대상 — 타점 심볼 전부. 그 외 *USDT 선물도 허용 */
export const PROFIT_PATTERN_CORE_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'SOLUSDT',
] as const;

export function profitPatternWhyKo(ready: boolean): string {
  return ready
    ? `${PROFIT_PATTERN_HOCHUNG} · 50x NET+5% 후보 · 확정아님`
    : `${PROFIT_PATTERN_HOCHUNG} · WAIT`;
}

export function ppNormalizeSymbol(symbol: string | null | undefined): string {
  return String(symbol || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** BTCUSDT·ETHUSDT 등 선물 USDT 심볼 */
export function ppSymbolAllowed(symbol: string | null | undefined): boolean {
  const s = ppNormalizeSymbol(symbol);
  if (!s) return false;
  if ((PROFIT_PATTERN_CORE_SYMBOLS as readonly string[]).includes(s)) return true;
  return s.endsWith('USDT') && s.length >= 6 && s.length <= 20;
}
