/**
 * 코인 전용 스킬 ON/OFF — 서버 사용자별 영속.
 */
import fs from 'fs';
import path from 'path';
import type { AutoTradeCoinKey } from '@/lib/mergedDeskCoinExitProfile';
import {
  normalizeExclusiveState,
  type CoinExclusiveSkillMap,
  type CoinExclusiveSkillState,
} from '@/lib/mergedDeskCoinExclusiveSkills';

const DIR = path.join(process.cwd(), 'data', 'merged-desk', 'coin-exclusive-skills');
const COINS: AutoTradeCoinKey[] = ['BTC', 'ETH', 'BNB', 'XRP', 'SOL'];

function safeUser(user: string): string {
  return String(user || 'anon').replace(/[^\w.-]/g, '_').slice(0, 64) || 'anon';
}

function fileOf(user: string): string {
  return path.join(DIR, `${safeUser(user)}.json`);
}

function ensureDir(): void {
  try {
    fs.mkdirSync(DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

export function readServerExclusiveSkillMap(user: string): CoinExclusiveSkillMap {
  try {
    const raw = fs.readFileSync(fileOf(user), 'utf8');
    const j = JSON.parse(raw) as CoinExclusiveSkillMap;
    const out: CoinExclusiveSkillMap = {};
    for (const c of COINS) {
      if (j?.[c]) out[c] = normalizeExclusiveState(c, j[c]);
    }
    return out;
  } catch {
    return {};
  }
}

export function writeServerExclusiveSkills(
  user: string,
  coin: AutoTradeCoinKey,
  state: CoinExclusiveSkillState
): CoinExclusiveSkillState {
  ensureDir();
  const map = readServerExclusiveSkillMap(user);
  const next = normalizeExclusiveState(coin, state);
  map[coin] = next;
  fs.writeFileSync(fileOf(user), JSON.stringify(map, null, 2), 'utf8');
  return next;
}

export function writeServerExclusiveSkillMap(
  user: string,
  map: CoinExclusiveSkillMap
): CoinExclusiveSkillMap {
  ensureDir();
  const out: CoinExclusiveSkillMap = {};
  for (const c of COINS) {
    if (map[c]) out[c] = normalizeExclusiveState(c, map[c]);
  }
  fs.writeFileSync(fileOf(user), JSON.stringify(out, null, 2), 'utf8');
  return out;
}
