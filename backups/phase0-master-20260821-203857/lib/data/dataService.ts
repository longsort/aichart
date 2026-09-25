import { fetchAnalyzeCandles, type AnalyzeCandlePack } from '@/lib/analyzeCandleSource';
import { collectTrades } from '@/lib/data/collectors/tradesCollector';
import { collectOrderbook } from '@/lib/data/collectors/orderbookCollector';
import { collectBitgetFuturesOrderbook } from '@/lib/data/collectors/bitgetFuturesOrderbookCollector';
import {
  collectBitgetFuturesFills,
  collectBitgetFuturesFillsHistory,
} from '@/lib/data/collectors/bitgetFuturesFillsCollector';
import { collectBitgetFuturesLiquidations } from '@/lib/data/collectors/bitgetFuturesLiquidationsCollector';
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
import { resolveEagle1LiveAvailability } from '@/lib/eagle1/availabilityFromLive';
import type { Eagle1AvailabilityFlags } from '@/lib/eagle1/rawTypes';
import type { Eagle1MoneyPressureLive } from '@/lib/eagle1/moneyPressureBand';
import {
  bookSnapFromDepth,
  bucketTradesToOfi,
  lastOfi,
  liqAccelFromPoints,
  replenishmentFromBooks,
} from '@/lib/eagle1/microstructureSeries';
import { ingestMicrostructureSeries } from '@/lib/eagle1/seriesStore';

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

const EMPTY_LIQ = { longSideUsd: 0, shortSideUsd: 0, count: 0, clusters: [] };

const EMPTY_VD = {
  buyPressure: 0.5,
  sellPressure: 0.5,
  volumeDelta: 0,
  buyVolume: 0,
  sellVolume: 0,
  tradeCount: 0,
};

