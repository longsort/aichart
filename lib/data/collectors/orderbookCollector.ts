const BASE = 'https://api.binance.com/api/v3';

export type OrderbookSnapshot = {
  time: number;
  bids: Array<[price: number, qty: number]>;
  asks: Array<[price: number, qty: number]>;
};

/** 호가창 수집 (depth) */
export async function collectOrderbook(
  symbol: string,
  limit: 5 | 10 | 20 | 50 | 100 = 20
): Promise<OrderbookSnapshot> {
  const res = await fetch(`${BASE}/depth?symbol=${symbol}&limit=${limit}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`orderbook ${res.status}`);
  const raw = await res.json();
  const parse = (arr: string[][]) => arr.map(([p, q]) => [Number(p), Number(q)] as [number, number]);
  return {
    time: Date.now(),
    bids: parse(raw.bids || []),
    asks: parse(raw.asks || []),
  };
}
