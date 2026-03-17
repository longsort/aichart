const BASE = 'https://fapi.binance.com/futures/data';

export type LongShortRatioPoint = {
  time: number;
  longShortRatio: number; // ratio of long account / short account
  longAccount: number;
  shortAccount: number;
};

/** 롱숏 비율 수집 (선물). period: 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d */
export async function collectLongShortRatio(
  symbol: string,
  period: '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '12h' | '1d' = '1h',
  limit = 30
): Promise<LongShortRatioPoint[]> {
  const res = await fetch(
    `${BASE}/globalLongShortAccountRatio?symbol=${symbol}&period=${period}&limit=${limit}`,
    { cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`longShortRatio ${res.status}`);
  const raw = await res.json();
  return raw.map((r: { timestamp: number; longShortRatio: string; longAccount: string; shortAccount: string }) => ({
    time: r.timestamp,
    longShortRatio: Number(r.longShortRatio),
    longAccount: Number(r.longAccount),
    shortAccount: Number(r.shortAccount),
  }));
}
