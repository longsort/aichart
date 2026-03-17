import type { OrderbookSnapshot } from '@/lib/data/collectors/orderbookCollector';

/**
 * 특정 가격 구간 [mid * (1 - pct), mid * (1 + pct)] 안의 호가 수량 합(체결 가능량)을 계산.
 * 많음/적음/보통은 전체 호가 대비 비율로 판단.
 */
export function getOrderbookDepthAtPrice(
  ob: OrderbookSnapshot,
  midPrice: number,
  pctRange: number = 0.002
): { totalQty: number; bidQty: number; askQty: number } {
  const lo = midPrice * (1 - pctRange);
  const hi = midPrice * (1 + pctRange);
  let bidQty = 0;
  let askQty = 0;
  for (const [p, q] of ob.bids) {
    if (p >= lo && p <= hi) bidQty += q;
  }
  for (const [p, q] of ob.asks) {
    if (p >= lo && p <= hi) askQty += q;
  }
  return { totalQty: bidQty + askQty, bidQty, askQty };
}

/** 전체 호가 평균 수준 대비 해당 구간 비율로 많음/적음/보통 반환 */
export function orderbookDepthLabel(
  ob: OrderbookSnapshot,
  midPrice: number,
  pctRange: number = 0.002
): 'many' | 'few' | 'medium' {
  const { totalQty } = getOrderbookDepthAtPrice(ob, midPrice, pctRange);
  const totalBidQty = ob.bids.reduce((s, [, q]) => s + q, 0);
  const totalAskQty = ob.asks.reduce((s, [, q]) => s + q, 0);
  const avgPerLevel = ob.bids.length + ob.asks.length > 0
    ? (totalBidQty + totalAskQty) / (ob.bids.length + ob.asks.length)
    : 0;
  if (avgPerLevel <= 0) return 'medium';
  const ratio = totalQty / avgPerLevel;
  if (ratio >= 1.5) return 'many';
  if (ratio <= 0.5) return 'few';
  return 'medium';
}
