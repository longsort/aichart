const BASE = 'https://fapi.binance.com/fapi/v1';

export type FundingRate = {
  symbol: string;
  fundingTime: number;
  fundingRate: number; // 8h rate as decimal, e.g. 0.0001 = 0.01%
};

/** 펀딩비 수집 (선물). 스팟 심볼도 USDT 선물로 동일 심볼 사용 가능 */
export async function collectFunding(
  symbol: string,
  limit = 10
): Promise<FundingRate[]> {
  const res = await fetch(`${BASE}/fundingRate?symbol=${symbol}&limit=${limit}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`funding ${res.status}`);
  const raw = await res.json();
  return raw.map((r: { symbol: string; fundingTime: number; fundingRate: string }) => ({
    symbol: r.symbol,
    fundingTime: r.fundingTime,
    fundingRate: Number(r.fundingRate),
  }));
}
