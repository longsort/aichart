import type { AggTrade } from '@/lib/data/collectors/tradesCollector';

export type TradesAtPriceZoneResult = {
  buyQty: number;
  sellQty: number;
  buyVolume: number;
  sellVolume: number;
  buyPressure: number; // 0..1
  sellPressure: number;
  tradeCount: number;
};

/**
 * 특정 가격 구간 [center * (1 - pct), center * (1 + pct)] 안의 체결만 집계.
 * isBuyerMaker true = 매도 체결, false = 매수 체결.
 */
export function tradesAtPriceZone(
  trades: AggTrade[],
  centerPrice: number,
  pctRange: number = 0.002
): TradesAtPriceZoneResult {
  const lo = centerPrice * (1 - pctRange);
  const hi = centerPrice * (1 + pctRange);
  let buyQty = 0;
  let sellQty = 0;
  let buyVolume = 0;
  let sellVolume = 0;
  for (const t of trades) {
    if (t.price < lo || t.price > hi) continue;
    const vol = t.price * t.qty;
    if (t.isBuyerMaker) {
      sellQty += t.qty;
      sellVolume += vol;
    } else {
      buyQty += t.qty;
      buyVolume += vol;
    }
  }
  const totalVol = buyVolume + sellVolume;
  const buyPressure = totalVol > 0 ? buyVolume / totalVol : 0.5;
  const sellPressure = totalVol > 0 ? sellVolume / totalVol : 0.5;
  return {
    buyQty,
    sellQty,
    buyVolume,
    sellVolume,
    buyPressure,
    sellPressure,
    tradeCount: trades.filter(t => t.price >= lo && t.price <= hi).length,
  };
}
