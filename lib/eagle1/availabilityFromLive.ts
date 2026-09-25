/**
 * Live Eagle1 availability — only flags that exist this fetch.
 * Liquidation series comes from Bitget public history, not a Binance snapshot count.
 */
import type { Eagle1AvailabilityFlags } from './rawTypes';
import { EAGLE1_AVAILABILITY_NONE } from './rawTypes';

export function resolveEagle1LiveAvailability(input: {
  hasBitgetOrderbook?: boolean;
  tradeCount?: number;
  oiPoints?: number;
  fundingPoints?: number;
  /** Time-ordered liquidation points. Snapshot count is not a series. */
  liquidationSeriesPoints?: number;
  hasMark?: boolean;
  hasIndex?: boolean;
}): Eagle1AvailabilityFlags {
  const trades = Math.max(0, Math.floor(input.tradeCount ?? 0));
  const oi = Math.max(0, Math.floor(input.oiPoints ?? 0));
  const funding = Math.max(0, Math.floor(input.fundingPoints ?? 0));
  const liqSeries = Math.max(0, Math.floor(input.liquidationSeriesPoints ?? 0));
  return {
    has_oi: oi >= 2,
    has_cvd: trades > 0,
    has_funding: funding > 0,
    has_orderbook: Boolean(input.hasBitgetOrderbook),
    has_liquidation: liqSeries >= 2,
    has_trades: trades > 0,
    has_mark: Boolean(input.hasMark),
    has_index: Boolean(input.hasIndex),
  };
}

export function eagle1AvailabilityOrNone(
  flags: Eagle1AvailabilityFlags | null | undefined
): Eagle1AvailabilityFlags {
  return flags ? { ...flags } : { ...EAGLE1_AVAILABILITY_NONE };
}
