import { Candle } from '@/types';

/**
 * Railway 등 배포 환경: 같은 컨테이너에서 도는 캔들 서버( Bitget + PROXY ) 사용.
 * 실패 시 null 반환 → 호출측에서 fetchMarketCandles 등으로 fallback.
 */
const CANDLES_SERVER =
  process.env.CANDLES_SERVER_URL ||
  `http://127.0.0.1:${process.env.SERVER_PORT || '3001'}`;

export async function getCandlesFromServer(
  symbol: string,
  timeframe: string
): Promise<Candle[] | null> {
  try {
    const url = `${CANDLES_SERVER}/candles?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(timeframe)}`;
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return data as Candle[];
  } catch {
    return null;
  }
}
