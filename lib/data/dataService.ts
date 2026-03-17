import { collectCandles } from '@/lib/data/collectors/candlesCollector';
import { collectTrades } from '@/lib/data/collectors/tradesCollector';
import { collectOrderbook } from '@/lib/data/collectors/orderbookCollector';
import { collectFunding } from '@/lib/data/collectors/fundingCollector';
import { collectOpenInterest } from '@/lib/data/collectors/openInterestCollector';
import { computeVolumeDelta } from '@/lib/data/aggregate/volumeDeltaAggregator';
import { computeOrderbookImbalance } from '@/lib/data/aggregate/orderbookImbalance';
import type { Candle } from '@/types';
import type { OIState, FundingState } from '@/lib/briefingContext';
import type { OrderbookSnapshot } from '@/lib/data/collectors/orderbookCollector';
import type { AggTrade } from '@/lib/data/collectors/tradesCollector';

export type MarketDataResult = {
  candles: Candle[];
  currentPrice: number;
  buyPressure: number;
  sellPressure: number;
  volumeDelta: number;
  oiState: OIState;
  fundingState: FundingState;
  orderbookImbalance: number;
  orderbook: OrderbookSnapshot | null;
  trades: AggTrade[];
};

/** 캔들(요청 tf) + 거래/호가/펀딩/OI 수집. 캔들은 거래소에서 해당 타임프레임으로 직접 수집(충분한 봉 수 확보) */
export async function fetchMarketData(
  symbol: string,
  timeframe: string
): Promise<MarketDataResult> {
  const [candles, trades, orderbook, funding, oi] = await Promise.all([
    collectCandles(symbol, timeframe, 1000),
    collectTrades(symbol, { limit: 500 }).catch(() => []),
    collectOrderbook(symbol, 20).catch(() => ({ time: Date.now(), bids: [] as [number, number][], asks: [] as [number, number][] })),
    collectFunding(symbol, 5).catch(() => []),
    collectOpenInterest(symbol, '1h', 10).catch(() => []),
  ]);

  const lastCandle = candles[candles.length - 1];
  const currentPrice = lastCandle ? lastCandle.close : 0;

  const vd = trades.length ? computeVolumeDelta(trades) : { buyPressure: 0.5, sellPressure: 0.5, volumeDelta: 0 };
  const ob = orderbook.bids.length && orderbook.asks.length
    ? computeOrderbookImbalance(orderbook)
    : { imbalance: 0 };

  let oiState: OIState = 'neutral';
  if (oi.length >= 2) {
    const a = oi[oi.length - 2].sumOpenInterest;
    const b = oi[oi.length - 1].sumOpenInterest;
    if (b > a * 1.002) oiState = 'increasing';
    else if (b < a * 0.998) oiState = 'decreasing';
  }

  let fundingState: FundingState = 'neutral';
  if (funding.length) {
    const r = funding[funding.length - 1].fundingRate;
    if (r > 0.00005) fundingState = 'positive';
    else if (r < -0.00005) fundingState = 'negative';
  }

  return {
    candles,
    currentPrice,
    buyPressure: vd.buyPressure,
    sellPressure: vd.sellPressure,
    volumeDelta: vd.volumeDelta,
    oiState,
    fundingState,
    orderbookImbalance: ob.imbalance,
    orderbook: orderbook.bids.length && orderbook.asks.length ? orderbook : null,
    trades,
  };
}
