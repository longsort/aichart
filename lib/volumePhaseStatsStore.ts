import fs from 'fs/promises';
import path from 'path';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { VolumePhaseStatsFile } from '@/lib/volumePhaseStats';

const DIR = path.join(process.cwd(), 'data', 'volume-phase-stats');
const mem = new Map<string, { at: number; file: VolumePhaseStatsFile }>();
const TTL_MS = 60_000;

/** Windows 등에서 1m vs 1M 파일명 충돌 방지 */
export function volumePhaseStatsFileToken(timeframe: string): string {
  const n = normalizeChartTimeframe(timeframe);
  const map: Record<string, string> = {
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
    '1w': '1w',
    '1M': '1Mo',
    '1Y': '1Y',
  };
  return map[n] ?? n.replace(/[/\\]/g, '');
}

function cacheKey(symbol: string, timeframe: string): string {
  return `${String(symbol).toUpperCase()}|${normalizeChartTimeframe(timeframe)}`;
}

function filePath(symbol: string, timeframe: string): string {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const token = volumePhaseStatsFileToken(timeframe);
  return path.join(DIR, `${sym}_${token}.json`);
}

export async function readVolumePhaseStats(
  symbol: string,
  timeframe: string
): Promise<VolumePhaseStatsFile | null> {
  const key = cacheKey(symbol, timeframe);
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.file;

  try {
    const raw = await fs.readFile(filePath(symbol, timeframe), 'utf8');
    const parsed = JSON.parse(raw) as VolumePhaseStatsFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.keys)) return null;
    mem.set(key, { at: Date.now(), file: parsed });
    return parsed;
  } catch {
    return null;
  }
}

export async function writeVolumePhaseStats(file: VolumePhaseStatsFile): Promise<string> {
  await fs.mkdir(DIR, { recursive: true });
  const fp = filePath(file.symbol, file.timeframe);
  await fs.writeFile(fp, JSON.stringify(file, null, 0), 'utf8');
  mem.set(cacheKey(file.symbol, file.timeframe), { at: Date.now(), file });
  return fp;
}

export function volumePhaseStatsPath(symbol: string, timeframe: string): string {
  return filePath(symbol, timeframe);
}
