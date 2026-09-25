/**
 * BTC 3분·5분 구조로켓 자동매매 — 로켓 후 눌림/저항 재진입.
 * 로켓 출현 직후 추격(진행봉 방향진입) 금지.
 * 롱: 상승로켓 이후 저가~중앙(수요) 눌림반등 · 숏: 하락로켓 이후 고가~중앙(공급) 저항.
 * SL = 로켓 그래프 바깥+헌팅버퍼 · ≈40x · TP ROE. 확정 수익·승률 아님.
 */
import type { Candle } from '@/types';
import { structureRocketRowOnRecentBars } from '@/lib/mtfStructureRocket';
import { listProfileLiveTfs } from '@/lib/mergedDeskCoinExitProfile';
import { resolveBtcUltraLeverage } from '@/lib/mergedDeskBtcUltraScalpPack';
import { FAST_TP1_ROE_PCT } from '@/lib/mergedDeskAutoTradeConfig';

export const BTC_3M_ROCKET_TF = '3m';
export const BTC_5M_ROCKET_TF = '5m';
export const BTC_ROCKET_AUTO_TFS = ['3m', '5m'] as const;
export const BTC_3M_ROCKET_SYMBOL = 'BTCUSDT';
/** 로켓 탐색 최근 봉 (3m≈30분) */
export const BTC_ROCKET_LOOKBACK_BARS = 10;
/** 로켓 이후 눌림 대기 최대 봉 */
export const BTC_ROCKET_PULLBACK_MAX_BARS = 8;

export function listBtcRocketAutoTimeframes(): string[] {
  return listProfileLiveTfs(BTC_3M_ROCKET_SYMBOL, [...BTC_ROCKET_AUTO_TFS]);
}

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) return 0;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    s += Math.max(a.high - a.low, Math.abs(a.high - b.close), Math.abs(a.low - b.close));
    c += 1;
  }
  return c > 0 ? s / c : Number(candles[n - 1]?.close || 0) * 0.008;
}

/**
 * 스탑헌팅 대비 SL.
 * SHORT → 로켓하락 그래프 위(고가+버퍼)
 * LONG → 로켓상승 그래프 아래(저가−버퍼)
 */
export function resolveBtcRocketHuntSl(params: {
  direction: 'LONG' | 'SHORT';
  rocketBar: { high: number; low: number };
  signalSl?: number | null;
  atr?: number;
  entry?: number;
}): { sl: number; reasonKo: string } {
  const hi = Number(params.rocketBar.high);
  const lo = Number(params.rocketBar.low);
  const mid = (hi + lo) / 2;
  const atr = params.atr != null && params.atr > 0 ? params.atr : Math.max(hi - lo, mid * 0.002);
  const hunt = Math.max(atr * 0.25, mid * 0.0004);
  const sig =
    params.signalSl != null && Number(params.signalSl) > 0 ? Number(params.signalSl) : null;

  if (params.direction === 'SHORT') {
    const aboveGraph = hi + hunt;
    const sl = sig != null && sig > hi ? Math.max(sig, aboveGraph) : aboveGraph;
    return {
      sl,
      reasonKo: `숏SL · 로켓하락 고가 ${hi.toFixed(0)} 위(+헌팅버퍼) → ${sl.toFixed(0)}`,
    };
  }

  const belowGraph = lo - hunt;
  const sl = sig != null && sig < lo ? Math.min(sig, belowGraph) : belowGraph;
  return {
    sl,
    reasonKo: `롱SL · 로켓상승 저가 ${lo.toFixed(0)} 아래(+헌팅버퍼) → ${sl.toFixed(0)}`,
  };
}

export type BtcRocketPullbackKind = 'demand-pullback' | 'supply-pullback';

export type BtcRocketPullbackResult = {
  ok: boolean;
  kind: BtcRocketPullbackKind | 'wait' | 'invalid' | 'chase';
  zoneLo: number;
  zoneHi: number;
  extendedAway: boolean;
  inZoneNow: boolean;
  reclaimOk: boolean;
  reasonKo: string;
};

/**
 * 로켓 봉 기준 눌림(수요)·저항(공급) 자리.
 * 롱: 로켓 저가~중앙(할인) · 숏: 중앙~고가(프리미엄).
 * 필수: 로켓 이후 한 번 이탈(확장) → 존 재진입 + 종가 회복.
 */
