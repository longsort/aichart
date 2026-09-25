/**
 * 15m BPR 재터치 + AIZONE 추정≥70 → 자동진입 신호.
 * 첫 겹침만으로는 진입 안 함:
 * - 형성 후 이탈 → 재진입(재터치)
 * - 마감봉 터치 횟수 ≥2
 * - 방향 bias 일치(neutral 자동진입 제외)
 * - 추정≥70 + 반대쪽 대비 갭
 * SL -20%ROE · TP +8%ROE · ≈40x. 확정 수익·승률 아님.
 */
import type { Candle } from '@/types';
import { roeTargetPrice } from '@/lib/mergedDeskAutoScalpEngine';
import {
  FAST_SL_ROE_PCT,
  FAST_TP1_ROE_PCT,
} from '@/lib/mergedDeskAutoTradeConfig';
import {
  detectIctBpr,
  priceTouchesBpr,
  type IctBprZone,
} from '@/lib/bpr';
import { aiZoneDualEstimateWait } from '@/lib/mergedDeskAiZoneDualWait';
import { resolveWick15mLeverage } from '@/lib/mergedDeskWick15mTrade';

export const BPR_RETEST_TF = '15m';
export const BPR_RETEST_PCT_MIN = 70;
/** 선호방향 − 반대방향 최소 갭 (추정%) */
export const BPR_RETEST_PCT_GAP_MIN = 10;
/** 형성 이후 마감봉이 존에 겹친 최소 횟수 (현재봉 포함) — 1회=첫터치 금지 */
export const BPR_RETEST_MIN_TOUCHES = 2;
export const BPR_RETEST_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'SOLUSDT',
] as const;

export type BprRetestDirection = 'LONG' | 'SHORT';

export type BprRetestSignal = {
  symbol: string;
  timeframe: typeof BPR_RETEST_TF;
  direction: BprRetestDirection;
  entry: number;
  sl: number;
  tp1: number;
  signalId: string;
  noteKo: string;
  closedBarTime: number;
  longPct: number;
  shortPct: number;
  bprTop: number;
  bprBot: number;
  leverage: number;
  touchCount: number;
  estimateGap: number;
};

function barOverlapsZone(
  hi: number,
  lo: number,
  closePx: number,
  zone: { top: number; bottom: number }
): boolean {
  return (
    priceTouchesBpr(closePx, zone) ||
    priceTouchesBpr(lo, zone) ||
    priceTouchesBpr(hi, zone) ||
    (lo <= zone.top && hi >= zone.bottom)
  );
}

/** 봉 전체가 BPR 밖(완충 포함) */
function barFullyOutside(
  hi: number,
  lo: number,
  zone: { top: number; bottom: number },
  padPct = 0.0004
): boolean {
  const mid = (zone.top + zone.bottom) / 2;
  const pad = mid * padPct;
  return hi < zone.bottom - pad || lo > zone.top + pad;
}

function closeReclaimOk(
  direction: BprRetestDirection,
  closePx: number,
  zone: IctBprZone
): boolean {
  const mid = zone.midpoint;
  if (direction === 'LONG') return closePx >= mid * 0.998;
  return closePx <= mid * 1.002;
}

/**
 * 형성봉 이후 ~ 마감봉까지 터치 횟수·이탈 여부.
 * 재터치 = 이탈 1회 이상 후 다시 겹침 + 터치횟수≥minTouches.
 */
export function analyzeBprRetestQuality(params: {
  candles: Candle[];
  zone: IctBprZone;
  closedIdx: number;
  minTouches?: number;
}): {
  ok: boolean;
  touchCount: number;
  leftOnce: boolean;
  reasonKo: string;
} {
  const { candles, zone, closedIdx } = params;
  const minTouches = Math.max(2, params.minTouches ?? BPR_RETEST_MIN_TOUCHES);
  const formed = Math.max(0, Math.min(closedIdx, zone.formedIndex));
  if (closedIdx <= formed) {
    return {
      ok: false,
      touchCount: 0,
      leftOnce: false,
      reasonKo: 'BPR형성봉·첫겹침 · 재터치대기',
    };
  }

  let touchCount = 0;
  let leftOnce = false;
  let inZone = false;

  for (let i = formed + 1; i <= closedIdx; i++) {
    const c = candles[i]!;
    const hi = Number(c.high);
    const lo = Number(c.low);
    const closePx = Number(c.close);
    if (!(hi >= lo) || !(closePx > 0)) continue;

    const overlap = barOverlapsZone(hi, lo, closePx, zone);
    const outside = barFullyOutside(hi, lo, zone);

    if (outside) {
      leftOnce = true;
      inZone = false;
      continue;
    }
    if (overlap) {
      if (!inZone) {
        touchCount += 1;
        inZone = true;
      }
    } else {
      inZone = false;
    }
  }

  if (!leftOnce) {
    return {
      ok: false,
      touchCount,
      leftOnce: false,
      reasonKo: `BPR이탈없음 · 터치${touchCount} · 재진입대기`,
    };
  }
  if (touchCount < minTouches) {
    return {
      ok: false,
      touchCount,
      leftOnce: true,
      reasonKo: `BPR터치${touchCount}<${minTouches} · 재터치대기`,
    };
  }

  const closed = candles[closedIdx]!;
  const nowOverlap = barOverlapsZone(
    Number(closed.high),
    Number(closed.low),
    Number(closed.close),
    zone
  );
  if (!nowOverlap) {
    return {
      ok: false,
      touchCount,
      leftOnce,
      reasonKo: `BPR재터치횟수${touchCount} · 마감봉미겹침`,
    };
  }

  return {
    ok: true,
    touchCount,
    leftOnce: true,
    reasonKo: `BPR재터치${touchCount}회 · 이탈후재진입`,
  };
}

