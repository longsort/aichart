/**
 * 코인 통계 · 로컬↔서버 동기 (클라이언트).
 * 1회 실행 후 서버에 남기고, 재접속 시 복구 · 재다운 불필요.
 */
import {
  writeCoinExitProfile,
  getCoinExitProfile,
  buildExitFromStats,
  type AutoTradeCoinKey,
  type CoinExitProfile,
} from '@/lib/mergedDeskCoinExitProfile';
import {
  readYearReplayPack,
  writeYearReplayPack,
  type CachedYearPack,
} from '@/lib/mergedDeskYearReplayCache';

const COINS: AutoTradeCoinKey[] = ['BTC', 'ETH', 'BNB', 'XRP', 'SOL'];

/** localStorage 쿼터 방지 — 대용량만 제거 (leverageTable·요약은 유지) */
export function slimYearPackClient(pack: CachedYearPack): CachedYearPack {
  const p = { ...pack } as CachedYearPack & {
    equityCurve?: unknown;
    events?: unknown;
    trades?: unknown;
  };
  delete p.equityCurve;
  delete p.events;
  delete p.trades;
  return { ...p, savedAt: Number(pack.savedAt) || Date.now(), persistSlim: true };
}

export function writeYearReplayPackPersistent(
  coin: AutoTradeCoinKey,
  pack: CachedYearPack
): void {
  const slim = slimYearPackClient(pack);
  writeYearReplayPack(coin, slim);
  void fetch('/api/merged-desk/coin-stats-persist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ coin, pack: slim }),
  }).catch(() => {
    /* ignore */
  });
}

export function writeCoinExitProfilePersistent(profile: CoinExitProfile): void {
  writeCoinExitProfile(profile);
  void fetch('/api/merged-desk/coin-stats-persist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ profile }),
  }).catch(() => {
    /* ignore */
  });
}

/** 저장된 팩에서 프로파일 재구성 (적용 버튼 안 눌러도) */
export function ensureProfileFromYearPack(
  coin: AutoTradeCoinKey,
  pack: CachedYearPack,
  leverageFallback = 30
): CoinExitProfile | null {
  const existing = getCoinExitProfile(coin);
  if (existing && existing.sampleTrades > 0) return existing;

  const avgMfePct = Number((pack as { avgMfePct?: number }).avgMfePct) || 0;
  const avgMaePct = Number((pack as { avgMaePct?: number }).avgMaePct) || 0;
  const medianSlDistPct = Number((pack as { medianSlDistPct?: number }).medianSlDistPct) || 0;
  const tradeCount = Number((pack as { tradeCount?: number }).tradeCount) || 0;
  if (!(tradeCount > 0) && !(avgMfePct > 0 || avgMaePct > 0)) return null;

  const lev30 = (pack as { lev30?: { suggestTpRoePct?: number; suggestSlRoePct?: number } }).lev30;
  const bestLev = Number((pack as { bestLeverage?: number }).bestLeverage) || leverageFallback;
  const prefer =
    Array.isArray(pack.preferTfs) && pack.preferTfs.length
      ? pack.preferTfs
      : coin === 'BTC'
        ? ['3m', '5m']
        : ['3m', '5m'];
  const skip = Array.isArray(pack.skipTfs) ? pack.skipTfs : [];
  const failBands = Array.isArray(pack.failBands) ? pack.failBands : [];

  const prof = buildExitFromStats({
    coin,
    leverage: bestLev,
    avgMfePct,
    avgMaePct,
    medianSlDistPct,
    targetTpRoePct: lev30?.suggestTpRoePct ?? 5,
    sampleTrades: tradeCount,
    winRate:
      typeof (pack as { winRate?: number | null }).winRate === 'number'
        ? (pack as { winRate: number }).winRate
        : null,
    preferTfs: prefer,
    skipTfs: skip,
    failBands: failBands as CoinExitProfile['failBands'],
    noteKo: String(pack.summaryKo || `${coin} 서버복구 프로파일`),
  });
  const slP = Number((pack as { suggestSlPricePct?: number }).suggestSlPricePct);
  const tpP = Number((pack as { suggestTpPricePct?: number }).suggestTpPricePct);
  if (slP > 0) prof.slPricePct = slP;
  if (tpP > 0) prof.tpPricePct = tpP;
  writeCoinExitProfilePersistent(prof);
  return prof;
}

export type HydrateCoinStatsResult = {
  profiles: Partial<Record<AutoTradeCoinKey, CoinExitProfile>>;
  packs: Partial<Record<AutoTradeCoinKey, CachedYearPack>>;
  restoredKo: string;
};

/** 서버→로컬 복구 · 로컬이 더 새면 유지 */
export async function hydrateCoinStatsFromServer(): Promise<HydrateCoinStatsResult> {
  const out: HydrateCoinStatsResult = { profiles: {}, packs: {}, restoredKo: '' };
  try {
    const res = await fetch('/api/merged-desk/coin-stats-persist', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      profiles?: Partial<Record<AutoTradeCoinKey, CoinExitProfile>>;
      packs?: Partial<Record<AutoTradeCoinKey, CachedYearPack>>;
    };
    if (!j.ok) {
      out.restoredKo = '서버통계 없음 · 로컬만 사용';
      return out;
    }
    const restored: string[] = [];
    for (const coin of COINS) {
      const serverPack = j.packs?.[coin];
      const localPack = readYearReplayPack(coin);
      const serverAt = Number(serverPack?.savedAt) || 0;
      const localAt = Number(localPack?.savedAt) || 0;
      if (serverPack && serverAt >= localAt) {
        writeYearReplayPack(coin, slimYearPackClient(serverPack));
        out.packs[coin] = serverPack;
        restored.push(`${coin}팩`);
      } else if (localPack) {
        out.packs[coin] = localPack;
        /** 로컬만 있으면 서버에 백업 */
        void writeYearReplayPackPersistent(coin, localPack);
      }

      const serverProf = j.profiles?.[coin];
      const localProf = getCoinExitProfile(coin);
      const sUp = Number(serverProf?.updatedAt) || 0;
      const lUp = Number(localProf?.updatedAt) || 0;
      if (serverProf && sUp >= lUp) {
        writeCoinExitProfile(serverProf);
        out.profiles[coin] = serverProf;
        restored.push(`${coin}프로파일`);
      } else if (localProf) {
        out.profiles[coin] = localProf;
        void writeCoinExitProfilePersistent(localProf);
      } else {
        const pack = out.packs[coin] || readYearReplayPack(coin);
        if (pack) {
          const built = ensureProfileFromYearPack(coin, pack);
          if (built) {
            out.profiles[coin] = built;
            restored.push(`${coin}자동프로파일`);
          }
        }
      }
    }
    out.restoredKo = restored.length
      ? `통계 복구 · ${restored.join(', ')} · 재다운 불필요`
      : '서버·로컬 통계 없음 · 통계탭에서 1회만 실행';
    return out;
  } catch {
    out.restoredKo = '서버통계 동기 실패 · 로컬만';
    return out;
  }
}
