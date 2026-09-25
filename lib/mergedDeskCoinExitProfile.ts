/**
 * 코인별 1년통계 → 실전 익절/손절/선호TF 프로파일.
 * 확정 수익 아님 · 로컬 저장.
 */
export type AutoTradeCoinKey = 'BTC' | 'ETH' | 'BNB' | 'XRP' | 'SOL';

export type FailEntryBand = {
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  midPrice: number;
  halfPct: number;
  slCount: number;
};

export type CoinExitProfile = {
  coin: AutoTradeCoinKey;
  /** 진입 대비 가격 SL % */
  slPricePct: number;
  /** 진입 대비 가격 TP % */
  tpPricePct: number;
  /** 증거금 ROE% (표시·게이트용) */
  tpRoePct: number;
  slRoePct: number;
  leverage: number;
  preferTfs: string[];
  skipTfs: string[];
  /** 통계 손절 다발 가격대 — 재진입 배제 */
  failBands: FailEntryBand[];
  /** 참고 표본 */
  sampleTrades: number;
  winRate: number | null;
  avgMfePct: number;
  avgMaePct: number;
  updatedAt: number;
  noteKo: string;
};

const KEY = 'ailongshort.mergedDesk.coinExitProfiles.v1';

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readCoinExitProfiles(): Partial<Record<AutoTradeCoinKey, CoinExitProfile>> {
  if (typeof window === 'undefined') return {};
  return safeParse(window.localStorage.getItem(KEY), {});
}

export function getCoinExitProfile(coin: AutoTradeCoinKey): CoinExitProfile | null {
  const raw = readCoinExitProfiles()[coin];
  if (!raw) return null;
  return {
    ...raw,
    preferTfs: raw.preferTfs ?? [],
    skipTfs: raw.skipTfs ?? [],
    failBands: raw.failBands ?? [],
  };
}

export function writeCoinExitProfile(profile: CoinExitProfile): void {
  if (typeof window === 'undefined') return;
  const map = readCoinExitProfiles();
  map[profile.coin] = profile;
  window.localStorage.setItem(KEY, JSON.stringify(map));
}

export function normalizeCoinKey(symbol: string): AutoTradeCoinKey | null {
  const s = String(symbol || '')
    .toUpperCase()
    .replace(/USDT$/, '')
    .replace(/[_-]/g, '');
  if (s === 'BTC' || s === 'XBT') return 'BTC';
  if (s === 'ETH') return 'ETH';
  if (s === 'BNB') return 'BNB';
  if (s === 'XRP') return 'XRP';
  if (s === 'SOL') return 'SOL';
  return null;
}

/**
 * 가격% → ROE% · ROE% → 가격%.
 * roePct=5, lev=30 → pricePct=5/30≈0.1667
 */
export function roePctToPricePct(roePct: number, leverage: number): number {
  const lev = Math.max(1, leverage);
  return Math.max(0, Number(roePct) || 0) / lev;
}

export function pricePctToRoePct(pricePct: number, leverage: number): number {
  return Math.max(0, Number(pricePct) || 0) * Math.max(1, leverage);
}

/**
 * MFE/MAE·고정ROE 목표로 실현 가능한 TP/SL 산출.
 * TP는 평균 MFE를 넘기지 않게 캡 · SL은 MAE·헌팅 중앙 반영.
 */
export function buildExitFromStats(params: {
  coin: AutoTradeCoinKey;
  leverage: number;
  avgMfePct: number;
  avgMaePct: number;
  medianSlDistPct: number;
  /** 목표 TP ROE% (예: 5) — 가격으로 환산 후 MFE 캡 */
  targetTpRoePct?: number | null;
  sampleTrades: number;
  winRate: number | null;
  preferTfs?: string[];
  skipTfs?: string[];
  failBands?: FailEntryBand[];
  noteKo?: string;
}): CoinExitProfile {
  const lev = Math.max(1, Math.min(125, params.leverage || 30));
  const mfe = Math.max(0, params.avgMfePct);
  const mae = Math.max(0, params.avgMaePct);
  const medSl = Math.max(0, params.medianSlDistPct);

  let slPricePct = Math.max(medSl, mae * 1.05, 0.08);
  slPricePct = Math.min(slPricePct, 1.2);

  const targetFromRoe =
    params.targetTpRoePct != null && params.targetTpRoePct > 0
      ? roePctToPricePct(params.targetTpRoePct, lev)
      : 0;
  /** 평균 유리폭의 70% · 또는 목표ROE 가격 중 실현 가능한 쪽 */
  let tpPricePct = mfe > 0 ? mfe * 0.7 : targetFromRoe || 0.2;
  if (targetFromRoe > 0) {
    tpPricePct = mfe > 0 ? Math.min(targetFromRoe, mfe * 0.85) : targetFromRoe;
  }
  /** RR 최소 ~1.25 되도록 TP 하한 */
  tpPricePct = Math.max(tpPricePct, slPricePct * 1.25);
  if (mfe > 0) tpPricePct = Math.min(tpPricePct, Math.max(mfe * 0.9, slPricePct * 1.25));
  tpPricePct = Math.min(Math.max(tpPricePct, 0.1), 2.5);

  return {
    coin: params.coin,
    slPricePct,
    tpPricePct,
    tpRoePct: pricePctToRoePct(tpPricePct, lev),
    slRoePct: pricePctToRoePct(slPricePct, lev),
    leverage: lev,
    preferTfs: params.preferTfs ?? [],
    skipTfs: params.skipTfs ?? [],
    failBands: params.failBands ?? [],
    sampleTrades: params.sampleTrades,
    winRate: params.winRate,
    avgMfePct: mfe,
    avgMaePct: mae,
    updatedAt: Date.now(),
    noteKo:
      params.noteKo ||
      `${params.coin} · SL ${slPricePct.toFixed(3)}% · TP ${tpPricePct.toFixed(3)}% · ${lev}x`,
  };
}

