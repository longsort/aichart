import type { Candle } from '@/types';
import type { UnifiedMarketExchangeLeg, UnifiedMarketMetrics } from '@/types';
import type { AggTrade } from '@/lib/data/collectors/tradesCollector';
import { computeCmfLast } from '@/lib/indicators/cmf';
import { computeCumulativeCvdUsd, computeVolumeDelta } from '@/lib/data/aggregate/volumeDeltaAggregator';
import type { OpenInterestPoint } from '@/lib/data/collectors/openInterestCollector';
import type { LiquidationSummary } from '@/lib/data/collectors/liquidationsCollector';

export function buildUnifiedMarketMetrics(params: {
  candles: Candle[];
  spotTrades: AggTrade[];
  futuresTrades: AggTrade[];
  bybitTrades: AggTrade[];
  okxTrades: AggTrade[];
  oiPoints: OpenInterestPoint[];
  liquidations: LiquidationSummary;
}): UnifiedMarketMetrics {
  const spotVd = params.spotTrades.length ? computeVolumeDelta(params.spotTrades) : null;
  const futVd = params.futuresTrades.length ? computeVolumeDelta(params.futuresTrades) : null;
  const bybitVd = params.bybitTrades.length ? computeVolumeDelta(params.bybitTrades) : null;
  const okxVd = params.okxTrades.length ? computeVolumeDelta(params.okxTrades) : null;

  const spotCvd = computeCumulativeCvdUsd(params.spotTrades);
  const futuresCvd = computeCumulativeCvdUsd(params.futuresTrades);
  const bybitCvd = computeCumulativeCvdUsd(params.bybitTrades);
  const okxCvd = computeCumulativeCvdUsd(params.okxTrades);

  const exchangeLegs: UnifiedMarketExchangeLeg[] = [];
  if (params.spotTrades.length) {
    exchangeLegs.push({
      venue: 'Binance Spot',
      cumulativeCvdUsd: spotCvd,
      volumeDeltaUsd: spotVd!.volumeDelta,
      tradeCount: params.spotTrades.length,
    });
  }
  if (params.futuresTrades.length) {
    exchangeLegs.push({
      venue: 'Binance USDT-M',
      cumulativeCvdUsd: futuresCvd,
      volumeDeltaUsd: futVd!.volumeDelta,
      tradeCount: params.futuresTrades.length,
    });
  }
  if (params.bybitTrades.length) {
    exchangeLegs.push({
      venue: 'Bybit Linear',
      cumulativeCvdUsd: bybitCvd,
      volumeDeltaUsd: bybitVd!.volumeDelta,
      tradeCount: params.bybitTrades.length,
    });
  }
  if (params.okxTrades.length) {
    exchangeLegs.push({
      venue: 'OKX Swap',
      cumulativeCvdUsd: okxCvd,
      volumeDeltaUsd: okxVd!.volumeDelta,
      tradeCount: params.okxTrades.length,
    });
  }

  const aggregatedCvdUsd = spotCvd + futuresCvd + bybitCvd + okxCvd;

  const oi = params.oiPoints;
  let oiLatest: number | null = null;
  let oiPrevious: number | null = null;
  let oiDeltaAbs: number | null = null;
  let oiDeltaPct: number | null = null;
  if (oi.length >= 2) {
    oiPrevious = oi[oi.length - 2].sumOpenInterest;
    oiLatest = oi[oi.length - 1].sumOpenInterest;
    oiDeltaAbs = oiLatest - oiPrevious;
    if (oiPrevious > 0) oiDeltaPct = (oiDeltaAbs / oiPrevious) * 100;
  } else if (oi.length === 1) {
    oiLatest = oi[0].sumOpenInterest;
  }

  const cmf20 = computeCmfLast(params.candles, 20);

  const buyVolumeUsd = spotVd?.buyVolume ?? 0;
  const sellVolumeUsd = spotVd?.sellVolume ?? 0;

  return {
    spotCumulativeCvdUsd: spotCvd,
    futuresCumulativeCvdUsd: futuresCvd,
    aggregatedCvdUsd,
    buyVolumeUsd,
    sellVolumeUsd,
    oiLatest,
    oiPrevious,
    oiDeltaAbs,
    oiDeltaPct,
    liquidationLongUsd: params.liquidations.longSideUsd,
    liquidationShortUsd: params.liquidations.shortSideUsd,
    cmf20,
    exchangeLegs,
    collectedAtMs: Date.now(),
  };
}
