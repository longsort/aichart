/**
 * 15분 캔들 꼬리 + AIZONE 추정 — 코인별 독립 진입(BTC 합류팩에 묶지 않음).
 * - BTC / BNB / XRP / SOL: 몸통색 무시 · 아랫꼬리+진입추정≥70→롱 · 윗꼬리+숏/저항추정≥70→숏
 * - ETH: 꼬리+추정70 + 거래량색·RVOL 합류(몸통 가산) · 별도 파일럿
 * 레버≈40(설정 20~50이면 그 값) · SL -20%ROE · TP +8%ROE · 마감봉만. 확정 수익·승률 아님.
 */
import type { Candle } from '@/types';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import {
  FAST_SL_ROE_PCT,
  FAST_TP1_ROE_PCT,
} from '@/lib/mergedDeskAutoTradeConfig';
import {
  snapVolBarAt,
  VOL_ROE_RVOL_MIN_ENTRY,
} from '@/lib/mergedDeskVolBurstRoeStats';
import { aiZoneDualEstimateWait } from '@/lib/mergedDeskAiZoneDualWait';

export const WICK_15M_TF = '15m';
export const WICK_15M_PCT_MIN = 70;
export const WICK_MIN_FRAC_OF_RANGE = 0.28;
export const WICK_ZONE_MIN_FRAC = 0.22;
export const WICK_15M_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'SOLUSDT',
] as const;
/** 꼬리 경로 기본 레버 — 설정 없을 때만 */
export const WICK_15M_ULTRA_LEVERAGE = 40;

/**
 * 사용자 비중창 레버리지 그대로 (1~125).
 * 예전에 35~50만 허용·그 외 40 고정 → 사용자 20x 등이 무시되던 문제 수정.
 */
export function resolveWick15mLeverage(cfgLev?: number | null): number {
  const n = Number(cfgLev);
  if (Number.isFinite(n) && n >= 1 && n <= 125) return Math.round(n);
  return WICK_15M_ULTRA_LEVERAGE;
}

function wickCoinLabel(symbol: string): string {
  const s = String(symbol || '')
    .toUpperCase()
    .replace(/USDT$/, '')
    .replace(/[^A-Z0-9]/g, '');
  if (s === 'BTC' || s === 'XBT') return 'BTC';
  if (s === 'ETH') return 'ETH';
  if (s === 'BNB') return 'BNB';
  if (s === 'XRP') return 'XRP';
  if (s === 'SOL') return 'SOL';
  return s || 'ALT';
}

export type Wick15mDirection = 'LONG' | 'SHORT';

export type Wick15mSignal = {
  symbol: string;
  timeframe: typeof WICK_15M_TF;
  direction: Wick15mDirection;
  entry: number;
  sl: number;
  tp1: number;
  signalId: string;
  noteKo: string;
  closedBarTime: number;
  longPct: number;
  shortPct: number;
  upperWickPct: number;
  lowerWickPct: number;
};

function closeReclaimOk(
  direction: Wick15mDirection,
  closePx: number,
  hi: number,
  lo: number
): boolean {
  const mid = (hi + lo) / 2;
  if (direction === 'LONG') return closePx >= mid;
  return closePx <= mid;
}

export function wickRoeStopPrice(
  entry: number,
  direction: Wick15mDirection,
  leverage: number,
  slRoePct: number = FAST_SL_ROE_PCT
): number {
  const roe = Math.max(1, Math.min(50, slRoePct)) / 100;
  const opp = direction === 'LONG' ? 'SHORT' : 'LONG';
  return roeTargetPrice(entry, opp, leverage, roe);
}

