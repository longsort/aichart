import path from 'path';
import fs from 'fs';
import type { PatternReference } from '@/types/pattern';

const DATA_DIR = path.join(process.cwd(), 'data');
const PATTERNS_FILE = path.join(DATA_DIR, 'patterns.json');

let cached: PatternReference[] | null = null;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadRaw(): string {
  ensureDataDir();
  if (!fs.existsSync(PATTERNS_FILE)) return '[]';
  try {
    return fs.readFileSync(PATTERNS_FILE, 'utf-8');
  } catch {
    return '[]';
  }
}

export function loadPatterns(): PatternReference[] {
  if (cached) return cached;
  try {
    const raw = loadRaw();
    const parsed = JSON.parse(raw || '[]');
    cached = Array.isArray(parsed) ? parsed : [];
    return cached;
  } catch {
    cached = [];
    return [];
  }
}

export function savePatterns(patterns: PatternReference[]): boolean {
  try {
    ensureDataDir();
    fs.writeFileSync(PATTERNS_FILE, JSON.stringify(patterns, null, 2), 'utf-8');
    cached = patterns;
    return true;
  } catch {
    return false;
  }
}

export function addPattern(item: Omit<PatternReference, 'id' | 'createdAt'>): PatternReference {
  const patterns = loadPatterns();
  const id = `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const created: PatternReference = {
    ...item,
    id,
    createdAt: new Date().toISOString(),
  };
  patterns.push(created);
  savePatterns(patterns);
  return created;
}

export function ensureUniqueId(id: string, patterns: PatternReference[]): string {
  const exists = patterns.some(p => p.id === id);
  if (!exists) return id;
  return `${id}_${Date.now()}`;
}

export function invalidateCache(): void {
  cached = null;
}