export function analyzeBtcRocketPullback(params: {
  direction: 'LONG' | 'SHORT';
  candles: Candle[];
  rocketIdx: number;
  /** 평가 봉 인덱스 (보통 마감봉 n-2 또는 마지막) */
  evalIdx: number;
  atr?: number;
  maxBarsAfter?: number;
}): BtcRocketPullbackResult {
  const candles = params.candles;
  const rocketIdx = params.rocketIdx;
  const evalIdx = params.evalIdx;
  const n = candles.length;
  if (
    rocketIdx < 0 ||
    rocketIdx >= n ||
    evalIdx <= rocketIdx ||
    evalIdx >= n
  ) {
    return {
      ok: false,
      kind: 'wait',
      zoneLo: 0,
      zoneHi: 0,
      extendedAway: false,
      inZoneNow: false,
      reclaimOk: false,
      reasonKo: '로켓눌림 · 인덱스무효',
    };
  }

  const maxAfter = Math.max(2, params.maxBarsAfter ?? BTC_ROCKET_PULLBACK_MAX_BARS);
  if (evalIdx - rocketIdx > maxAfter) {
    return {
      ok: false,
      kind: 'wait',
      zoneLo: 0,
      zoneHi: 0,
      extendedAway: false,
      inZoneNow: false,
      reclaimOk: false,
      reasonKo: `로켓눌림 · 대기만료(${maxAfter}봉) · 다음로켓`,
    };
  }

  const rb = candles[rocketIdx]!;
  const hi = Number(rb.high);
  const lo = Number(rb.low);
  const mid = (hi + lo) / 2;
  const range = Math.max(hi - lo, mid * 0.0005);
  const atr =
    params.atr != null && params.atr > 0
      ? params.atr
      : Math.max(range, mid * 0.002);

  const dir = params.direction;
  /** 롱 수요존 = 로켓 하단 55% · 숏 공급존 = 로켓 상단 55% */
  const zoneLo = dir === 'LONG' ? lo - atr * 0.12 : mid - range * 0.05;
  const zoneHi = dir === 'LONG' ? lo + range * 0.55 : hi + atr * 0.12;
  const kind: BtcRocketPullbackKind =
    dir === 'LONG' ? 'demand-pullback' : 'supply-pullback';

  let extendedAway = false;
  let invalidated = false;

  for (let i = rocketIdx + 1; i <= evalIdx; i++) {
    const c = candles[i]!;
    const cHi = Number(c.high);
    const cLo = Number(c.low);
    const cClose = Number(c.close);
    if (dir === 'LONG') {
      /** 무효: 종가가 로켓저가−버퍼 아래 */
      if (cClose < lo - atr * 0.28) invalidated = true;
      /** 확장: 고가가 존 위(중앙 이상)로 한 번 나감 */
      if (cHi > zoneHi + atr * 0.05 || cClose > mid) extendedAway = true;
    } else {
      if (cClose > hi + atr * 0.28) invalidated = true;
      if (cLo < zoneLo - atr * 0.05 || cClose < mid) extendedAway = true;
    }
  }

  if (invalidated) {
    return {
      ok: false,
      kind: 'invalid',
      zoneLo,
      zoneHi,
      extendedAway,
      inZoneNow: false,
      reclaimOk: false,
      reasonKo:
        dir === 'LONG'
          ? '로켓롱 · 저가이탈 무효 · 대기'
          : '로켓숏 · 고가돌파 무효 · 대기',
    };
  }

  const ev = candles[evalIdx]!;
  const mark = Number(ev.close);
  const eHi = Number(ev.high);
  const eLo = Number(ev.low);
  const inZoneNow =
    (eLo <= zoneHi && eHi >= zoneLo) ||
    (mark >= zoneLo && mark <= zoneHi);

  /** 추격: 존을 지나 멀리 있음 */
  if (dir === 'LONG' && mark > zoneHi + atr * 0.35) {
    return {
      ok: false,
      kind: 'chase',
      zoneLo,
      zoneHi,
      extendedAway,
      inZoneNow: false,
      reclaimOk: false,
      reasonKo: '로켓롱 · 추격(수요존위) · 눌림대기',
    };
  }
  if (dir === 'SHORT' && mark < zoneLo - atr * 0.35) {
    return {
      ok: false,
      kind: 'chase',
      zoneLo,
      zoneHi,
      extendedAway,
      inZoneNow: false,
      reclaimOk: false,
      reasonKo: '로켓숏 · 추격(공급존아래) · 저항대기',
    };
  }

  if (!extendedAway) {
    return {
      ok: false,
      kind: 'wait',
      zoneLo,
      zoneHi,
      extendedAway: false,
      inZoneNow,
      reclaimOk: false,
      reasonKo:
        dir === 'LONG'
          ? '로켓롱 · 확장후 눌림대기(수요존)'
          : '로켓숏 · 확장후 저항대기(공급존)',
    };
  }

  if (!inZoneNow) {
    return {
      ok: false,
      kind: 'wait',
      zoneLo,
      zoneHi,
      extendedAway: true,
      inZoneNow: false,
      reclaimOk: false,
      reasonKo:
        dir === 'LONG'
          ? `로켓롱 · 수요존 ${zoneLo.toFixed(0)}~${zoneHi.toFixed(0)} 재터치대기`
          : `로켓숏 · 공급존 ${zoneLo.toFixed(0)}~${zoneHi.toFixed(0)} 재터치대기`,
    };
  }

  /** 종가 회복: 롱은 존 하단에서 올려 마감 · 숏은 존 상단에서 내려 마감 */
  const zoneMid = (zoneLo + zoneHi) / 2;
  const reclaimOk =
    dir === 'LONG'
      ? mark >= zoneMid * 0.999 || (mark > eLo && mark >= lo)
      : mark <= zoneMid * 1.001 || (mark < eHi && mark <= hi);

  if (!reclaimOk) {
    return {
      ok: false,
      kind: 'wait',
      zoneLo,
      zoneHi,
      extendedAway: true,
      inZoneNow: true,
      reclaimOk: false,
      reasonKo:
        dir === 'LONG'
          ? '로켓롱 · 존안이나 종가회복 약함 · 대기'
          : '로켓숏 · 존안이나 종가거부 약함 · 대기',
    };
  }

  return {
    ok: true,
    kind,
    zoneLo,
    zoneHi,
    extendedAway: true,
    inZoneNow: true,
    reclaimOk: true,
    reasonKo:
      dir === 'LONG'
        ? `로켓롱 눌림반등 · 수요 ${zoneLo.toFixed(0)}~${zoneHi.toFixed(0)}`
        : `로켓숏 저항하락 · 공급 ${zoneLo.toFixed(0)}~${zoneHi.toFixed(0)}`,
  };
}