function finishSignal(params: {
  symbol: string;
  direction: Wick15mDirection;
  closePx: number;
  closedT: number;
  longPct: number;
  shortPct: number;
  upperFrac: number;
  lowerFrac: number;
  leverage?: number;
  tp1RoePct?: number;
  slRoePct?: number;
  noteKo: string;
}): Wick15mSignal | null {
  const lev = Math.max(1, Math.min(125, Number(params.leverage) || 10));
  const tpRoe = Math.max(3, Math.min(20, Number(params.tp1RoePct) || FAST_TP1_ROE_PCT));
  const slRoe = Math.max(5, Math.min(40, Number(params.slRoePct) || FAST_SL_ROE_PCT));
  const tp1 = roeTargetPrice(params.closePx, params.direction, lev, tpRoe / 100);
  const sl = wickRoeStopPrice(params.closePx, params.direction, lev, slRoe);
  if (params.direction === 'LONG' && !(sl < params.closePx)) return null;
  if (params.direction === 'SHORT' && !(sl > params.closePx)) return null;
  const sym = String(params.symbol || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return {
    symbol: sym.endsWith('USDT') ? sym : `${sym}USDT`,
    timeframe: WICK_15M_TF,
    direction: params.direction,
    entry: params.closePx,
    sl,
    tp1,
    signalId: `wick15-${sym}-${params.direction}-${Math.round(params.closedT)}`,
    noteKo: params.noteKo,
    closedBarTime: params.closedT,
    longPct: params.longPct,
    shortPct: params.shortPct,
    upperWickPct: params.upperFrac * 100,
    lowerWickPct: params.lowerFrac * 100,
  };
}

/**
 * BTC·BNB·XRP 공통 규칙(코인별 독립 신호) — 몸통 색 무시.
 * - 아랫꼬리 + 진입/롱추정 ≥70 → 롱
 * - 윗꼬리 + 숏/저항추정 ≥70 → 숏
 * 양쪽이면 추정% 큰 쪽. BTC 합류팩과 별개.
 */
function scanWickEstimateNoBody(params: {
  symbol: string;
  openPx: number;
  closePx: number;
  hi: number;
  lo: number;
  closedT: number;
  longPct: number;
  shortPct: number;
  upperFrac: number;
  lowerFrac: number;
  upperWick: number;
  lowerWick: number;
  body: number;
  red: boolean;
  green: boolean;
  pctMin: number;
  leverage?: number;
  tp1RoePct?: number;
  slRoePct?: number;
}): Wick15mSignal | null {
  const { longPct, shortPct, pctMin, upperFrac, lowerFrac, upperWick, lowerWick, body } = params;
  const coin = wickCoinLabel(params.symbol);

  const lowerWickOk =
    lowerFrac >= WICK_ZONE_MIN_FRAC &&
    lowerWick >= body * 0.35 &&
    lowerWick >= upperWick * 0.85;
  const upperWickOk =
    upperFrac >= WICK_ZONE_MIN_FRAC &&
    upperWick >= body * 0.35 &&
    upperWick >= lowerWick * 0.85;

  const longOk = lowerWickOk && longPct >= pctMin;
  const shortOk = upperWickOk && shortPct >= pctMin;
  if (!longOk && !shortOk) return null;

  let direction: Wick15mDirection;
  if (longOk && shortOk) {
    if (longPct > shortPct) direction = 'LONG';
    else if (shortPct > longPct) direction = 'SHORT';
    else direction = lowerWick >= upperWick ? 'LONG' : 'SHORT';
  } else {
    direction = longOk ? 'LONG' : 'SHORT';
  }

  if (!closeReclaimOk(direction, params.closePx, params.hi, params.lo)) return null;

  const slRoe = Math.max(5, Math.min(40, Number(params.slRoePct) || FAST_SL_ROE_PCT));
  const tpRoe = Math.max(3, Math.min(20, Number(params.tp1RoePct) || FAST_TP1_ROE_PCT));
  const lev = resolveWick15mLeverage(params.leverage);
  return finishSignal({
    ...params,
    leverage: lev,
    direction,
    noteKo:
      direction === 'SHORT'
        ? `${coin} 15m 윗꼬리+숏/저항추정${shortPct.toFixed(0)}%≥${pctMin}% · 몸통색무시 · ${lev}x · SL-${slRoe}%ROE · TP+${tpRoe}%ROE`
        : `${coin} 15m 아랫꼬리+진입추정${longPct.toFixed(0)}%≥${pctMin}% · 몸통색무시 · ${lev}x · SL-${slRoe}%ROE · TP+${tpRoe}%ROE`,
  });
}

/**
 * ETH 파일럿 — 방향=꼬리+추정70(몸통무시) · 확인=거래량색+RVOL · 몸통=가산.
 * 필수 통과 + 가산≥2. 노랑 단독 불가. BTC/BNB/XRP와 분리.
 */
export const ETH_WICK_VOL_BONUS_MIN = 2;

export function scoreEthWickVolConfluence(params: {
  direction: Wick15mDirection;
  red: boolean;
  green: boolean;
  candles: Candle[];
  closedIdx: number;
}): { ok: boolean; bonus: number; detailKo: string } {
  const vol = snapVolBarAt(params.candles, params.closedIdx);
  if (!vol) {
    return { ok: false, bonus: 0, detailKo: '거래량스냅없음' };
  }
  if (vol.tone === 'mixed') {
    return { ok: false, bonus: 0, detailKo: '노랑(혼합)금지' };
  }
  const volAgree =
    (params.direction === 'LONG' && vol.tone === 'buy') ||
    (params.direction === 'SHORT' && vol.tone === 'sell');
  if (!volAgree) {
    return {
      ok: false,
      bonus: 0,
      detailKo: `거래량반대(${vol.tone} vs ${params.direction})`,
    };
  }

  let bonus = 0;
  const bits: string[] = [];
  bonus += 1;
  bits.push(params.direction === 'LONG' ? '녹볼륨' : '빨볼륨');
  if (vol.rvol >= VOL_ROE_RVOL_MIN_ENTRY) {
    bonus += 1;
    bits.push(`RVOL${vol.rvol.toFixed(1)}`);
  }
  const bodyAgree =
    (params.direction === 'LONG' && params.green) ||
    (params.direction === 'SHORT' && params.red);
  if (bodyAgree) {
    bonus += 1;
    bits.push(params.direction === 'LONG' ? '양봉가산' : '음봉가산');
  }
  const ok = bonus >= ETH_WICK_VOL_BONUS_MIN;
  return {
    ok,
    bonus,
    detailKo: ok
      ? `합류${bonus} · ${bits.join('+')}`
      : `가산${bonus}<${ETH_WICK_VOL_BONUS_MIN} · ${bits.join('+') || '볼륨약함'}`,
  };
}

/** ETH 폭락존용 — 같은 합류 점수 */
export function ethDumpVolConfluenceOk(params: {
  direction: 'LONG' | 'SHORT';
  candles: Candle[];
  closedIdx?: number;
}): { allow: boolean; reasonKo: string } {
  const n = params.candles.length;
  const idx =
    params.closedIdx != null && params.closedIdx >= 0
      ? params.closedIdx
      : Math.max(0, n - 2);
  const c = params.candles[idx];
  if (!c) return { allow: false, reasonKo: '봉없음' };
  const red = Number(c.close) < Number(c.open);
  const green = Number(c.close) > Number(c.open);
  const scored = scoreEthWickVolConfluence({
    direction: params.direction,
    red,
    green,
    candles: params.candles,
    closedIdx: idx,
  });
  return { allow: scored.ok, reasonKo: scored.detailKo };
}

function scanEthWickVolConfluence(params: {
  symbol: string;
  candles: Candle[];
  closedIdx: number;
  openPx: number;
  closePx: number;
  hi: number;
  lo: number;
  closedT: number;
  longPct: number;
  shortPct: number;
  upperFrac: number;
  lowerFrac: number;
  upperWick: number;
  lowerWick: number;
  body: number;
  red: boolean;
  green: boolean;
  pctMin: number;
  leverage?: number;
  tp1RoePct?: number;
  slRoePct?: number;
}): Wick15mSignal | null {
  const { longPct, shortPct, pctMin, upperFrac, lowerFrac, upperWick, lowerWick, body } = params;

  const lowerWickOk =
    lowerFrac >= WICK_ZONE_MIN_FRAC &&
    lowerWick >= body * 0.35 &&
    lowerWick >= upperWick * 0.85;
  const upperWickOk =
    upperFrac >= WICK_ZONE_MIN_FRAC &&
    upperWick >= body * 0.35 &&
    upperWick >= lowerWick * 0.85;

  const longOk = lowerWickOk && longPct >= pctMin;
  const shortOk = upperWickOk && shortPct >= pctMin;
  if (!longOk && !shortOk) return null;

  let direction: Wick15mDirection;
  if (longOk && shortOk) {
    if (longPct > shortPct) direction = 'LONG';
    else if (shortPct > longPct) direction = 'SHORT';
    else direction = lowerWick >= upperWick ? 'LONG' : 'SHORT';
  } else {
    direction = longOk ? 'LONG' : 'SHORT';
  }

  if (!closeReclaimOk(direction, params.closePx, params.hi, params.lo)) return null;

  const conf = scoreEthWickVolConfluence({
    direction,
    red: params.red,
    green: params.green,
    candles: params.candles,
    closedIdx: params.closedIdx,
  });
  if (!conf.ok) return null;

  const slRoe = Math.max(5, Math.min(40, Number(params.slRoePct) || FAST_SL_ROE_PCT));
  const tpRoe = Math.max(3, Math.min(20, Number(params.tp1RoePct) || FAST_TP1_ROE_PCT));
  const lev = resolveWick15mLeverage(params.leverage);
  return finishSignal({
    ...params,
    leverage: lev,
    direction,
    noteKo:
      direction === 'SHORT'
        ? `ETH 15m 윗꼬리+숏추정${shortPct.toFixed(0)}% · ${conf.detailKo} · ${lev}x · SL-${slRoe}%·TP+${tpRoe}%`
        : `ETH 15m 아랫꼬리+진입추정${longPct.toFixed(0)}% · ${conf.detailKo} · ${lev}x · SL-${slRoe}%·TP+${tpRoe}%`,
  });
}

/** 이전 색+구간 규칙(복구용 유지) — 현재 BNB/XRP는 scanWickEstimateNoBody 사용 */
function scanAltColorZone(params: {
  symbol: string;
  openPx: number;
  closePx: number;
  hi: number;
  lo: number;
  closedT: number;
  longPct: number;
  shortPct: number;
  upperFrac: number;
  lowerFrac: number;
  upperWick: number;
  lowerWick: number;
  body: number;
  red: boolean;
  green: boolean;
  pctMin: number;
  leverage?: number;
  tp1RoePct?: number;
  slRoePct?: number;
}): Wick15mSignal | null {
  const {
    longPct,
    shortPct,
    pctMin,
    upperFrac,
    lowerFrac,
    upperWick,
    lowerWick,
    body,
    red,
    green,
  } = params;

  const upperOkStrict =
    red &&
    upperFrac >= WICK_MIN_FRAC_OF_RANGE &&
    upperWick >= lowerWick * 1.05 &&
    upperWick >= body * 0.55;
  const upperOkShortZone =
    red &&
    shortPct >= pctMin &&
    upperFrac >= WICK_ZONE_MIN_FRAC &&
    upperWick >= body * 0.4 &&
    upperWick >= lowerWick * 0.75;
  const lowerOkStrict =
    green &&
    lowerFrac >= WICK_MIN_FRAC_OF_RANGE &&
    lowerWick >= upperWick * 1.05 &&
    lowerWick >= body * 0.55;
  const lowerOkLongZone =
    green &&
    longPct >= pctMin &&
    lowerFrac >= WICK_ZONE_MIN_FRAC &&
    lowerWick >= body * 0.4 &&
    lowerWick >= upperWick * 0.75;

  let direction: Wick15mDirection | null = null;
  let via: 'strict' | 'zone' | null = null;
  if (upperOkStrict && shortPct >= pctMin) {
    direction = 'SHORT';
    via = 'strict';
  } else if (upperOkShortZone) {
    direction = 'SHORT';
    via = 'zone';
  } else if (lowerOkStrict && longPct >= pctMin) {
    direction = 'LONG';
    via = 'strict';
  } else if (lowerOkLongZone) {
    direction = 'LONG';
    via = 'zone';
  }
  if (!direction) return null;
  if (!closeReclaimOk(direction, params.closePx, params.hi, params.lo)) return null;

  const slRoe = Math.max(5, Math.min(40, Number(params.slRoePct) || FAST_SL_ROE_PCT));
  const tpRoe = Math.max(3, Math.min(20, Number(params.tp1RoePct) || FAST_TP1_ROE_PCT));
  const lev = resolveWick15mLeverage(params.leverage);
  const noteKo =
    direction === 'SHORT'
      ? via === 'zone'
        ? `15m 숏구간${shortPct.toFixed(0)}%≥${pctMin}% · 음봉윗꼬리 · ${lev}x · SL-${slRoe}%ROE · TP+${tpRoe}%ROE`
        : `15m 윗꼬리음봉 · 저항${shortPct.toFixed(0)}%≥${pctMin}% · ${lev}x · SL-${slRoe}%ROE · TP+${tpRoe}%ROE`
      : via === 'zone'
        ? `15m 롱구간${longPct.toFixed(0)}%≥${pctMin}% · 초록아래꼬리 · ${lev}x · SL-${slRoe}%ROE · TP+${tpRoe}%ROE`
        : `15m 아래꼬리양봉 · 진입${longPct.toFixed(0)}%≥${pctMin}% · ${lev}x · SL-${slRoe}%ROE · TP+${tpRoe}%ROE`;

  return finishSignal({ ...params, leverage: lev, direction, noteKo });
}

export function scanWick15mOnClosedBar(params: {
  symbol: string;
  candles: Candle[];
  longPct: number;
  shortPct: number;
  leverage?: number;
  pctMin?: number;
  tp1RoePct?: number;
  slRoePct?: number;
}): Wick15mSignal | null {
  const candles = params.candles;
  const n = candles.length;
  if (n < 8) return null;

  const closed = candles[n - 2]!;
  const openPx = Number(closed.open);
  const closePx = Number(closed.close);
  const hi = Number(closed.high);
  const lo = Number(closed.low);
  const closedT = Number(closed.time) || 0;
  if (!(closePx > 0) || !(hi > lo) || !(closedT > 0)) return null;

  const range = hi - lo;
  const body = Math.max(Math.abs(closePx - openPx), range * 0.01);
  const upperWick = hi - Math.max(openPx, closePx);
  const lowerWick = Math.min(openPx, closePx) - lo;
  const upperFrac = upperWick / range;
  const lowerFrac = lowerWick / range;
  const red = closePx < openPx;
  const green = closePx > openPx;
  const pctMin = Math.max(50, Math.min(95, Number(params.pctMin) || WICK_15M_PCT_MIN));
  const longPct = Math.max(0, Math.min(100, Number(params.longPct) || 0));
  const shortPct = Math.max(0, Math.min(100, Number(params.shortPct) || 0));
  const lev = resolveWick15mLeverage(params.leverage);

  /** 양쪽≥70 + 갭작음/방짧음 → 꼬리로도 방향 억지 선택 안 함 */
  const dual = aiZoneDualEstimateWait({
    longPct,
    shortPct,
    price: closePx,
    leverage: lev,
    direction: null,
  });
  if (dual.wait) return null;

  const common = {
    symbol: params.symbol,
    openPx,
    closePx,
    hi,
    lo,
    closedT,
    longPct,
    shortPct,
    upperFrac,
    lowerFrac,
    upperWick,
    lowerWick,
    body,
    red,
    green,
    pctMin,
    leverage: lev,
    tp1RoePct: params.tp1RoePct,
    slRoePct: params.slRoePct,
  };

  const symU = String(params.symbol || '').toUpperCase();
  /** ETH만 거래량 합류 별도 · BTC/BNB/XRP/SOL은 동일 꼬리+추정(몸통무시)·코인별 신호 */
  if (symU === 'ETHUSDT' || symU === 'ETH' || symU.startsWith('ETH')) {
    return scanEthWickVolConfluence({
      ...common,
      candles,
      closedIdx: n - 2,
    });
  }
  if (
    symU === 'BTCUSDT' ||
    symU === 'BTC' ||
    symU.startsWith('BTC') ||
    symU === 'BNBUSDT' ||
    symU === 'BNB' ||
    symU.startsWith('BNB') ||
    symU === 'XRPUSDT' ||
    symU === 'XRP' ||
    symU.startsWith('XRP') ||
    symU === 'SOLUSDT' ||
    symU === 'SOL' ||
    symU.startsWith('SOL')
  ) {
    return scanWickEstimateNoBody(common);
  }
  /** 기타 심볼 — 색+구간 폴백(기능 유지) */
  return scanAltColorZone(common);
}

export function listWick15mSymbols(enabled?: string[] | null): string[] {
  const base = [...WICK_15M_SYMBOLS];
  if (!enabled?.length) return base;
  const set = new Set(enabled.map((s) => String(s).toUpperCase()));
  return base.filter((s) => set.has(s));
}
