/**
 * Eagle1 PHASE 1 — raw market row. Raw OHLC는 변경하지 않는다.
 * 서버 timestamp는 UTC ms. UI에서만 로컬 변환.
 */

export const EAGLE1_ENGINE_VERSION = 'eagle1-core-0.23.1';

export type Eagle1Timeframe =
  | '1m'
  | '5m'
  | '15m'
  | '1H'
  | '4H'
  | '12H'
  | '1D'
  | '1W'
  | '1M';

export type Eagle1RawCandle = {
  exchange: 'bitget' | 'binance' | 'forex';
  symbol: string;
  market_type: 'usdt-futures' | 'spot' | 'forex';
  timeframe: string;
  open_time: number;
  close_time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  base_volume: number;
  quote_volume: number | null;
  source: 'bitget-api' | 'bitget-csv' | 'bitget-merged' | 'binance-spot' | 'forex';
  downloaded_at: number;
};

export function eagle1RawMarketType(exchange: Eagle1RawCandle['exchange']): Eagle1RawCandle['market_type'] {
  if (exchange === 'forex') return 'forex';
  if (exchange === 'binance') return 'spot';
  return 'usdt-futures';
}

export type Eagle1AvailabilityFlags = {
  has_oi: boolean;
  has_cvd: boolean;
  has_funding: boolean;
  has_orderbook: boolean;
  has_liquidation: boolean;
  has_trades: boolean;
  has_mark: boolean;
  has_index: boolean;
};

export const EAGLE1_AVAILABILITY_NONE: Eagle1AvailabilityFlags = {
  has_oi: false,
  has_cvd: false,
  has_funding: false,
  has_orderbook: false,
  has_liquidation: false,
  has_trades: false,
  has_mark: false,
  has_index: false,
};

export type Eagle1QualitySeverity = 'ok' | 'warning' | 'fail';

export type Eagle1QualityIssue = {
  code: string;
  severity: Eagle1QualitySeverity;
  message: string;
  open_time?: number;
};

export type Eagle1QualityReport = {
  symbol: string;
  timeframe: string;
  sample_count: number;
  duplicate_count: number;
  gap_count: number;
  invalid_ohlc_count: number;
  negative_volume_count: number;
  zero_volume_count: number;
  severity: Eagle1QualitySeverity;
  /** 중대 이상이면 Confirmed Signal 금지 */
  confirmed_signal_blocked: boolean;
  issues: Eagle1QualityIssue[];
  calculated_at: number;
  engine_version: string;
};
