/**
 * 폭락존 P0 합류 — 거래량쇼크·WAD·HotZone·간이 구조·SMC OB(상승/하락 생성).
 * 존 가격은 옮기지 않고, 나락확정/반등확정 게이트만 강화.
 * 확정 승률·수익 보장 아님. 카드/HUD 추가 없음.
 */
import type { Candle } from '@/types';
import { evalBarVolumeShock } from '@/lib/volumeShockMetrics';
import { wadBuyVolume, wadSellVolume, smaTotalVolumeAt } from '@/lib/volumeHistogramIntelligence';
import type { MergedDeskHotZoneEntry } from '@/lib/mergedDeskHotZoneEntry';
import type { WhaleBeamIntelPack } from '@/lib/whaleVolumeBeamIntel';
import {
  detectSmcStructureOrderBlocks,
  isObBrokenByClose,
} from '@/lib/smcStructureOrderBlocks';

export type DumpVolSide = 'buy' | 'sell' | 'mixed' | 'none';

export type DumpConfluenceSnap = {
  /** 매수 쪽 증거 점수 (반등확정) */
  bullScore: number;
  /** 매도 쪽 증거 점수 (나락·저항확정) */
  bearScore: number;
  side: DumpVolSide;
  shock: boolean;
  shockSide: 'long' | 'short' | null;
  wadWhaleBuy: boolean;
  wadWhaleSell: boolean;
  beamKo: '롱빔' | '숏빔' | '관망' | null;
  hotLongOverlap: boolean;
  hotShortOverlap: boolean;
  structureBreakDown: boolean;
  structureRejectUp: boolean;
  /** BOS 후 수요 OB 생성·합류 → 반등/상승 쪽 확정 가점 */
  bullObConfirm: boolean;
  /** BOS 후 공급 OB 생성·합류 → 나락/저항 쪽 확정 가점 */
  bearObConfirm: boolean;
  freshBullOb: boolean;
  freshBearOb: boolean;
  reasonsKo: string[];
};

const EMPTY: DumpConfluenceSnap = {
  bullScore: 0,
  bearScore: 0,
  side: 'none',
  shock: false,
  shockSide: null,
  wadWhaleBuy: false,
  wadWhaleSell: false,
  beamKo: null,
  hotLongOverlap: false,
  hotShortOverlap: false,
  structureBreakDown: false,
  structureRejectUp: false,
  bullObConfirm: false,
  bearObConfirm: false,
  freshBullOb: false,
  freshBearOb: false,
  reasonsKo: [],
};

function atrPad(candles: Candle[]): number {
  const n = candles.length;
  const mid = Number(candles[n - 1]?.close) || 1;
  if (n < 8) return mid * 0.002;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    const tr = Math.max(
      Number(a.high) - Number(a.low),
      Math.abs(Number(a.high) - Number(b.close)),
      Math.abs(Number(a.low) - Number(b.close))
    );
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  return Math.max(c > 0 ? s / c : mid * 0.006, mid * 0.0006);
}

function bandsOverlap(
  aTop: number,
  aBot: number,
  bTop: number,
  bBot: number,
  pad: number
): boolean {
  const aHi = Math.max(aTop, aBot);
  const aLo = Math.min(aTop, aBot);
  const bHi = Math.max(bTop, bBot);
  const bLo = Math.min(bTop, bBot);
  return aLo <= bHi + pad && aHi >= bLo - pad;
}

/**
 * 차트 TF 캔들 + (선택) Hot/고래빔으로 dump 합류 스냅샷.
 * zoneTop/Bot 있으면 Hot 겹침 판정.
 */
