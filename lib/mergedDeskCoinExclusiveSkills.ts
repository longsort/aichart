/**
 * 코인 전용 스킬 슬롯 — ON/OFF 저장.
 * 공통 스킬(타점·스윕 등)과 별개. 확정 수익 아님.
 */
import type { AutoTradeCoinKey } from '@/lib/mergedDeskCoinExitProfile';
import { normalizeCoinKey } from '@/lib/mergedDeskCoinExitProfile';

export type CoinExclusiveSkillDef = {
  id: string;
  emoji: string;
  nameKo: string;
  coins: AutoTradeCoinKey[];
  defaultOn: boolean;
  /** 성적부·소스 매칭(선택) */
  match?: RegExp;
  /** 타점 게이트 연동 키 */
  gateKey?: 'htfSweepFilter' | null;
};

const ALL: AutoTradeCoinKey[] = ['BTC', 'ETH', 'BNB', 'XRP', 'SOL'];

/** 코인별 전용(+공통 필터 슬롯) */
export const COIN_EXCLUSIVE_SKILL_DEFS: CoinExclusiveSkillDef[] = [
  {
    id: 'band15Auto',
    emoji: '▣',
    nameKo: '15분밴드자동',
    coins: ALL,
    defaultOn: true,
    match: /15분밴드자동|BAND15_AUTO|INST_BAND_15M|band15Auto/i,
  },
  {
    id: 'btcQuickScalp',
    emoji: '⚡',
    nameKo: 'BTC초단타',
    coins: ['BTC'],
    defaultOn: false,
    match: /QUICK_SCALP|초단타|quick-scalp|qs-auto|SNIPER|스나이퍼|sn-auto/i,
  },
  {
    id: 'htfSweepFilter',
    emoji: '🧭',
    nameKo: '상위스윕필터',
    coins: ALL,
    defaultOn: true,
    match: /상위스윕|htf-sweep|HTF_SWEEP/i,
    gateKey: 'htfSweepFilter',
  },
  {
    id: 'btcRocket',
    emoji: '🚀',
    nameKo: 'BTC로켓',
    coins: ['BTC'],
    defaultOn: false,
    match: /로켓|rocket|btc-rocket/i,
  },
  {
    id: 'ethAutopilot',
    emoji: '🎯',
    nameKo: 'ETH오토파일럿',
    coins: ['ETH'],
    defaultOn: false,
    match: /AUTOPILOT|오토파일럿|AI_AUTOPILOT|ap-eth|SNIPER/i,
  },
  {
    id: 'ethDump',
    emoji: '📉',
    nameKo: 'ETH폭락',
    coins: ['ETH'],
    defaultOn: false,
    match: /폭락|dump|eth-dump/i,
  },
  {
    id: 'bnbPpl',
    emoji: '🔶',
    nameKo: 'BNB·PPL',
    coins: ['BNB'],
    defaultOn: false,
    match: /PPL|bnb-ppl|BNB/i,
  },
  {
    id: 'xrpFour',
    emoji: '✕',
    nameKo: 'XRP4패턴',
    coins: ['XRP'],
    defaultOn: false,
    match: /4전략|4패턴|xrp-4|SWEEP_REVERSAL/i,
  },
  {
    id: 'solFlow',
    emoji: '◎',
    nameKo: 'SOL수급',
    coins: ['SOL'],
    defaultOn: false,
    match: /SOL|수급|flow/i,
  },
];

export type CoinExclusiveSkillState = Record<string, boolean>;
export type CoinExclusiveSkillMap = Partial<
  Record<AutoTradeCoinKey, CoinExclusiveSkillState>
>;

const KEY = 'ailongshort.mergedDesk.coinExclusiveSkills.v1';

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function listExclusiveSkillsForCoin(
  coin: AutoTradeCoinKey
): CoinExclusiveSkillDef[] {
  return COIN_EXCLUSIVE_SKILL_DEFS.filter((d) => d.coins.includes(coin));
}

/** 매매창에 보이는 현재 사용 스킬만 (구 자동스킬 칩 숨김 · 삭제 아님) */
export const TRADE_WINDOW_SKILL_IDS = ['band15Auto'] as const;

export function listTradeWindowExclusiveSkills(
  coin: AutoTradeCoinKey
): CoinExclusiveSkillDef[] {
  return listExclusiveSkillsForCoin(coin).filter((d) =>
    TRADE_WINDOW_SKILL_IDS.includes(d.id as (typeof TRADE_WINDOW_SKILL_IDS)[number])
  );
}

