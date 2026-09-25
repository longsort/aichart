import fs from 'fs/promises';
import path from 'path';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { AmzStatsFile } from './statsTypes';
import { volumePhaseStatsFileToken } from '@/lib/volumePhaseStatsStore';

const DIR = path.join(process.cwd(), 'data', 'ai-market-zone-stats');
const mem = new Map<string, { at: number; file: AmzStatsFile }>();
const TTL_MS = 120_000;

function cacheKey(symbol: string, timeframe: string): string {
  return `${String(symbol).toUpperCase()}|${normalizeChartTimeframe(timeframe)}`;
}

function filePath(symbol: string, timeframe: string): string {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const token = volumePhaseStatsFileToken(timeframe);
  return path.join(DIR, `${sym}_${token}.json`);
}

export async function readAmzStats(
  symbol: string,
  timeframe: string
): Promise<AmzStatsFile | null> {
  const key = cacheKey(symbol, timeframe);
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.file;
  try {
    const raw = await fs.readFile(filePath(symbol, timeframe), 'utf8');
    const parsed = JSON.parse(raw) as AmzStatsFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.byKind)) return null;
    if (!Array.isArray(parsed.mlCases)) parsed.mlCases = [];
    mem.set(key, { at: Date.now(), file: parsed });
    return parsed;
  } catch {
    return null;
  }
}

export async function writeAmzStats(file: AmzStatsFile): Promise<string> {
  await fs.mkdir(DIR, { recursive: true });
  const fp = filePath(file.symbol, file.timeframe);
  await fs.writeFile(fp, JSON.stringify(file, null, 0), 'utf8');
  mem.set(cacheKey(file.symbol, file.timeframe), { at: Date.now(), file });
  return fp;
}
