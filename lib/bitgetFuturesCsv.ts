import fs from 'fs/promises';
import path from 'path';
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';

const cache = new Map<string, { at: number; candles: Candle[] }>();
const TTL_MS = 10 * 60_000;

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

/** 리플레이용 CSV 저장 (기존 파일 덮어쓰기) */
export async function writeBitgetFuturesCsv(
  symbol: string,
  timeframe: string,
  candles: Candle[]
): Promise<string | null> {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const tf = tfToFileSuffix(timeframe);
  if (!tf || !candles.length) return null;
  const dir = path.join(process.cwd(), 'data', 'bitget-futures');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${sym}_${tf}.csv`);
  const lines = ['timestamp,datetime,open,high,low,close,volume,quoteVolume'];
  for (const c of candles) {
    const ms = Number(c.time) * 1000;
    const iso = new Date(ms).toISOString();
    lines.push(
      [
        ms,
        iso,
        c.open,
        c.high,
        c.low,
        c.close,
        c.volume ?? 0,
        '',
      ].join(',')
    );
  }
  await fs.writeFile(file, lines.join('\n'), 'utf8');
  cache.set(`${sym}|${tf}`, { at: Date.now(), candles: [...candles].sort((a, b) => a.time - b.time) });
  return file;
}
