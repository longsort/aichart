import { ensureDir, readJsonFile, writeJsonFile } from '@/lib/nodeJsonFs';

function safeFilename(clientId: string): string {
  return clientId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'default';
}

function memoryFileName(clientId: string): string {
  return `${safeFilename(clientId)}.json`;
}

function readMemoryJson<T>(clientId: string, fallback: T): T {
  return readJsonFile<T>('briefing-memory', memoryFileName(clientId), fallback);
}

function writeMemoryJson(clientId: string, data: unknown): boolean {
  ensureDir('briefing-memory');
  return writeJsonFile('briefing-memory', memoryFileName(clientId), data);
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

export function appendBriefingMemory(clientId: string, record: BriefingMemoryRecord): boolean {
  const list = readMemoryJson<BriefingMemoryRecord[]>(clientId, []);
  list.push(record);
  const trimmed = list.slice(-3000);
  return writeMemoryJson(clientId, trimmed);
}

export function findSimilarBriefingMemory(
  clientId: string,
  symbol: string,
  timeframe: string,
  fingerprint: BriefingFingerprint
): (BriefingMemoryRecord & { similarity: number }) | null {
  const list = readMemoryJson<BriefingMemoryRecord[]>(clientId, []);
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
