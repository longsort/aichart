import type { OrderbookSnapshot } from '@/lib/data/collectors/orderbookCollector';

export type OrderbookImbalanceResult = {
  bidVolume: number;
  askVolume: number;
  imbalance: number; // (bid - ask) / (bid + ask), -1 ~ 1
  bidPressure: number; // 0..1
  askPressure: number;
};

/** 호가창 양쪽 합계로 imbalance 계산 (가격 * 수량 합) */
export function computeOrderbookImbalance(ob: OrderbookSnapshot): OrderbookImbalanceResult {
  const bidVolume = ob.bids.reduce((s, [p, q]) => s + p * q, 0);
  const askVolume = ob.asks.reduce((s, [p, q]) => s + p * q, 0);
  const total = bidVolume + askVolume;
  const imbalance = total > 0 ? (bidVolume - askVolume) / total : 0;
  const bidPressure = total > 0 ? bidVolume / total : 0.5;
  const askPressure = total > 0 ? askVolume / total : 0.5;
  return {
    bidVolume,
    askVolume,
    imbalance,
    bidPressure,
    askPressure,
  };
}
