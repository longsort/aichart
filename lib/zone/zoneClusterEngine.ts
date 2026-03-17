import type { OrderbookSnapshot } from '@/lib/data/collectors/orderbookCollector';
import type { AggTrade } from '@/lib/data/collectors/tradesCollector';

const BAND_PCT = 0.0015;
const MIN_ZONE_WIDTH_PCT = 0.0008;

/** 고래 체결: 1건당 최소 금액(USDT). 이 이상만 zone에 반영 */
const WHALE_TRADE_MIN_USDT = 10_000;
/** 기관 호가: 레벨당 최소 유동성(USDT). 이 이상인 호가만 zone에 반영 */
const INSTITUTION_OB_MIN_USDT = 25_000;

export type RawZone = {
  low: number;
  high: number;
  type: 'buy' | 'sell';
  bidLiquidity: number;
  askLiquidity: number;
  executedBuy: number;
  executedSell: number;
  reactionCount: number;
  count: number;
};

function mergeOverlapping(zones: RawZone[], sameTypeOnly = false): RawZone[] {
  if (zones.length <= 1) return zones;
  const byType = sameTypeOnly
    ? [zones.filter(z => z.type === 'buy'), zones.filter(z => z.type === 'sell')]
    : [zones];
  const out: RawZone[] = [];
  for (const list of byType) {
    if (list.length === 0) continue;
    const sorted = [...list].sort((a, b) => a.low - b.low);
    let cur = { ...sorted[0] };
    for (let i = 1; i < sorted.length; i++) {
      const z = sorted[i];
      if (z.low <= cur.high * (1 + BAND_PCT * 2)) {
        cur.high = Math.max(cur.high, z.high);
        cur.low = Math.min(cur.low, z.low);
        cur.bidLiquidity += z.bidLiquidity;
        cur.askLiquidity += z.askLiquidity;
        cur.executedBuy += z.executedBuy;
        cur.executedSell += z.executedSell;
        cur.reactionCount += z.reactionCount;
        cur.count += z.count;
      } else {
        out.push(cur);
        cur = { ...z };
      }
    }
    out.push(cur);
  }
  return out;
}

function clusterOrderbookLevels(
  ob: OrderbookSnapshot,
  currentPrice: number
): RawZone[] {
  const zones: RawZone[] = [];
  const band = currentPrice * BAND_PCT;

  const addBid = (price: number, qty: number) => {
    const notional = price * qty;
    if (notional < INSTITUTION_OB_MIN_USDT) return;
    const low = price - band;
    const high = price + band;
    const existing = zones.find(z => z.type === 'buy' && z.high >= low && z.low <= high);
    if (existing) {
      existing.bidLiquidity += notional;
      existing.low = Math.min(existing.low, low);
      existing.high = Math.max(existing.high, high);
      existing.count += 1;
    } else {
      zones.push({
        low,
        high,
        type: 'buy',
        bidLiquidity: notional,
        askLiquidity: 0,
        executedBuy: 0,
        executedSell: 0,
        reactionCount: 0,
        count: 1,
      });
    }
  };

  const addAsk = (price: number, qty: number) => {
    const notional = price * qty;
    if (notional < INSTITUTION_OB_MIN_USDT) return;
    const low = price - band;
    const high = price + band;
    const existing = zones.find(z => z.type === 'sell' && z.high >= low && z.low <= high);
    if (existing) {
      existing.askLiquidity += notional;
      existing.low = Math.min(existing.low, low);
      existing.high = Math.max(existing.high, high);
      existing.count += 1;
    } else {
      zones.push({
        low,
        high,
        type: 'sell',
        bidLiquidity: 0,
        askLiquidity: notional,
        executedBuy: 0,
        executedSell: 0,
        reactionCount: 0,
        count: 1,
      });
    }
  };

  for (const [price, qty] of ob.bids) {
    addBid(price, qty);
  }
  for (const [price, qty] of ob.asks) {
    addAsk(price, qty);
  }

  return mergeOverlapping(zones, true);
}

function clusterTrades(
  trades: AggTrade[],
  currentPrice: number
): RawZone[] {
  const zones: RawZone[] = [];
  const band = Math.max(currentPrice * BAND_PCT, currentPrice * MIN_ZONE_WIDTH_PCT);

  for (const t of trades) {
    const vol = t.price * t.qty;
    if (vol < WHALE_TRADE_MIN_USDT) continue;
    const low = t.price - band;
    const high = t.price + band;
    const existing = zones.find(z => z.high >= low && z.low <= high);
    if (existing) {
      existing.low = Math.min(existing.low, low);
      existing.high = Math.max(existing.high, high);
      if (t.isBuyerMaker) {
        existing.executedSell += vol;
      } else {
        existing.executedBuy += vol;
      }
      existing.reactionCount += 1;
      existing.count += 1;
    } else {
      zones.push({
        low,
        high,
        type: t.isBuyerMaker ? 'sell' : 'buy',
        bidLiquidity: 0,
        askLiquidity: 0,
        executedBuy: t.isBuyerMaker ? 0 : vol,
        executedSell: t.isBuyerMaker ? vol : 0,
        reactionCount: 1,
        count: 1,
      });
    }
  }

  return mergeOverlapping(zones, true);
}

export function clusterZones(
  orderbook: OrderbookSnapshot | null,
  trades: AggTrade[],
  currentPrice: number
): RawZone[] {
  const obZones = orderbook && orderbook.bids.length && orderbook.asks.length
    ? clusterOrderbookLevels(orderbook, currentPrice)
    : [];
  const tradeZones = clusterTrades(trades, currentPrice);

  const byKey = (z: RawZone) => `${z.type}-${(z.low + z.high) / 2}`;
  const merged: Map<string, RawZone> = new Map();
  for (const z of obZones) {
    const k = byKey(z);
    merged.set(k, { ...z });
  }
  for (const z of tradeZones) {
    const mid = (z.low + z.high) / 2;
    const k = `${z.type}-${mid}`;
    const existing = merged.get(k) ?? Array.from(merged.values()).find(
      e => e.type === z.type && e.high >= z.low && e.low <= z.high
    );
    if (existing) {
      existing.low = Math.min(existing.low, z.low);
      existing.high = Math.max(existing.high, z.high);
      existing.executedBuy += z.executedBuy;
      existing.executedSell += z.executedSell;
      existing.reactionCount += z.reactionCount;
      existing.count += z.count;
    } else {
      merged.set(k, { ...z });
    }
  }

  const list = Array.from(merged.values());
  return mergeOverlapping(list, true);
}