export function buildDumpConfluenceSnap(params: {
  chartCandles: Candle[];
  zoneTop?: number;
  zoneBot?: number;
  hotZones?: MergedDeskHotZoneEntry[] | null;
  whaleBeamIntel?: WhaleBeamIntelPack | null;
}): DumpConfluenceSnap {
  const candles = params.chartCandles ?? [];
  const n = candles.length;
  if (n < 12) return { ...EMPTY };

  const idx = n - 1;
  const last = candles[idx]!;
  const reasons: string[] = [];
  let bull = 0;
  let bear = 0;

  const shock = evalBarVolumeShock(candles, idx, null, { rvolMin: 1.8 });
  let shockSide: 'long' | 'short' | null = null;
  if (shock?.isShock) {
    shockSide = shock.side;
    if (shock.side === 'long') {
      bull += 2;
      reasons.push(`쇼크매수·${shock.primaryTag}`);
    } else {
      bear += 2;
      reasons.push(`쇼크매도·${shock.primaryTag}`);
    }
  }

  const buyV = wadBuyVolume(last);
  const sellV = wadSellVolume(last);
  const look = 34;
  let wadBuyFlag = false;
  let wadSellFlag = false;
  if (idx >= look) {
    let sumBuy = 0;
    let sumSell = 0;
    for (let j = idx - look + 1; j <= idx; j++) {
      sumBuy += wadBuyVolume(candles[j]!);
      sumSell += wadSellVolume(candles[j]!);
    }
    const avgBuy = sumBuy / look;
    const avgSell = sumSell / look;
    const thr = 2.2;
    wadBuyFlag = avgBuy > 0 && buyV >= avgBuy * thr;
    wadSellFlag = avgSell > 0 && sellV >= avgSell * thr;
    if (wadBuyFlag) {
      bull += 2;
      reasons.push('매수거래량↑');
    }
    if (wadSellFlag) {
      bear += 2;
      reasons.push('매도거래량↑');
    }

    const sma = smaTotalVolumeAt(candles, idx, 20);
    const tot = Math.max(0, last.volume || 0);
    if (sma > 0 && tot >= sma * 1.6) {
      if (buyV > sellV * 1.15) {
        bull += 1;
        if (!reasons.includes('매수우세')) reasons.push('매수우세');
      } else if (sellV > buyV * 1.15) {
        bear += 1;
        if (!reasons.includes('매도우세')) reasons.push('매도우세');
      }
    }
  }

  let beamKo: '롱빔' | '숏빔' | '관망' | null = null;
  const intel = params.whaleBeamIntel;
  if (intel?.live?.beamKo) {
    beamKo = intel.live.beamKo;
    if (beamKo === '롱빔') {
      bull += 2;
      reasons.push('롱빔');
    } else if (beamKo === '숏빔') {
      bear += 2;
      reasons.push('숏빔');
    }
  } else {
    /** 카탈로그 없을 때 — 최근 3봉 매수/매도 누적으로 의사 빔 */
    let b = 0;
    let s = 0;
    for (let j = Math.max(0, idx - 2); j <= idx; j++) {
      b += wadBuyVolume(candles[j]!);
      s += wadSellVolume(candles[j]!);
    }
    const tot3 = b + s;
    if (tot3 > 0 && b >= s * 1.35) {
      beamKo = '롱빔';
      bull += 1;
      reasons.push('매수빔≈');
    } else if (tot3 > 0 && s >= b * 1.35) {
      beamKo = '숏빔';
      bear += 1;
      reasons.push('매도빔≈');
    } else {
      beamKo = '관망';
    }
  }

  const pad = atrPad(candles);
  const zTop = Number(params.zoneTop);
  const zBot = Number(params.zoneBot);
  let hotLong = false;
  let hotShort = false;
  if (
    Number.isFinite(zTop) &&
    Number.isFinite(zBot) &&
    zTop > 0 &&
    zBot > 0 &&
    params.hotZones?.length
  ) {
    for (const hz of params.hotZones) {
      if (!bandsOverlap(zTop, zBot, hz.top, hz.bot, pad * 0.8)) continue;
      if (hz.side === 'LONG') {
        hotLong = true;
        bull += 1;
        reasons.push('Hot지지겹침');
      } else if (hz.side === 'SHORT') {
        hotShort = true;
        bear += 1;
        reasons.push('Hot저항겹침');
      }
    }
  }

  /** 간이 구조: 최근 스윙저 종가 이탈 / 스윙고 고점 거절 */
  const win = candles.slice(Math.max(0, n - 10), n - 1);
  let swingLo = Infinity;
  let swingHi = 0;
  for (const c of win) {
    swingLo = Math.min(swingLo, Number(c.low));
    swingHi = Math.max(swingHi, Number(c.high));
  }
  const price = Number(last.close);
  const hi = Number(last.high);
  const lo = Number(last.low);
  let structureBreakDown = false;
  let structureRejectUp = false;
  if (Number.isFinite(swingLo) && price < swingLo - pad * 0.15) {
    structureBreakDown = true;
    bear += 1;
    reasons.push('구조이탈↓');
  }
  if (
    Number.isFinite(swingHi) &&
    hi >= swingHi - pad * 0.2 &&
    price < swingHi - pad * 0.5 &&
    price < Number(last.open)
  ) {
    structureRejectUp = true;
    bear += 1;
    reasons.push('고점거절');
  }
  if (lo <= swingLo + pad * 0.35 && price > Number(last.open) && buyV > sellV) {
    bull += 1;
    reasons.push('저점방어');
  }

  /**
   * SMC OB: BOS/CHoCH 직전 반대색 봉 = OB.
   * 상승 돌파 후 수요OB 생성 → 반등/상승확정 쪽, 하락 돌파 후 공급OB → 나락/저항확정 쪽.
   * 폭락존(floor/ceiling)과 겹치면 합류 가점.
   */
  let bullObConfirm = false;
  let bearObConfirm = false;
  let freshBullOb = false;
  let freshBearOb = false;
  try {
    const { validObs, obs } = detectSmcStructureOrderBlocks(candles);
    const pool =
      validObs.length > 0
        ? validObs
        : obs.filter((o) => !isObBrokenByClose(o, candles));
    const zoneOk =
      Number.isFinite(zTop) && Number.isFinite(zBot) && zTop > 0 && zBot > 0;
    const seen = new Set<string>();
    const pushOnce = (tag: string) => {
      if (seen.has(tag)) return;
      seen.add(tag);
      reasons.push(tag);
    };
    for (const o of pool) {
      if (o.index < n - 48 && o.bosIndex < n - 20) continue;
      const fresh = o.bosIndex >= n - 16;
      const overlapsZone =
        zoneOk && bandsOverlap(zTop, zBot, o.high, o.low, pad * 0.9);
      const holdsAbove =
        o.bias === 'bullish' && price >= o.low - pad * 0.25 && lo >= o.low - pad;
      const rejectsBelow =
        o.bias === 'bearish' && price <= o.high + pad * 0.25 && hi <= o.high + pad;

      if (o.bias === 'bullish') {
        if (fresh) {
          freshBullOb = true;
          bull += 2;
          pushOnce('상승OB생성');
        }
        if (overlapsZone || holdsAbove) {
          bullObConfirm = true;
          bull += overlapsZone ? 2 : 1;
          pushOnce(overlapsZone ? '수요OB합류' : '수요OB지지');
        }
      } else {
        if (fresh) {
          freshBearOb = true;
          bear += 2;
          pushOnce('하락OB생성');
        }
        if (overlapsZone || rejectsBelow) {
          bearObConfirm = true;
          bear += overlapsZone ? 2 : 1;
          pushOnce(overlapsZone ? '공급OB합류' : '공급OB저항');
        }
      }
    }
    if (freshBullOb || bullObConfirm) bullObConfirm = true;
    if (freshBearOb || bearObConfirm) bearObConfirm = true;
  } catch {
    /* OB 실패 시 기존 합류만 유지 */
  }

  let side: DumpVolSide = 'none';
  if (bull >= bear + 1 && bull > 0) side = 'buy';
  else if (bear >= bull + 1 && bear > 0) side = 'sell';
  else if (bull > 0 && bear > 0) side = 'mixed';

  return {
    bullScore: bull,
    bearScore: bear,
    side,
    shock: Boolean(shock?.isShock),
    shockSide,
    wadWhaleBuy: wadBuyFlag,
    wadWhaleSell: wadSellFlag,
    beamKo,
    hotLongOverlap: hotLong,
    hotShortOverlap: hotShort,
    structureBreakDown,
    structureRejectUp,
    bullObConfirm,
    bearObConfirm,
    freshBullOb,
    freshBearOb,
    reasonsKo: reasons.slice(0, 8),
  };
}

/** 반등확정용 매수 합류 충분? */
export function dumpBullConfluenceOk(c: DumpConfluenceSnap | null | undefined): boolean {
  if (!c) return false;
  return (
    c.bullScore >= 2 ||
    (c.shock && c.shockSide === 'long') ||
    c.beamKo === '롱빔' ||
    c.bullObConfirm ||
    c.freshBullOb
  );
}

/** 나락·저항확정용 매도 합류 충분? */
export function dumpBearConfluenceOk(c: DumpConfluenceSnap | null | undefined): boolean {
  if (!c) return false;
  return (
    c.bearScore >= 2 ||
    (c.shock && c.shockSide === 'short') ||
    c.beamKo === '숏빔' ||
    c.structureBreakDown ||
    c.bearObConfirm ||
    c.freshBearOb
  );
}
