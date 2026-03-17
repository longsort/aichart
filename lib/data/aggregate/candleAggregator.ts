import type { Candle } from '@/types';

const TF_TO_MS: Record<string, number> = {
  '1m': 60 * 1000,
  '3m': 3 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
};

/** 1m 원천 캔들을 목표 타임프레임으로 재집계 */
export function aggregateCandles(
  candles1m: Candle[],
  targetTimeframe: string
): Candle[] {
  if (targetTimeframe === '1m') return candles1m;
  const bucketMs = TF_TO_MS[targetTimeframe];
  if (!bucketMs) return candles1m;

  const buckets = new Map<number, Candle[]>();
  for (const c of candles1m) {
    const t = c.time * 1000;
    const bucketStart = Math.floor(t / bucketMs) * bucketMs;
    const key = Math.floor(bucketStart / 1000);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }

  const out: Candle[] = [];
  for (const [key, arr] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
    arr.sort((a, b) => a.time - b.time);
    const first = arr[0];
    const last = arr[arr.length - 1];
    out.push({
      time: key,
      open: first.open,
      high: Math.max(...arr.map(x => x.high)),
      low: Math.min(...arr.map(x => x.low)),
      close: last.close,
      volume: arr.reduce((s, x) => s + x.volume, 0),
    });
  }
  return out.sort((a, b) => a.time - b.time);
}
