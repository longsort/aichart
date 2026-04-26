import type { AggTrade } from '@/lib/data/collectors/tradesCollector';

/** 바이낸스 USDT-M 선물 aggTrades (스팟과 동형) */
export async function collectFuturesTrades(
  symbol: string,
  options?: { limit?: number },
): Promise<AggTrade[]> {
  const lim = Math.min(1000, Math.max(1, options?.limit ?? 500));
  const res = await fetch(`https://fapi.binance.com/fapi/v1/aggTrades?symbol=${encodeURIComponent(symbol)}&limit=${lim}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`futures aggTrades ${res.status}`);
  const raw = await res.json();
  return raw.map((t: { T: number; p: string; q: string; m: boolean }) => ({
    time: t.T,
    price: Number(t.p),
    qty: Number(t.q),
    isBuyerMaker: t.m,
  }));
}
