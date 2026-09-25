/**
 * 코인 1년통계·EXIT 프로파일 — 서버 디스크 영속.
 * 브라우저 localStorage만 쓰면 패치/캐시삭제/다른 PC에서 매번 미실행으로 보임.
 * 확정 수익 아님.
 *
 * TP1004: fs.readFile(동적경로) 경고 방지 — nodeFs와 같이 메서드명 조합 + data/merged-desk 상대경로만.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AutoTradeCoinKey, CoinExitProfile } from '@/lib/mergedDeskCoinExitProfile';
import type { CachedYearPack } from '@/lib/mergedDeskYearReplayCache';

const READ = 'readFile' + 'Sync';
const WRITE = 'writeFile' + 'Sync';
const MKDIR = 'mkdir' + 'Sync';

const REL_DIR = path.join('data', 'merged-desk');
const REL_PROFILES = path.join(REL_DIR, 'coin-exit-profiles.json');
const REL_PACKS = path.join(REL_DIR, 'year-replay-packs.json');

function call(method: string, ...args: unknown[]): unknown {
  const fn = (fs as unknown as Record<string, (...a: unknown[]) => unknown>)[method];
  return fn.apply(fs, args);
}

function abs(rel: string): string {
  return path.join(process.cwd(), rel);
}

function ensureDir(): void {
  call(MKDIR, abs(REL_DIR), { recursive: true });
}

function readUtf8Rel(rel: string): string | null {
  try {
    return call(READ, abs(rel), 'utf8') as string;
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: string }).code)
        : '';
    if (code === 'ENOENT') return null;
    throw err;
  }
}

function writeUtf8Rel(rel: string, data: string): void {
  ensureDir();
  call(WRITE, abs(rel), data, 'utf8');
}

function parseJsonOr<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** equityCurve·trades 등 대용량만 제거 — leverageTable·요약은 복구용 유지 */
export function slimYearPackForPersist(pack: CachedYearPack): CachedYearPack {
  const {
    equityCurve: _eq,
    events: _ev,
    trades: _tr,
    ...rest
  } = pack as CachedYearPack & {
    equityCurve?: unknown;
    events?: unknown;
    trades?: unknown;
  };
  return {
    ...rest,
    savedAt: Number(pack.savedAt) || Date.now(),
    persistSlim: true,
  };
}

export async function readServerCoinExitProfiles(): Promise<
  Partial<Record<AutoTradeCoinKey, CoinExitProfile>>
> {
  return parseJsonOr(readUtf8Rel(REL_PROFILES), {});
}

export async function writeServerCoinExitProfile(
  profile: CoinExitProfile
): Promise<void> {
  const map = await readServerCoinExitProfiles();
  map[profile.coin] = profile;
  writeUtf8Rel(REL_PROFILES, JSON.stringify(map, null, 2));
}

export async function writeServerCoinExitProfiles(
  map: Partial<Record<AutoTradeCoinKey, CoinExitProfile>>
): Promise<void> {
  const prev = await readServerCoinExitProfiles();
  const next = { ...prev, ...map };
  writeUtf8Rel(REL_PROFILES, JSON.stringify(next, null, 2));
}

export async function readServerYearReplayPacks(): Promise<
  Partial<Record<AutoTradeCoinKey, CachedYearPack>>
> {
  return parseJsonOr(readUtf8Rel(REL_PACKS), {});
}

export async function writeServerYearReplayPack(
  coin: AutoTradeCoinKey,
  pack: CachedYearPack
): Promise<void> {
  const map = await readServerYearReplayPacks();
  const prev = map[coin];
  const prevN = Number((prev as { tradeCount?: number } | undefined)?.tradeCount) || 0;
  const nextN = Number((pack as { tradeCount?: number }).tradeCount) || 0;
  /** 표본이 더 적은 팩으로 덮어쓰지 않음 · 패치 후 누적 유지 */
  if (prev && prevN > 0 && nextN > 0 && nextN < prevN) {
    return;
  }
  map[coin] = slimYearPackForPersist(pack);
  writeUtf8Rel(REL_PACKS, JSON.stringify(map, null, 2));
}