/** @deprecated 진단용 — 자동진입은 analyzeBtcRocketPullback 사용 */
export function btcRocketRetestOk(params: {
  direction: 'LONG' | 'SHORT';
  mark: number;
  rocketBar: { high: number; low: number };
  atr?: number;
}): { ok: boolean; reasonKo: string } {
  const mark = Number(params.mark);
  const hi = Number(params.rocketBar.high);
  const lo = Number(params.rocketBar.low);
  if (!(mark > 0) || !(hi > lo)) {
    return { ok: false, reasonKo: '로켓재터치 · 가격/봉무효' };
  }
  const mid = (hi + lo) / 2;
  const atr =
    params.atr != null && params.atr > 0
      ? params.atr
      : Math.max(hi - lo, mid * 0.002);
  const band = Math.max((hi - lo) * 0.55, atr * 0.55, mid * 0.0008);

  if (params.direction === 'LONG') {
    if (mark > hi + atr * 0.35) {
      return { ok: false, reasonKo: '로켓롱 · 추격(고가위) · 재터치대기' };
    }
    if (mark <= lo + band || mark <= mid) {
      return { ok: true, reasonKo: '로켓롱 재터치(저가/하단)' };
    }
    return { ok: false, reasonKo: '로켓롱 · 중간·상단 스킵 · 저가재터치대기' };
  }

  if (mark < lo - atr * 0.35) {
    return { ok: false, reasonKo: '로켓숏 · 추격(저가아래) · 재터치대기' };
  }
  if (mark >= hi - band || mark >= mid) {
    return { ok: true, reasonKo: '로켓숏 재터치(고가/상단)' };
  }
  return { ok: false, reasonKo: '로켓숏 · 중간·하단 스킵 · 고가재터치대기' };
}

export type Btc3mRocketSignal = {
  signalId: string;
  symbol: typeof BTC_3M_ROCKET_SYMBOL;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp1: number;
  rocketTime: number;
  barsAgo: number;
  noteKo: string;
  slReasonKo: string;
  pullbackKo?: string;
  zoneLo?: number;
  zoneHi?: number;
};

