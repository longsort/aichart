import type { AggTrade } from '@/lib/data/collectors/tradesCollector';

export type VolumeDeltaResult = {
  buyVolume: number;
  sellVolume: number;
  volumeDelta: number; // buy - sell
  buyPressure: number; // 0..1, buy / (buy+sell)
  sellPressure: number;
  tradeCount: number;
};

/** aggTrades 기준: isBuyerMaker true = 매도 체결, false = 매수 체결. buy = taker buy = !isBuyerMaker */
export function computeVolumeDelta(trades: AggTrade[]): VolumeDeltaResult {
  let buyVolume = 0;
  let sellVolume = 0;
  for (const t of trades) {
    const vol = t.price * t.qty;
    if (t.isBuyerMaker) sellVolume += vol;
    else buyVolume += vol;
  }
  const total = buyVolume + sellVolume;
  const buyPressure = total > 0 ? buyVolume / total : 0.5;
  const sellPressure = total > 0 ? sellVolume / total : 0.5;
  return {
    buyVolume,
    sellVolume,
    volumeDelta: buyVolume - sellVolume,
    buyPressure,
    sellPressure,
    tradeCount: trades.length,
  };
}
