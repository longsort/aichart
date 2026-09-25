import fs from 'fs/promises';
import path from 'path';
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';

const cache = new Map<string, { at: number; candles: Candle[] }>();
const TTL_MS = 30_000;

function tfToFileSuffix(tf: string): string {
  const n = normalizeChartTimeframe(String(tf || '15m'));
  const map: Record<string, string> = {
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1H',
    '4h': '4H',
    '1d': '1D',
    '1w': '1W',
    '1M': '1M',
    '1Y': '1Y',
  };
  if (!map[n]) return null;
  return map[n];
}

export async function readBitgetFuturesCsv(symbol: string, timeframe: string): Promise<Candle[]> {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const tf = tfToFileSuffix(timeframe);
  if (!tf) return [];
  const key = `${sym}|${tf}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.candles;

  const file = path.join(process.cwd(), 'data', 'bitget-futures', `${sym}_${tf}.csv`);
  const text = await fs.readFile(file, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];
  const out: Candle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 8) continue;
    const ms = Number(cols[0]);
    const open = Number(cols[2]);
    const high = Number(cols[3]);
    const low = Number(cols[4]);
    const close = Number(cols[5]);
    const volume = Number(cols[6]);
    if (!Number.isFinite(ms) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close) || !Number.isFinite(volume)) {
      continue;
    }
    out.push({
      time: Math.floor(ms / 1000),
      open,
      high,
      low,
      close,
      volume,
    });
  }
  out.sort((a, b) => a.time - b.time);
  cache.set(key, { at: Date.now(), candles: out });
  return out;
}
