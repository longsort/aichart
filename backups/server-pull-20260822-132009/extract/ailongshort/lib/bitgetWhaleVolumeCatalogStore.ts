import fs from 'fs/promises';
import path from 'path';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { BitgetWhaleVolumeCatalog } from '@/lib/bitgetWhaleVolumeCatalog';

const DIR = path.join(process.cwd(), 'data', 'bitget-whale-catalog');
const mem = new Map<string, { at: number; file: BitgetWhaleVolumeCatalog }>();
const TTL_MS = 120_000;

function fileToken(timeframe: string): string {
  const n = normalizeChartTimeframe(timeframe);
  const map: Record<string, string> = {
    '15m': '15m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
  };
  return map[n] ?? n.replace(/[/\\]/g, '');
}

function cacheKey(symbol: string, timeframe: string): string {
  return `${String(symbol).toUpperCase()}|${normalizeChartTimeframe(timeframe)}`;
}

function filePath(symbol: string, timeframe: string): string {
  return path.join(DIR, `${String(symbol).toUpperCase()}_${fileToken(timeframe)}.json`);
}

export async function readBitgetWhaleVolumeCatalog(
  symbol: string,
  timeframe: string
): Promise<BitgetWhaleVolumeCatalog | null> {
  const key = cacheKey(symbol, timeframe);
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.file;

  try {
    const raw = await fs.readFile(filePath(symbol, timeframe), 'utf8');
    const parsed = JSON.parse(raw) as BitgetWhaleVolumeCatalog;
    if (parsed?.version !== 1 || !Array.isArray(parsed.buckets)) return null;
    mem.set(key, { at: Date.now(), file: parsed });
    return parsed;
  } catch {
    return null;
  }
}

export async function writeBitgetWhaleVolumeCatalog(file: BitgetWhaleVolumeCatalog): Promise<string> {
  await fs.mkdir(DIR, { recursive: true });
  const fp = filePath(file.symbol, file.timeframe);
  await fs.writeFile(fp, JSON.stringify(file), 'utf8');
  mem.set(cacheKey(file.symbol, file.timeframe), { at: Date.now(), file });
  return fp;
}

export function bitgetWhaleCatalogPath(symbol: string, timeframe: string): string {
  return filePath(symbol, timeframe);
}
