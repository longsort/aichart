/**
 * 스킬창 코인별 리스크 — 서버 사용자별 영속.
 * 서버 타점 자동매매가 읽음. 확정 수익 아님.
 */
import fs from 'fs';
import path from 'path';
import type { AutoTradeCoinKey } from '@/lib/mergedDeskCoinExitProfile';
import {
  normalizeCoinSkillRisk,
  type CoinSkillRisk,
  type CoinSkillRiskMap,
} from '@/lib/mergedDeskCoinSkillRisk';

const DIR = path.join(process.cwd(), 'data', 'merged-desk', 'coin-skill-risk');
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

export function readServerCoinSkillRiskMap(user: string): CoinSkillRiskMap {
  try {
    const raw = fs.readFileSync(fileOf(user), 'utf8');
    const j = JSON.parse(raw) as CoinSkillRiskMap;
    const out: CoinSkillRiskMap = {};
    for (const c of COINS) {
      if (j?.[c]) out[c] = normalizeCoinSkillRisk(c, j[c]);
    }
    return out;
  } catch {
    return {};
  }
}

export function writeServerCoinSkillRisk(
  user: string,
  profile: CoinSkillRisk
): CoinSkillRisk {
  ensureDir();
  const map = readServerCoinSkillRiskMap(user);
  const next = normalizeCoinSkillRisk(profile.coin, {
    ...profile,
    updatedAt: Date.now(),
  });
  map[next.coin] = next;
  fs.writeFileSync(fileOf(user), JSON.stringify(map, null, 2), 'utf8');
  return next;
}

export function writeServerCoinSkillRiskMap(
  user: string,
  map: CoinSkillRiskMap
): CoinSkillRiskMap {
  ensureDir();
  const out: CoinSkillRiskMap = {};
  for (const c of COINS) {
    if (map[c]) out[c] = normalizeCoinSkillRisk(c, { ...map[c], updatedAt: Date.now() });
  }
  fs.writeFileSync(fileOf(user), JSON.stringify(out, null, 2), 'utf8');
  return out;
}

export function getServerCoinSkillRisk(
  user: string,
  coin: AutoTradeCoinKey
): CoinSkillRisk | null {
  const map = readServerCoinSkillRiskMap(user);
  return map[coin] ? normalizeCoinSkillRisk(coin, map[coin]) : null;
}
