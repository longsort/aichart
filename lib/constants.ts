export const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'FETUSDT'];
export const TIMEFRAMES = ['1m', '3m', '5m', '15m', '1h', '4h', '1d', '1w', '1M', '1Y'];

/** 고래·기관 zone 표시 가격 구간 (캔들 구간 무관, 120k ~ 8k 고정) */
export const ZONE_PRICE_CEIL = 120_000;
export const ZONE_PRICE_FLOOR = 8_000;

/** RSI 다이버전스 스윙 신호: L/S 시그널 기준 점수 (분·시·일·주·달 동일 80점) */
export const RSI_SWING_LS_THRESHOLD = 80;
/** RSI 다이버전스 스윙: WATCH 최소 점수 */
export const RSI_SWING_WATCH_THRESHOLD = 60;

/** 각 TF별 분석용 캔들 개수 (분·시간·일·주·달 동일 기준, 2017~현재) */
export function visibleLimit(timeframe: string): number {
  const map: Record<string, number> = {
    '1m': 1000, '3m': 1000, '5m': 1000, '15m': 900,  // 분봉
    '1h': 800, '4h': 700,                             // 시간봉
    '1d': 600, '1w': 400,                             // 일봉·주봉
    '1M': 240,                                       // 달봉 (2017~현재 ~96개, 240 여유)
    '1Y': 120,                                       // 연봉
  };
  return map[timeframe] ?? 700;
}