function mergeBitgetFills(a: AggTrade[], b: AggTrade[]): AggTrade[] {
  const seen = new Set<string>();
  const out: AggTrade[] = [];
  for (const t of [...a, ...b]) {
    const key = `${t.time}:${t.price}:${t.qty}:${t.isBuyerMaker ? 1 : 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.sort((x, y) => x.time - y.time);
}

export type MarketDataResult = {
  candles: Candle[];
  candleSource?: AnalyzeCandlePack;
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
  /** Eagle1 has_orderbook 는 bitget 라이브만. 바이낸스 북은 브리핑 폴백. */
  orderbookSource: 'bitget' | 'binance' | null;
  trades: AggTrade[];
  unifiedMarketMetrics: UnifiedMarketMetrics;
  eagle1Availability: Eagle1AvailabilityFlags;
  bitgetFills: AggTrade[];
  moneyLive: Eagle1MoneyPressureLive;
};

/** 캔들 + 스팟/선물/Bybit/OKX 체결·호가·펀딩·OI·청산 → 통합 시장 지표 */
export async function fetchMarketData(symbol: string, timeframe: string): Promise<MarketDataResult> {
  const [
    candlePack,
    spotTrades,
    futTrades,
    bybitTrades,
    okxTrades,
    orderbook,
    bitgetOrderbook,
    funding,
    oi,
    liqs,
    bitgetFillsLive,
    bitgetFillsHist,
    bitgetLiqs,
  ] = await Promise.all([
    fetchAnalyzeCandles(symbol, timeframe),
    withTimeout(collectTrades(symbol, { limit: 800 }).catch(() => []), 6000, []),
    withTimeout(collectFuturesTrades(symbol, { limit: 800 }).catch(() => []), 6000, []),
    withTimeout(collectBybitLinearTrades(symbol, 600).catch(() => []), 4500, []),
    withTimeout(collectOkxSwapTrades(symbol, 500).catch(() => []), 4500, []),
    withTimeout(collectOrderbook(symbol, 20).catch(() => EMPTY_ORDERBOOK), 5000, EMPTY_ORDERBOOK),
    withTimeout(collectBitgetFuturesOrderbook(symbol, { limit: 15 }).catch(() => EMPTY_ORDERBOOK), 5000, EMPTY_ORDERBOOK),
    withTimeout(collectFunding(symbol, 5).catch(() => []), 5000, []),
    withTimeout(collectOpenInterest(symbol, '1h', 24).catch(() => []), 8000, []),
    withTimeout(collectRecentLiquidations(symbol, 80).catch(() => EMPTY_LIQ), 6000, EMPTY_LIQ),
    withTimeout(collectBitgetFuturesFills(symbol, { limit: 100 }).catch(() => []), 5000, []),
    withTimeout(collectBitgetFuturesFillsHistory(symbol, { limit: 1000, pages: 2 }).catch(() => []), 8000, []),
    withTimeout(collectBitgetFuturesLiquidations(symbol, { limit: 100, pages: 3 }).catch(() => []), 8000, []),
  ]);

  const candles = candlePack.candles;
  const lastCandle = candles[candles.length - 1];
  const currentPrice = lastCandle ? lastCandle.close : 0;

  const bitgetFills = mergeBitgetFills(bitgetFillsLive, bitgetFillsHist);
  const vdBitget = bitgetFills.length ? computeVolumeDelta(bitgetFills) : null;
  const vdSpot = spotTrades.length ? computeVolumeDelta(spotTrades) : EMPTY_VD;
  const vd = vdBitget ?? vdSpot;
  const bitgetOk = bitgetOrderbook.bids.length > 0 && bitgetOrderbook.asks.length > 0;
  const binanceOk = orderbook.bids.length > 0 && orderbook.asks.length > 0;
  const liveBook = bitgetOk ? bitgetOrderbook : binanceOk ? orderbook : EMPTY_ORDERBOOK;
  const orderbookSource: MarketDataResult['orderbookSource'] = bitgetOk ? 'bitget' : binanceOk ? 'binance' : null;
  const ob = liveBook.bids.length && liveBook.asks.length
    ? computeOrderbookImbalance(liveBook)
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

  const ofi10s = bucketTradesToOfi(bitgetFills, 10_000);
  const ofi30s = bucketTradesToOfi(bitgetFills, 30_000);
  const bookSnap = bitgetOk ? bookSnapFromDepth(bitgetOrderbook) : null;
  let series = {
    ofi10s,
    ofi30s,
    books: bookSnap ? [bookSnap] : [],
    liqs: bitgetLiqs,
  };
  try {
    series = ingestMicrostructureSeries({
      symbol,
      ofi10s,
      ofi30s,
      book: bookSnap,
      liqs: bitgetLiqs,
    });
  } catch {
    /* 시리즈 저장 실패해도 이번 수집분은 엔진에 넘긴다 */
  }

  const replenish = replenishmentFromBooks(series.books);
  const liqAccel = liqAccelFromPoints(series.liqs);
  const ofiNow = lastOfi(series.ofi10s);
  const hasOfi = series.ofi10s.length >= 1 && ofiNow != null;
  const eagle1TradeCount = bitgetFills.length > 0 ? bitgetFills.length : spotTrades.length + futTrades.length + bybitTrades.length + okxTrades.length;
  const eagle1Availability = resolveEagle1LiveAvailability({
    hasBitgetOrderbook: bitgetOk,
    tradeCount: eagle1TradeCount,
    oiPoints: oi.length,
    fundingPoints: funding.length,
    liquidationSeriesPoints: series.liqs.length,
  });

  const moneyLive: Eagle1MoneyPressureLive = {
    buyPressure: vd.buyPressure,
    sellPressure: vd.sellPressure,
    volumeDelta: vdBitget ? vdBitget.volumeDelta : vd.volumeDelta,
    orderbookImbalance: bitgetOk ? ob.imbalance : null,
    has_cvd: bitgetFills.length > 0,
    has_orderbook: bitgetOk,
    has_trades: bitgetFills.length > 0 || eagle1TradeCount > 0,
    oiState,
    spreadBps: bookSnap?.spreadBps ?? null,
    bidQty: bookSnap?.bidQty ?? null,
    askQty: bookSnap?.askQty ?? null,
    ofi: ofiNow,
    has_ofi: hasOfi,
    ofi10s: series.ofi10s,
    ofi30s: series.ofi30s,
    replenishBid: replenish.replenishBid,
    replenishAsk: replenish.replenishAsk,
    replenishScore: replenish.score,
    bookSeriesPoints: series.books.length,
    liqAccel: liqAccel.accel,
    liqSeriesPoints: series.liqs.length,
  };

  return {
    candles,
    candleSource: candlePack,
    currentPrice,
    buyPressure: vd.buyPressure,
    sellPressure: vd.sellPressure,
    volumeDelta: vd.volumeDelta,
    buyVolume: vd.buyVolume,
    sellVolume: vd.sellVolume,
    oiState,
    fundingState,
    orderbookImbalance: ob.imbalance,
    orderbook: liveBook.bids.length && liveBook.asks.length ? liveBook : null,
    orderbookSource,
    trades: bitgetFills.length ? bitgetFills : spotTrades,
    unifiedMarketMetrics,
    eagle1Availability,
    bitgetFills,
    moneyLive,
  };
}
