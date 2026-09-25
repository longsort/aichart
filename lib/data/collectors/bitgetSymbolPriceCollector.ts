/**
 * Bitget mark / index / last price — MarketDataBus mark|index lane.
 * 없으면 null · 날조 금지.
 */
import { BITGET_BASE } from '@/lib/exchangeConfig';
import { marketBusKey, subscribeMarketBus } from '@/lib/eagle1/marketDataBus';

export type BitgetSymbolPrice = {
  symbol: string;
  last: number | null;
  markPrice: number | null;
  indexPrice: number | null;
  ts: number | null;
  source: 'bitget-symbol-price';
};

const PRODUCT = 'USDT-FUTURES';

export async function collectBitgetSymbolPriceFresh(symbol: string): Promise<BitgetSymbolPrice> {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const empty: BitgetSymbolPrice = {
    symbol: sym,
    last: null,
    markPrice: null,
    indexPrice: null,
    ts: null,
    source: 'bitget-symbol-price',
  };
  try {
    const u = new URL(`${BITGET_BASE}/api/v2/mix/market/symbol-price`);
    u.searchParams.set('symbol', sym);
    u.searchParams.set('productType', PRODUCT);
    const res = await fetch(u.toString(), { cache: 'no-store' });
    if (!res.ok) return empty;
    const j = (await res.json()) as {
      code?: string;
      data?: Array<{
        symbol?: string;
        price?: string;
        markPrice?: string;
        indexPrice?: string;
        ts?: string;
      }>;
    };
    if (j.code !== '00000' || !Array.isArray(j.data) || !j.data[0]) return empty;
    const row = j.data[0]!;
    const last = Number(row.price);
    const mark = Number(row.markPrice);
    const index = Number(row.indexPrice);
    const ts = Number(row.ts);
    return {
      symbol: String(row.symbol || sym).toUpperCase(),
      last: Number.isFinite(last) && last > 0 ? last : null,
      markPrice: Number.isFinite(mark) && mark > 0 ? mark : null,
      indexPrice: Number.isFinite(index) && index > 0 ? index : null,
      ts: Number.isFinite(ts) ? ts : null,
      source: 'bitget-symbol-price',
    };
  } catch {
    return empty;
  }
}

/** Bus: mark + index 한 번에 (동일 REST) */
export async function collectBitgetSymbolPrice(symbol: string): Promise<BitgetSymbolPrice> {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  return subscribeMarketBus(
    marketBusKey(sym, 'tick', 'mark'),
    () => collectBitgetSymbolPriceFresh(sym),
    2_000
  );
}