function findRocketBarIndex(
  candles: Candle[],
  rocketTime: number
): number {
  let best = candles.length - 1;
  let bestD = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const d = Math.abs(Number(candles[i]!.time) - rocketTime);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function buildBtc3mRocketSignal(params: {
  candles: Candle[];
  structureRocketSignals: Array<{
    time?: number;
    direction?: 'LONG' | 'SHORT';
    stopLoss?: number | null;
    entryPrice?: number | null;
  }> | null | undefined;
  leverage?: number;
  tp1RoePct?: number;
  /** 기본 3m · 5m 허용 */
  timeframe?: string;
  lookbackBars?: number;
  pullbackMaxBars?: number;
}): Btc3mRocketSignal | null {
  const candles = params.candles;
  if (!Array.isArray(candles) || candles.length < 20) return null;
  const tf = String(params.timeframe || BTC_3M_ROCKET_TF).toLowerCase();
  if (tf !== '3m' && tf !== '5m') return null;

  const lookback = params.lookbackBars ?? BTC_ROCKET_LOOKBACK_BARS;
  /** 후반영: 마감봉 로켓 우선 · 진행봉만 추격 진입 금지 */
  const hit = structureRocketRowOnRecentBars(
    params.structureRocketSignals as never,
    candles,
    tf,
    { lookbackBars: lookback, preferClosed: true }
  );
  if (!hit) return null;

  /** 진행봉(0) 로켓은 자리만 잡고 · 눌림 평가에서 탈락시키기 위해 인덱스만 사용 */
  const rocketIdx = findRocketBarIndex(candles, hit.time);
  const rocketBar = candles[rocketIdx]!;
  const atr = atr14(candles);

  /** 마감봉 우선 평가(리페인트 완화) · 없으면 마지막 */
  const evalIdx = candles.length >= 2 ? candles.length - 2 : candles.length - 1;
  const pullback = analyzeBtcRocketPullback({
    direction: hit.direction,
    candles,
    rocketIdx,
    evalIdx,
    atr,
    maxBarsAfter: params.pullbackMaxBars ?? BTC_ROCKET_PULLBACK_MAX_BARS,
  });
  if (!pullback.ok) return null;

  const mark = Number(candles[evalIdx]!.close);
  if (!(mark > 0)) return null;

  const hunt = resolveBtcRocketHuntSl({
    direction: hit.direction,
    rocketBar: { high: rocketBar.high, low: rocketBar.low },
    signalSl: hit.stopLoss,
    atr,
    entry: mark,
  });

  if (hit.direction === 'LONG' && !(hunt.sl < mark)) return null;
  if (hit.direction === 'SHORT' && !(hunt.sl > mark)) return null;

  const lev = resolveBtcUltraLeverage(params.leverage);
  const tpRoe = Math.max(3, Math.min(20, Number(params.tp1RoePct) || FAST_TP1_ROE_PCT));
  const tpMove = tpRoe / 100 / lev;
  const tp1 =
    hit.direction === 'LONG' ? mark * (1 + tpMove) : mark * (1 - tpMove);

  const barsAgo = hit.barsAgo ?? Math.max(0, candles.length - 1 - rocketIdx);
  const signalId = `btc-${tf}-rk-pb-${hit.direction}-${Math.round(hit.time)}`;
  const tfKo = tf === '5m' ? '5분' : '3분';
  const lagKo =
    barsAgo <= 0 ? '진행봉앵커' : barsAgo === 1 ? '직전마감·후반영' : `${barsAgo}봉전·후반영`;

  return {
    signalId,
    symbol: BTC_3M_ROCKET_SYMBOL,
    timeframe: tf,
    direction: hit.direction,
    entry: mark,
    sl: hunt.sl,
    tp1,
    rocketTime: hit.time,
    barsAgo,
    noteKo: `BTC ${tfKo} 로켓${hit.direction === 'LONG' ? '상승🚀' : '하락📉'} · ${lagKo} · ${pullback.reasonKo} · ${hunt.reasonKo}`,
    slReasonKo: hunt.reasonKo,
    pullbackKo: pullback.reasonKo,
    zoneLo: pullback.zoneLo,
    zoneHi: pullback.zoneHi,
  };
}
