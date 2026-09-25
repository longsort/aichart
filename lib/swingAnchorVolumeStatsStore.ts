import fs from 'fs/promises';
import path from 'path';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { SwingAnchorVolumeStatsFile } from '@/lib/mergedDeskSwingAnchorVolumeStats';
import { volumePhaseStatsFileToken } from '@/lib/volumePhaseStatsStore';

const DIR = path.join(process.cwd(), 'data', 'swing-anchor-volume-stats');
const mem = new Map<string, { at: number; file: SwingAnchorVolumeStatsFile }>();
const TTL_MS = 90_000;

function cacheKey(symbol: string, timeframe: string): string {
  return `${String(symbol).toUpperCase()}|${normalizeChartTimeframe(timeframe)}`;
}

function filePath(symbol: string, timeframe: string): string {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const token = volumePhaseStatsFileToken(timeframe);
  return path.join(DIR, `${sym}_${token}.json`);
}

export async function readSwingAnchorVolumeStats(
  symbol: string,
  timeframe: string
): Promise<SwingAnchorVolumeStatsFile | null> {
  const key = cacheKey(symbol, timeframe);
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.file;

  try {
    const raw = await fs.readFile(filePath(symbol, timeframe), 'utf8');
    const parsed = JSON.parse(raw) as SwingAnchorVolumeStatsFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.buckets)) return null;
    mem.set(key, { at: Date.now(), file: parsed });
    return parsed;
  } catch {
    return null;
  }
}

export async function writeSwingAnchorVolumeStats(
  file: SwingAnchorVolumeStatsFile
): Promise<string> {
  await fs.mkdir(DIR, { recursive: true });
  const fp = filePath(file.symbol, file.timeframe);
  await fs.writeFile(fp, JSON.stringify(file, null, 0), 'utf8');
  mem.set(cacheKey(file.symbol, file.timeframe), { at: Date.now(), file });
  return fp;
}
