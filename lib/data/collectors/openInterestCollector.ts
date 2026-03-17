const BASE = 'https://fapi.binance.com/futures/data';

export type OpenInterestPoint = {
  time: number;
  sumOpenInterest: number;
  sumOpenInterestValue: number;
};

/** OI 수집 (선물). period: 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d */
export async function collectOpenInterest(
  symbol: string,
  period: '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '12h' | '1d' = '1h',
  limit = 30
): Promise<OpenInterestPoint[]> {
  const res = await fetch(
    `${BASE}/openInterestHist?symbol=${symbol}&period=${period}&limit=${limit}`,
    { cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`openInterest ${res.status}`);
  const raw = await res.json();
  return raw.map((r: { timestamp: number; sumOpenInterest: string; sumOpenInterestValue: string }) => ({
    time: r.timestamp,
    sumOpenInterest: Number(r.sumOpenInterest),
    sumOpenInterestValue: Number(r.sumOpenInterestValue),
  }));
}
