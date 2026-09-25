/**
 * Eagle1 StorageManager — 서버 약 50GB 한도.
 * core OHLCV / snapshots / statistics / prediction / outcome 은 삭제하지 않는다.
 */
import fs from 'fs';
import path from 'path';

export const EAGLE1_STORAGE_LIMIT_BYTES = 50 * 1024 * 1024 * 1024;
export const EAGLE1_STORAGE_WARN_RATIO = 0.8;
export const EAGLE1_STORAGE_EMERGENCY_RATIO = 0.9;

export type Eagle1StorageTier = 'ok' | 'cleanup' | 'emergency';

export type Eagle1StorageReport = {
  root: string;
  used_bytes: number;
  limit_bytes: number;
  used_ratio: number;
  tier: Eagle1StorageTier;
  by_dir: { dir: string; bytes: number }[];
  preserve: string[];
  cleanup_candidates: string[];
  calculated_at: number;
};

const PRESERVE = [
  'data/bitget-futures',
  'data/eagle1',
  'data/confirmed-signals',
  'data/mtf-statistics-history',
];

const CLEANUP_FIRST = [
  'data/tmp',
  'playwright-report',
  'test-results',
  '.next/cache',
];

function dirSizeBytes(abs: string, depth = 0): number {
  if (depth > 12 || !fs.existsSync(abs)) return 0;
  let n = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(abs, e.name);
    try {
      if (e.isDirectory()) n += dirSizeBytes(p, depth + 1);
      else n += fs.statSync(p).size;
    } catch {
      /* skip */
    }
  }
  return n;
}

export function inspectEagle1Storage(root = process.cwd()): Eagle1StorageReport {
  const watch = [
    'data',
    'data/bitget-futures',
    'data/eagle1',
    'data/bitget-whale-catalog',
    'data/whale-memory',
    'data/pre3-memory',
    '.next',
    'playwright-report',
  ];
  const by_dir: { dir: string; bytes: number }[] = [];
  for (const d of watch) {
    const abs = path.join(root, d);
    by_dir.push({ dir: d, bytes: dirSizeBytes(abs) });
  }
  /** 하위 폴더를 중복 합산하지 않음 */
  const used =
    dirSizeBytes(path.join(root, 'data')) +
    dirSizeBytes(path.join(root, '.next')) +
    dirSizeBytes(path.join(root, 'playwright-report'));
  const used_ratio = used / EAGLE1_STORAGE_LIMIT_BYTES;
  const tier: Eagle1StorageTier =
    used_ratio >= EAGLE1_STORAGE_EMERGENCY_RATIO
      ? 'emergency'
      : used_ratio >= EAGLE1_STORAGE_WARN_RATIO
        ? 'cleanup'
        : 'ok';

  const cleanup_candidates = CLEANUP_FIRST.filter((d) => fs.existsSync(path.join(root, d)));

  return {
    root,
    used_bytes: used,
    limit_bytes: EAGLE1_STORAGE_LIMIT_BYTES,
    used_ratio,
    tier,
    by_dir,
    preserve: [...PRESERVE],
    cleanup_candidates,
    calculated_at: Date.now(),
  };
}

/** 실제 삭제는 호출자가 명시할 때만. 기본은 보고만. */
export function listEmergencyCleanupPaths(root = process.cwd()): string[] {
  return CLEANUP_FIRST.map((d) => path.join(root, d)).filter((p) => fs.existsSync(p));
}
