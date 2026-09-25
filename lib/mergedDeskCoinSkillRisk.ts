/**
 * 스킬창 코인별 레버·비중·TP/SL (ROE%) 저장.
 * 자동매매(타점)가 이 세팅을 따름. 확정 수익 아님.
 */
import type { AutoTradeCoinKey } from '@/lib/mergedDeskCoinExitProfile';
import { normalizeCoinKey } from '@/lib/mergedDeskCoinExitProfile';
import { resolveTapointSymbolLevTp } from '@/lib/eagle1Tapoint/symbolLevTp';
import { resolveTapointSlRoePct } from '@/lib/eagle1Tapoint/slRoeByTf';
import { resolveTapointEntryTf } from '@/lib/eagle1Tapoint/symbolEntryTf';

export type CoinSkillRisk = {
  coin: AutoTradeCoinKey;
  /** 최대 레버 (구조SL에 맞게 하향 가능) */
  leverage: number;
  /** 계좌 대비 증거금 비중% */
  equityPct: number;
  /** 익절1 목표 ROE% */
  tp1RoePct: number;
  /** 손절 상한 ROE% (구조SL 클램프) */
  slRoePct: number;
  updatedAt: number;
};

export type CoinSkillRiskMap = Partial<Record<AutoTradeCoinKey, CoinSkillRisk>>;

const KEY = 'ailongshort.mergedDesk.coinSkillRisk.v1';
const COINS: AutoTradeCoinKey[] = ['BTC', 'ETH', 'BNB', 'XRP', 'SOL'];

function clampLev(n: number): number {
  return Math.max(1, Math.min(125, Math.round(Number(n) || 10)));
}

function clampPct(n: number, min = 0.5, max = 100): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v * 100) / 100));
}

function clampRoe(n: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.max(0.5, Math.min(80, Math.round(v * 10) / 10));
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 코드 기본값 — 기존 타점 레버·TP + TF손절 + 비중 5% */
export function defaultCoinSkillRisk(coin: AutoTradeCoinKey): CoinSkillRisk {
  const sym = `${coin}USDT`;
  const levTp = resolveTapointSymbolLevTp(sym);
  const tf = resolveTapointEntryTf(sym);
  return {
    coin,
    leverage: levTp.leverage,
    equityPct: 5,
    tp1RoePct: levTp.tp1RoePct,
    slRoePct: resolveTapointSlRoePct(tf),
    updatedAt: 0,
  };
}

export function normalizeCoinSkillRisk(
  coin: AutoTradeCoinKey,
  raw: Partial<CoinSkillRisk> | null | undefined
): CoinSkillRisk {
  const d = defaultCoinSkillRisk(coin);
  if (!raw || typeof raw !== 'object') return d;
  return {
    coin,
    leverage: clampLev(raw.leverage ?? d.leverage),
    equityPct: clampPct(raw.equityPct ?? d.equityPct),
    tp1RoePct: (() => {
      const v = clampRoe(raw.tp1RoePct ?? d.tp1RoePct, d.tp1RoePct);
      return Math.round(v) === 15 ? 8 : v;
    })(),
    slRoePct: clampRoe(raw.slRoePct ?? d.slRoePct, d.slRoePct),
    updatedAt: Number(raw.updatedAt) > 0 ? Number(raw.updatedAt) : d.updatedAt,
  };
}

export function readCoinSkillRiskMap(): CoinSkillRiskMap {
  if (typeof window === 'undefined') return {};
  const raw = safeParse<CoinSkillRiskMap>(window.localStorage.getItem(KEY), {});
  const out: CoinSkillRiskMap = {};
  for (const c of COINS) {
    if (raw[c]) out[c] = normalizeCoinSkillRisk(c, raw[c]);
  }
  return out;
}

export function getCoinSkillRisk(coin: AutoTradeCoinKey): CoinSkillRisk {
  const map = readCoinSkillRiskMap();
  return map[coin] ? normalizeCoinSkillRisk(coin, map[coin]) : defaultCoinSkillRisk(coin);
}

export function writeCoinSkillRisk(profile: CoinSkillRisk): CoinSkillRisk {
  const next = normalizeCoinSkillRisk(profile.coin, {
    ...profile,
    updatedAt: Date.now(),
  });
  if (typeof window !== 'undefined') {
    const map = readCoinSkillRiskMap();
    map[next.coin] = next;
    window.localStorage.setItem(KEY, JSON.stringify(map));
  }
  return next;
}

export function writeCoinSkillRiskMap(map: CoinSkillRiskMap): void {
  if (typeof window === 'undefined') return;
  const out: CoinSkillRiskMap = {};
  for (const c of COINS) {
    if (map[c]) out[c] = normalizeCoinSkillRisk(c, map[c]);
  }
  window.localStorage.setItem(KEY, JSON.stringify(out));
}

/** 심볼 → 적용 리스크 (저장 없으면 기본) */
export function resolveCoinSkillRiskForSymbol(
  symbol: string,
  serverMap?: CoinSkillRiskMap | null
): CoinSkillRisk {
  const coin = normalizeCoinKey(symbol);
  if (!coin) {
    const levTp = resolveTapointSymbolLevTp(symbol);
    return {
      coin: 'BTC',
      leverage: levTp.leverage,
      equityPct: 5,
      tp1RoePct: levTp.tp1RoePct,
      slRoePct: resolveTapointSlRoePct(resolveTapointEntryTf(symbol)),
      updatedAt: 0,
    };
  }
  if (serverMap?.[coin]) return normalizeCoinSkillRisk(coin, serverMap[coin]);
  if (typeof window !== 'undefined') return getCoinSkillRisk(coin);
  return defaultCoinSkillRisk(coin);
}

export function coinSkillRiskLabelKo(r: CoinSkillRisk): string {
  return `${r.leverage}x · 비중${r.equityPct}% · TP${r.tp1RoePct}% · SL${r.slRoePct}%ROE`;
}

export function listCoinSkillRiskCoins(): AutoTradeCoinKey[] {
  return [...COINS];
}

/** 서버 응답 → 로컬 병합 (서버가 더 최신이면 덮어씀) */
export function mergeCoinSkillRiskFromServer(serverMap: CoinSkillRiskMap): CoinSkillRiskMap {
  const local = readCoinSkillRiskMap();
  const out: CoinSkillRiskMap = { ...local };
  for (const c of COINS) {
    const s = serverMap[c];
    if (!s) continue;
    const L = local[c];
    if (!L || (Number(s.updatedAt) || 0) >= (Number(L.updatedAt) || 0)) {
      out[c] = normalizeCoinSkillRisk(c, s);
    }
  }
  writeCoinSkillRiskMap(out);
  return out;
}
