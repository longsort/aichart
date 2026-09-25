/**
 * Bitget USDT-M 선물 최근 체결 (공개 API · 키 불필요).
 * side buy/sell → AggTrade.isBuyerMaker (매수 체결 = false).
 */
import type { AggTrade } from '@/lib/data/collectors/tradesCollector';

type BitgetFillRow = {
  tradeId?: string;
  price?: string;
  size?: string;
  side?: string;
  ts?: string;
};

export async function collectBitgetFuturesFills(
  symbol: string,
  options?: { limit?: number }
): Promise<AggTrade[]> {
  const lim = Math.min(100, Math.max(1, options?.limit ?? 100));
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BTCUSDT';
  const q = new URLSearchParams({
    symbol: sym,
    productType: 'USDT-FUTURES',
    limit: String(lim),
  });
  const res = await fetch(`https://api.bitget.com/api/v2/mix/market/fills?${q}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`bitget fills ${res.status}`);
  const j = (await res.json()) as { code?: string; data?: BitgetFillRow[] };
  if (j.code && j.code !== '00000') throw new Error(`bitget fills code ${j.code}`);
  const rows = Array.isArray(j.data) ? j.data : [];
  return rows
    .map((t) => {
      const price = Number(t.price);
      const qty = Number(t.size);
      const ts = Number(t.ts);
      const side = String(t.side || '').toLowerCase();
      if (!(price > 0) || !(qty > 0) || !Number.isFinite(ts)) return null;
      return {
        time: ts,
        price,
        qty,
        // buy = taker buy → isBuyerMaker false
        isBuyerMaker: side === 'sell',
      } satisfies AggTrade;
    })
    .filter((x): x is AggTrade => !!x);
}
