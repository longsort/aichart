import fs from 'fs';
import path from 'path';

export type WhaleMemoryZoneRow = {
  id: string;
  label: string;
  time1: number;
  time2: number;
  price1: number;
  price2: number;
  confidence?: number;
  color?: string;
};

export type WhaleMemoryFile = {
  symbol: string;
  timeframe: string;
  generatedAt: number;
  zones: WhaleMemoryZoneRow[];
};

function fp(symbol: string, timeframe: string): string {
  return path.join(process.cwd(), 'data', 'whale-memory', `${symbol.toUpperCase()}_${timeframe}.json`);
}

export function loadWhaleMemory(symbol: string, timeframe: string): WhaleMemoryFile | null {
  try {
    const p = fp(symbol, timeframe);
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw) as WhaleMemoryFile;
    if (!j || !Array.isArray(j.zones)) return null;
    return j;
  } catch {
    return null;
  }
}

