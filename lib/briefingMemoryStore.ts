import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const MEMORY_DIR = path.join(DATA_DIR, 'briefing-memory');

function ensureDir(dir: string): boolean {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function safeFilename(clientId: string): string {
  return clientId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'default';
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return (JSON.parse(raw || 'null') as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, data: unknown): boolean {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export type BriefingFingerprint = {
  regime: string;
  verdict: 'LONG' | 'SHORT' | 'WATCH';
  confidenceBand: number;
  patternText: string;
  topPattern: string;
  bosBucket: number;
  chochBucket: number;
  fvgBucket: number;
  sweepBucket: number;
  longBand: number;
  shortBand: number;
};

export type BriefingMemoryRecord = {
  symbol: string;
  timeframe: string;
  at: number;
  fingerprint: BriefingFingerprint;
  summary: string;
  entry: number;
  stop: number;
  target1: number;
  direction: 'LONG' | 'SHORT' | 'WATCH';
  wavePath?: { preAnchor: number; w1: number; w2: number; w3: number; useShort: boolean; tag: string; confidence: number };
};

function toBand(n: number, step: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n / step) * step;
}

function normalizeText(t: string): string {
  return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function buildBriefingFingerprint(input: {
  regime?: string;
  verdict?: 'LONG' | 'SHORT' | 'WATCH';
  confidence?: number;
  patternText?: string;
  topPattern?: string;
  bosCount?: number;
  chochCount?: number;
  fvgCount?: number;
  sweepCount?: number;
  longScore?: number;
  shortScore?: number;
}): BriefingFingerprint {
  return {
    regime: String(input.regime ?? 'unknown'),
    verdict: input.verdict ?? 'WATCH',
    confidenceBand: toBand(Number(input.confidence ?? 50), 5),
    patternText: normalizeText(input.patternText ?? ''),
    topPattern: normalizeText(input.topPattern ?? ''),
    bosBucket: toBand(Number(input.bosCount ?? 0), 5),
    chochBucket: toBand(Number(input.chochCount ?? 0), 5),
    fvgBucket: toBand(Number(input.fvgCount ?? 0), 10),
    sweepBucket: toBand(Number(input.sweepCount ?? 0), 2),
    longBand: toBand(Number(input.longScore ?? 0), 5),
    shortBand: toBand(Number(input.shortScore ?? 0), 5),
  };
}

function scoreSimilarity(a: BriefingFingerprint, b: BriefingFingerprint): number {
  let score = 0;
  if (a.regime === b.regime) score += 12;
  if (a.verdict === b.verdict) score += 14;
  score += Math.max(0, 10 - Math.abs(a.confidenceBand - b.confidenceBand) / 2);
  score += Math.max(0, 10 - Math.abs(a.bosBucket - b.bosBucket));
  score += Math.max(0, 10 - Math.abs(a.chochBucket - b.chochBucket));
  score += Math.max(0, 8 - Math.abs(a.fvgBucket - b.fvgBucket) / 2);
  score += Math.max(0, 8 - Math.abs(a.sweepBucket - b.sweepBucket));
  score += Math.max(0, 8 - Math.abs(a.longBand - b.longBand) / 2);
  score += Math.max(0, 8 - Math.abs(a.shortBand - b.shortBand) / 2);
  if (a.topPattern && b.topPattern && (a.topPattern.includes(b.topPattern) || b.topPattern.includes(a.topPattern))) score += 12;
  if (a.patternText && b.patternText && (a.patternText.includes(b.topPattern) || b.patternText.includes(a.topPattern))) score += 10;
  return Math.round(Math.max(0, Math.min(100, score)));
}

function filePathFor(clientId: string): string {
  return path.join(MEMORY_DIR, `${safeFilename(clientId)}.json`);
}

export function appendBriefingMemory(clientId: string, record: BriefingMemoryRecord): boolean {
  const fp = filePathFor(clientId);
  const list = readJsonFile<BriefingMemoryRecord[]>(fp, []);
  list.push(record);
  const trimmed = list.slice(-3000);
  return writeJsonFile(fp, trimmed);
}

export function findSimilarBriefingMemory(
  clientId: string,
  symbol: string,
  timeframe: string,
  fingerprint: BriefingFingerprint
): (BriefingMemoryRecord & { similarity: number }) | null {
  const fp = filePathFor(clientId);
  const list = readJsonFile<BriefingMemoryRecord[]>(fp, []);
  if (!Array.isArray(list) || list.length === 0) return null;
  let best: (BriefingMemoryRecord & { similarity: number }) | null = null;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const r = list[i];
    if (!r || r.symbol !== symbol || r.timeframe !== timeframe || !r.fingerprint) continue;
    const s = scoreSimilarity(fingerprint, r.fingerprint);
    if (!best || s > best.similarity) best = { ...r, similarity: s };
    if (s >= 97) break;
  }
  return best;
}

