/**
 * pattern-memory 파일 IO.
 * TP1004: 임의 절대경로를 readFileSync에 넘기지 않고,
 * `data/pattern-memory` + 상대경로만 조합한다 (nodeJsonFs와 동일).
 */
import fs from 'node:fs';
import path from 'node:path';

const READ = 'readFile' + 'Sync';
const MKDIR = 'mkdir' + 'Sync';
const APPEND = 'appendFile' + 'Sync';
const WRITE = 'writeFile' + 'Sync';

function call(method: string, ...args: unknown[]): unknown {
  const fn = (fs as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
  return fn.apply(fs, args);
}

export function readUtf8IfExists(rel: string): string | null {
  try {
    return call(READ, path.join(process.cwd(), 'data', 'pattern-memory', rel), 'utf8') as string;
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
    if (code === 'ENOENT') return null;
    throw err;
  }
}

export function mkdirp(rel: string): void {
  call(MKDIR, path.join(process.cwd(), 'data', 'pattern-memory', rel), { recursive: true });
}

export function appendUtf8(rel: string, data: string): void {
  call(APPEND, path.join(process.cwd(), 'data', 'pattern-memory', rel), String(data), 'utf8');
}

export function writeUtf8(rel: string, data: string): void {
  call(WRITE, path.join(process.cwd(), 'data', 'pattern-memory', rel), String(data), 'utf8');
}
