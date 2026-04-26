import { fetchMarketCandles } from '@/lib/market';
import { collectTrades } from '@/lib/data/collectors/tradesCollector';
import { collectOrderbook } from '@/lib/data/collectors/orderbookCollector';
import { collectFunding } from '@/lib/data/collectors/fundingCollector';
import { collectOpenInterest } from '@/lib/data/collectors/openInterestCollector';
import { collectFuturesTrades } from '@/lib/data/collectors/futuresTradesCollector';
import { collectBybitLinearTrades } from '@/lib/data/collectors/bybitLinearTradesCollector';
import { collectOkxSwapTrades } from '@/lib/data/collectors/okxSwapTradesCollector';
import { collectRecentLiquidations } from '@/lib/data/collectors/liquidationsCollector';
import { computeVolumeDelta } from '@/lib/data/aggregate/volumeDeltaAggregator';
import { computeOrderbookImbalance } from '@/lib/data/aggregate/orderbookImbalance';
import { buildUnifiedMarketMetrics } from '@/lib/data/aggregate/unifiedMarketMetricsBuilder';
import type { Candle } from '@/types';
import type { UnifiedMarketMetrics } from '@/types';
import type { OIState, FundingState } from '@/lib/briefingContext';
import type { OrderbookSnapshot } from '@/lib/data/collectors/orderbookCollector';
import type { AggTrade } from '@/lib/data/collectors/tradesCollector';

/** fetch가 응답 없이 걸리면 Promise.all이 끝나지 않으므로 상한을 둠 */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

const EMPTY_ORDERBOOK = {
  time: Date.now(),
  bids: [] as [number, number][],
  asks: [] as [number, number][],
};

const EMPTY_LIQ = { longSideUsd: 0, shortSideUsd: 0, count: 0 };

export type MarketDataResult = {
  candles: Candle[];
  currentPrice: number;
  buyPressure: number;
  sellPressure: number;
  volumeDelta: number;
  buyVolume: number;
  sellVolume: number;
  oiState: OIState;
  fundingState: FundingState;
  orderbookImbalance: number;
  orderbook: OrderbookSnapshot | null;
  trades: AggTrade[];
  unifiedMarketMetrics: UnifiedMarketMetrics;
};

/** 캔들 + 스팟/선물/Bybit/OKX 체결·호가·펀딩·OI·청산 → 통합 시장 지표 */
export async function fetchMarketData(symbol: string, timeframe: string): Promise<MarketDataResult> {
  const [
    candles,
    spotTrades,
    futTrades,
    bybitTrades,
    okxTrades,
    orderbook,
    funding,
    oi,
    liqs,
  ] = await Promise.all([
    fetchMarketCandles(symbol, timeframe),
    withTimeout(collectTrades(symbol, { limit: 800 }).catch(() => []), 6000, []),
    withTimeout(collectFuturesTrades(symbol, { limit: 800 }).catch(() => []), 6000, []),
    withTimeout(collectBybitLinearTrades(symbol, 600).catch(() => []), 4500, []),
    withTimeout(collectOkxSwapTrades(symbol, 500).catch(() => []), 4500, []),
    withTimeout(collectOrderbook(symbol, 20).catch(() => EMPTY_ORDERBOOK), 5000, EMPTY_ORDERBOOK),
    withTimeout(collectFunding(symbol, 5).catch(() => []), 5000, []),
    withTimeout(collectOpenInterest(symbol, '1h', 24).catch(() => []), 8000, []),
    withTimeout(collectRecentLiquidations(symbol, 80).catch(() => EMPTY_LIQ), 6000, EMPTY_LIQ),
  ]);

  const lastCandle = candles[candles.length - 1];
  const currentPrice = lastCandle ? lastCandle.close : 0;

  const vd = spotTrades.length ? computeVolumeDelta(spotTrades) : { buyPressure: 0.5, sellPressure: 0.5, volumeDelta: 0, buyVolume: 0, sellVolume: 0, tradeCount: 0 };
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

  const unifiedMarketMetrics = buildUnifiedMarketMetrics({
    candles,
    spotTrades,
    futuresTrades: futTrades,
    bybitTrades,
    okxTrades,
    oiPoints: oi,
    liquidations: liqs,
  });

  return {
    candles,
    currentPrice,
    buyPressure: vd.buyPressure,
    sellPressure: vd.sellPressure,
    volumeDelta: vd.volumeDelta,
    buyVolume: vd.buyVolume,
    sellVolume: vd.sellVolume,
    oiState,
    fundingState,
    orderbookImbalance: ob.imbalance,
    orderbook: orderbook.bids.length && orderbook.asks.length ? orderbook : null,
    trades: spotTrades,
    unifiedMarketMetrics,
  };
}
