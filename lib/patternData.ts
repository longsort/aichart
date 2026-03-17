import type { Pattern } from '@/types/reference';
import path from 'path';
import fs from 'fs';

let cached: Pattern[] | null = null;

/**
 * 서버 전용. data/patterns.json에서 학습된 패턴 목록 로드
 */
export function getLearnedPatterns(): Pattern[] {
  if (cached) return cached;
  try {
    const filePath = path.join(process.cwd(), 'data', 'patterns.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    cached = JSON.parse(raw) as Pattern[];
    return cached;
  } catch {
    cached = [];
    return [];
  }
}