export function defaultExclusiveState(coin: AutoTradeCoinKey): CoinExclusiveSkillState {
  const out: CoinExclusiveSkillState = {};
  for (const d of listExclusiveSkillsForCoin(coin)) {
    out[d.id] = d.defaultOn;
  }
  return out;
}

export function normalizeExclusiveState(
  coin: AutoTradeCoinKey,
  raw: CoinExclusiveSkillState | null | undefined
): CoinExclusiveSkillState {
  const d = defaultExclusiveState(coin);
  if (!raw || typeof raw !== 'object') return d;
  const out: CoinExclusiveSkillState = { ...d };
  for (const def of listExclusiveSkillsForCoin(coin)) {
    if (typeof raw[def.id] === 'boolean') out[def.id] = raw[def.id]!;
  }
  return out;
}

export function readCoinExclusiveSkillMap(): CoinExclusiveSkillMap {
  if (typeof window === 'undefined') return {};
  const raw = safeParse<CoinExclusiveSkillMap>(window.localStorage.getItem(KEY), {});
  const out: CoinExclusiveSkillMap = {};
  for (const c of ALL) {
    out[c] = normalizeExclusiveState(c, raw[c]);
  }
  return out;
}

export function getCoinExclusiveSkills(coin: AutoTradeCoinKey): CoinExclusiveSkillState {
  const map = readCoinExclusiveSkillMap();
  return map[coin] ? normalizeExclusiveState(coin, map[coin]) : defaultExclusiveState(coin);
}

export function isExclusiveSkillOn(
  coin: AutoTradeCoinKey | null,
  skillId: string,
  map?: CoinExclusiveSkillMap | null
): boolean {
  if (!coin) return true;
  const state = map?.[coin]
    ? normalizeExclusiveState(coin, map[coin])
    : typeof window !== 'undefined'
      ? getCoinExclusiveSkills(coin)
      : defaultExclusiveState(coin);
  if (state[skillId] == null) {
    const def = COIN_EXCLUSIVE_SKILL_DEFS.find((d) => d.id === skillId);
    return def?.defaultOn !== false;
  }
  return state[skillId] === true;
}

export function writeCoinExclusiveSkill(
  coin: AutoTradeCoinKey,
  skillId: string,
  on: boolean
): CoinExclusiveSkillState {
  const map = readCoinExclusiveSkillMap();
  const next = normalizeExclusiveState(coin, {
    ...(map[coin] || defaultExclusiveState(coin)),
    [skillId]: on,
  });
  if (typeof window !== 'undefined') {
    map[coin] = next;
    window.localStorage.setItem(KEY, JSON.stringify(map));
  }
  return next;
}

export function writeCoinExclusiveSkillMap(map: CoinExclusiveSkillMap): void {
  if (typeof window === 'undefined') return;
  const out: CoinExclusiveSkillMap = {};
  for (const c of ALL) {
    out[c] = normalizeExclusiveState(c, map[c]);
  }
  window.localStorage.setItem(KEY, JSON.stringify(out));
}

export function mergeExclusiveFromServer(
  serverMap: CoinExclusiveSkillMap
): CoinExclusiveSkillMap {
  const local = readCoinExclusiveSkillMap();
  const out: CoinExclusiveSkillMap = { ...local };
  for (const c of ALL) {
    if (serverMap[c]) out[c] = normalizeExclusiveState(c, serverMap[c]);
  }
  writeCoinExclusiveSkillMap(out);
  return out;
}

export function resolveExclusiveCoin(symbol: string): AutoTradeCoinKey | null {
  return normalizeCoinKey(symbol);
}

/** 소스·signalKo가 전용 스킬에 매칭되면 그 id (없으면 null) */
export function matchExclusiveSkillId(
  coin: AutoTradeCoinKey,
  blob: string
): string | null {
  for (const d of listExclusiveSkillsForCoin(coin)) {
    if (d.id === 'htfSweepFilter') continue;
    if (d.match && d.match.test(blob)) return d.id;
  }
  return null;
}

export function exclusiveSkillsHeldKo(
  coin: AutoTradeCoinKey,
  state?: CoinExclusiveSkillState
): string {
  const st = state || defaultExclusiveState(coin);
  return listExclusiveSkillsForCoin(coin)
    .filter((d) => st[d.id] !== false)
    .map((d) => `${d.emoji}${d.nameKo}`)
    .join(' · ');
}
