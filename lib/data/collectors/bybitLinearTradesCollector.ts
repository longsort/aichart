import type { AggTrade } from '@/lib/data/collectors/tradesCollector';

/** Bybit V5 linear 최근 체결 — 심볼 BTCUSDT 형식 */
export async function collectBybitLinearTrades(symbol: string, limit = 500): Promise<AggTrade[]> {
  const lim = Math.min(1000, Math.max(1, limit));
  const url = `https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=${encodeURIComponent(symbol)}&limit=${lim}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const j = (await res.json()) as { retCode?: number; result?: { list?: Array<{ execTime?: string; side?: string; price?: string; size?: string }> } };
  if (j.retCode !== 0 || !j.result?.list?.length) return [];
  return j.result.list.map((t) => {
    const time = Number(t.execTime ?? Date.now());
    const price = Number(t.price ?? 0);
    const qty = Number(t.size ?? 0);
    const side = String(t.side || '').toLowerCase();
    const isBuyerMaker = side === 'sell';
    return { time, price, qty, isBuyerMaker };
  });
}