/**
 * 마감봉 기준 BPR 재터치 스캔.
 * - 롱: 이탈후재터치(≥2) + 진입추정≥70 + 갭 + bias bullish
 * - 숏: 동일 + 저항추정≥70 + bias bearish
 */
export function scanBprRetestOnClosedBar(params: {
  symbol: string;
  candles: Candle[];
  longPct: number;
  shortPct: number;
  leverage?: number;
  pctMin?: number;
  pctGapMin?: number;
  minTouches?: number;
}): BprRetestSignal | null {
  const candles = params.candles;
  const n = candles.length;
  if (n < 12) return null;

  const closedIdx = n - 2;
  const closed = candles[closedIdx]!;
  const closePx = Number(closed.close);
  const hi = Number(closed.high);
  const lo = Number(closed.low);
  const closedT = Number(closed.time) || 0;
  if (!(closePx > 0) || !(hi >= lo) || !(closedT > 0)) return null;

  const pctMin = Math.max(50, Math.min(95, Number(params.pctMin) || BPR_RETEST_PCT_MIN));
  const pctGapMin = Math.max(
    0,
    Math.min(40, Number(params.pctGapMin) || BPR_RETEST_PCT_GAP_MIN)
  );
  const minTouches = Math.max(2, Number(params.minTouches) || BPR_RETEST_MIN_TOUCHES);
  const longPct = Math.max(0, Math.min(100, Number(params.longPct) || 0));
  const shortPct = Math.max(0, Math.min(100, Number(params.shortPct) || 0));
  const lev = resolveWick15mLeverage(params.leverage);

  const dual = aiZoneDualEstimateWait({
    longPct,
    shortPct,
    price: closePx,
    leverage: lev,
    direction: null,
  });
  if (dual.wait) return null;

  const zones = detectIctBpr(candles, {
    endExclusive: n - 1,
    maxZones: 3,
  });
  if (!zones.length) return null;

  /** 마감봉이 겹치는 존만 · 품질(이탈·횟수) 통과한 것 */
  type Cand = { zone: IctBprZone; quality: ReturnType<typeof analyzeBprRetestQuality> };
  const cands: Cand[] = [];
  for (const z of zones) {
    if (!barOverlapsZone(hi, lo, closePx, z)) continue;
    const quality = analyzeBprRetestQuality({
      candles,
      zone: z,
      closedIdx,
      minTouches,
    });
    if (!quality.ok) continue;
    cands.push({ zone: z, quality });
  }
  if (!cands.length) return null;

  cands.sort(
    (a, b) =>
      Math.abs(a.zone.midpoint - closePx) - Math.abs(b.zone.midpoint - closePx)
  );
  const { zone, quality } = cands[0]!;

  const longGap = longPct - shortPct;
  const shortGap = shortPct - longPct;
  const longOk =
    longPct >= pctMin &&
    longGap >= pctGapMin &&
    zone.bias === 'bullish' &&
    closeReclaimOk('LONG', closePx, zone);
  const shortOk =
    shortPct >= pctMin &&
    shortGap >= pctGapMin &&
    zone.bias === 'bearish' &&
    closeReclaimOk('SHORT', closePx, zone);

  if (!longOk && !shortOk) return null;

  let direction: BprRetestDirection;
  if (longOk && shortOk) {
    direction = longPct >= shortPct ? 'LONG' : 'SHORT';
  } else {
    direction = longOk ? 'LONG' : 'SHORT';
  }

  const estimateGap = direction === 'LONG' ? longGap : shortGap;
  const slRoe = FAST_SL_ROE_PCT;
  const tpRoe = FAST_TP1_ROE_PCT;
  const tp1 = roeTargetPrice(closePx, direction, lev, tpRoe / 100);
  const sl =
    direction === 'LONG'
      ? roeTargetPrice(closePx, 'SHORT', lev, slRoe / 100)
      : roeTargetPrice(closePx, 'LONG', lev, slRoe / 100);
  if (direction === 'LONG' && !(sl < closePx)) return null;
  if (direction === 'SHORT' && !(sl > closePx)) return null;

  const sym = String(params.symbol || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const symbol = sym.endsWith('USDT') ? sym : `${sym}USDT`;

  return {
    symbol,
    timeframe: BPR_RETEST_TF,
    direction,
    entry: closePx,
    sl,
    tp1,
    signalId: `bpr15-${symbol}-${direction}-${Math.round(closedT)}`,
    noteKo:
      direction === 'LONG'
        ? `BPR재터치${quality.touchCount}회 롱 · 진입${longPct.toFixed(0)}% 갭${estimateGap.toFixed(0)} · ${lev}x · SL-${slRoe}%·TP+${tpRoe}%`
        : `BPR재터치${quality.touchCount}회 숏 · 저항${shortPct.toFixed(0)}% 갭${estimateGap.toFixed(0)} · ${lev}x · SL-${slRoe}%·TP+${tpRoe}%`,
    closedBarTime: closedT,
    longPct,
    shortPct,
    bprTop: zone.top,
    bprBot: zone.bottom,
    leverage: lev,
    touchCount: quality.touchCount,
    estimateGap,
  };
}

export function listBprRetestSymbols(enabled?: string[] | null): string[] {
  const base = [...BPR_RETEST_SYMBOLS];
  if (!enabled?.length) return base;
  const set = new Set(enabled.map((s) => String(s).toUpperCase()));
  return base.filter((s) => set.has(s));
}
