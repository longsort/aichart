const BASE = 'https://api.binance.com/api/v3';

export type AggTrade = {
  time: number;
  price: number;
  qty: number;
  isBuyerMaker: boolean; // true = sell (maker was sell), false = buy
};

/** 체결 데이터 수집 (aggTrades). isBuyerMaker true = 매도 체결, false = 매수 체결 */
export async function collectTrades(
  symbol: string,
  options?: { startTime?: number; endTime?: number; limit?: number }
): Promise<AggTrade[]> {
  const params = new URLSearchParams({ symbol, limit: String(options?.limit ?? 500) });
  if (options?.startTime != null) params.set('startTime', String(options.startTime));
  if (options?.endTime != null) params.set('endTime', String(options.endTime));
  const res = await fetch(`${BASE}/aggTrades?${params}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`trades ${res.status}`);
  const raw = await res.json();
  return raw.map((t: { T: number; p: string; q: string; m: boolean }) => ({
    time: t.T,
    price: Number(t.p),
    qty: Number(t.q),
    isBuyerMaker: t.m,
  }));
}