/** 프로파일 있으면 가격 기준 SL/TP (구조 SL 유지 옵션) */
export function applyCoinExitToPrices(params: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  signalSl?: number | null;
  preserveStructureSl?: boolean;
}): { sl: number; tp: number; usedProfile: boolean; profile: CoinExitProfile | null; reasonKo: string } {
  const coin = normalizeCoinKey(params.symbol);
  const entry = Number(params.entry);
  const profile = coin ? getCoinExitProfile(coin) : null;
  if (!profile || !(entry > 0)) {
    return {
      sl: Number(params.signalSl) || 0,
      tp: 0,
      usedProfile: false,
      profile: null,
      reasonKo: '프로파일없음',
    };
  }
  const tp =
    params.direction === 'LONG'
      ? entry * (1 + profile.tpPricePct / 100)
      : entry * (1 - profile.tpPricePct / 100);
  let sl =
    params.direction === 'LONG'
      ? entry * (1 - profile.slPricePct / 100)
      : entry * (1 + profile.slPricePct / 100);

  const sig = params.signalSl != null && Number(params.signalSl) > 0 ? Number(params.signalSl) : null;
  if (params.preserveStructureSl && sig != null) {
    if (params.direction === 'LONG') sl = Math.min(sl, sig);
    else sl = Math.max(sl, sig);
  }

  return {
    sl,
    tp,
    usedProfile: true,
    profile,
    reasonKo: `${profile.coin}통계SL ${profile.slPricePct.toFixed(3)}% · TP ${profile.tpPricePct.toFixed(3)}%`,
  };
}

export function isTfSkippedByProfile(symbol: string, timeframe: string): boolean {
  const coin = normalizeCoinKey(symbol);
  if (!coin) return false;
  const p = getCoinExitProfile(coin);
  if (!p?.skipTfs?.length) return false;
  const tf = String(timeframe || '').toLowerCase();
  if (!p.skipTfs.some((t) => t.toLowerCase() === tf)) return false;
  /** prefer TF는 skip보다 우선 — 성공쪽 진입 유지 */
  if (p.preferTfs?.some((t) => t.toLowerCase() === tf)) return false;
  return true;
}

/** 통계 손절 다발 가격대면 진입 배제 */
export function isFailBandBlocked(
  symbol: string,
  timeframe: string,
  direction: 'LONG' | 'SHORT',
  price: number
): { blocked: boolean; reasonKo: string } {
  const coin = normalizeCoinKey(symbol);
  if (!coin) return { blocked: false, reasonKo: '' };
  const p = getCoinExitProfile(coin);
  const bands = p?.failBands;
  if (!bands?.length || !(price > 0)) return { blocked: false, reasonKo: '' };
  const tf = String(timeframe || '').toLowerCase();
  for (const b of bands) {
    if (b.direction !== direction) continue;
    if (String(b.timeframe || '').toLowerCase() !== tf) continue;
    const mid = Number(b.midPrice);
    if (!(mid > 0)) continue;
    const distPct = (Math.abs(price - mid) / mid) * 100;
    const half = Math.max(0.15, Number(b.halfPct) || 0.35);
    if (distPct <= half) {
      return {
        blocked: true,
        reasonKo: `통계실패구간 배제 · ${tf} ${direction} @${mid.toFixed(mid >= 100 ? 1 : 4)} ±${half}% (SL${b.slCount}회)`,
      };
    }
  }
  return { blocked: false, reasonKo: '' };
}

/** 프로파일 기준 실전 스캔 TF (skip 제외 · prefer 우선) */
export function listProfileLiveTfs(
  symbol: string,
  fallback: string[]
): string[] {
  const coin = normalizeCoinKey(symbol);
  const p = coin ? getCoinExitProfile(coin) : null;
  const skip = new Set((p?.skipTfs || []).map((t) => t.toLowerCase()));
  const prefer = (p?.preferTfs || []).map((t) => t.toLowerCase());
  let base = fallback.map((t) => t.toLowerCase()).filter((t) => !skip.has(t));
  /** skip이 전부 막으면 스캔 자체가 죽음 → fallback 유지 */
  if (!base.length) base = fallback.map((t) => t.toLowerCase());
  if (!prefer.length) return base;
  const ordered = [
    ...prefer.filter((t) => base.includes(t)),
    ...base.filter((t) => !prefer.includes(t)),
  ];
  return ordered.length ? ordered : base;
}
