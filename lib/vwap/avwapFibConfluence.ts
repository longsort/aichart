/**
 * AVWAP 줄선 **동일 색** 피보나치·골든포켓·헌팅열림 합류.
 * - 고점 앵커(초록/분홍): 고점→이후 스윙저 피보 · GP · 고가 위 헌팅 열림
 * - 저점 앵커(하늘/보라): 저점→이후 스윙고 피보 · GP · 저가 아래 헌팅 열림
 * - 0.5 / 0.618: 레그 중간·골든포켓 가장자리 — **먼 거리면 참고만**(선물 진입 아님)
 * - 정밀 타점: `avwapPrecisionEntry` (현재가±ATR 합류 E/SL/TP1)
 * 기존 AVWAP 줄선·마커 유지. 확정 승률·확정 수익 문구 없음.
 */
import type { Candle, OverlayItem } from '@/types';
import { candleBarDurationSec } from '@/lib/candleTfDuration';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { MergedDeskAnchoredVwapPack } from '@/lib/mergedDeskAnchoredVwap';
import { inGoldenPocket } from '@/lib/fibonacci';
import {
  buildAvwapPrecisionEntryPack,
  isAvwapFibLevelDeepRef,
  type AvwapPrecisionEntryPack,
} from './avwapPrecisionEntry';

/** AVWAP 차트 색과 동일 */
export const AVWAP_FIB_COLORS = {
  highExt: '#4ade80',
  highOpen: '#f87171',
  lowExt: '#38bdf8',
  lowOpen: '#a78bfa',
} as const;

/** 헌팅 열림 — 0 너머(고 위) / 1 너머(저 아래) */
const HUNT_EXT = 0.272;

export type AvwapFibBias = 'long' | 'short' | 'wait';

export type AvwapFibSettleKo =
  | '안착확정'
  | '안착대기'
  | '돌파실패'
  | '골든포켓'
  | '헌팅열림'
  | '되돌림'
  | '반등'
  | '관찰';

export type AvwapFibLeg = {
  role: 'high' | 'low';
  fibHigh: number;
  fibLow: number;
  tStart: number;
  tEnd: number;
  anchorIndex: number;
  oppositeIndex: number;
  /** true = 저→고 상승레그, false = 고→저 하락레그 */
  risingLeg: boolean;
  goldenTop: number;
  goldenBot: number;
  huntAboveTop: number;
  huntAboveBot: number;
  huntBelowTop: number;
  huntBelowBot: number;
  lastVwap: number | null;
  settleKo: AvwapFibSettleKo;
  bias: AvwapFibBias;
  noteKo: string;
};

export type AvwapFibConfluencePack = {
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
  summaryKo: string;
  legs: AvwapFibLeg[];
  /** 선물용 근접 정밀 타점 (깊은 0.5/0.618과 분리) */
  precision?: AvwapPrecisionEntryPack | null;
};

function atrApprox(candles: Candle[], end: number): number {
  const n = Math.min(14, end);
  if (n < 2) return Math.abs(Number(candles[end]?.close) || 1) * 0.004;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, end - n + 1); i <= end; i++) {
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
  return c > 0 ? s / c : Math.abs(Number(candles[end]?.close) || 1) * 0.004;
}

function lastLineValue(line: Array<{ time: number; value: number }> | undefined): number | null {
  if (!line?.length) return null;
  const v = Number(line[line.length - 1]!.value);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function fibPrice(fibHigh: number, fibLow: number, ratio: number): number {
  return fibHigh - ratio * (fibHigh - fibLow);
}

/** 고점 앵커 이후 확정봉 최저 → 하락레그 피보 하단 */
function findPostAnchorSwingLow(candles: Candle[], anchorIndex: number): number | null {
  const end = Math.max(0, candles.length - 2);
  if (anchorIndex >= end) return null;
  let minI = -1;
  let minL = Infinity;
  for (let i = anchorIndex + 1; i <= end; i++) {
    const l = Number(candles[i]?.low);
    if (!Number.isFinite(l)) continue;
    if (l < minL) {
      minL = l;
      minI = i;
    }
  }
  return minI >= 0 ? minI : null;
}

/** 저점 앵커 이후 확정봉 최고 → 상승레그 피보 상단 */
function findPostAnchorSwingHigh(candles: Candle[], anchorIndex: number): number | null {
  const end = Math.max(0, candles.length - 2);
  if (anchorIndex >= end) return null;
  let maxI = -1;
  let maxH = -Infinity;
  for (let i = anchorIndex + 1; i <= end; i++) {
    const h = Number(candles[i]?.high);
    if (!Number.isFinite(h)) continue;
    if (h > maxH) {
      maxH = h;
      maxI = i;
    }
  }
  return maxI >= 0 ? maxI : null;
}

function classifyLeg(params: {
  price: number;
  fibHigh: number;
  fibLow: number;
  goldenTop: number;
  goldenBot: number;
  huntAboveTop: number;
  huntAboveBot: number;
  huntBelowTop: number;
  huntBelowBot: number;
  lastVwap: number | null;
  role: 'high' | 'low';
  atr: number;
}): { settleKo: AvwapFibSettleKo; bias: AvwapFibBias; noteKo: string } {
  const {
    price,
    fibHigh,
    fibLow,
    goldenTop,
    goldenBot,
    huntAboveTop,
    huntAboveBot,
    huntBelowTop,
    huntBelowBot,
    lastVwap,
    role,
    atr,
  } = params;
  const gpLo = Math.min(goldenBot, goldenTop);
  const gpHi = Math.max(goldenBot, goldenTop);
  const inGp = price >= gpLo && price <= gpHi;
  const inHuntHi = price >= huntAboveBot && price <= huntAboveTop;
  const inHuntLo = price >= huntBelowBot && price <= huntBelowTop;
  const nearVwap =
    lastVwap != null && atr > 0 ? Math.abs(price - lastVwap) <= atr * 0.45 : false;
  const aboveVwap = lastVwap != null ? price >= lastVwap : null;

  if (inHuntHi) {
    return {
      settleKo: '헌팅열림',
      bias: role === 'high' ? 'short' : 'wait',
      noteKo: '고가 위 유동성 헌팅 구간(조건부) · 회수·거부 확인',
    };
  }
  if (inHuntLo) {
    return {
      settleKo: '헌팅열림',
      bias: role === 'low' ? 'long' : 'wait',
      noteKo: '저가 아래 유동성 헌팅 구간(조건부) · 회수·거부 확인',
    };
  }
  if (inGp) {
    if (role === 'high') {
      /** 고점 피보 GP = 하락 후 되돌림 매도 관찰 / AVWAP 아래면 숏 쪽 */
      if (aboveVwap === false) {
        return {
          settleKo: '골든포켓',
          bias: 'short',
          noteKo: '고점피보 골든 + AVWAP 하방 · 숏 되돌림 관찰',
        };
      }
      if (nearVwap) {
        return {
          settleKo: '안착대기',
          bias: 'wait',
          noteKo: '골든×AVWAP 합류 · 안착 확인 전 대기',
        };
      }
      return {
        settleKo: '되돌림',
        bias: 'wait',
        noteKo: '고점피보 골든포켓 되돌림 구간',
      };
    }
    if (aboveVwap === true) {
      return {
        settleKo: '골든포켓',
        bias: 'long',
        noteKo: '저점피보 골든 + AVWAP 상방 · 롱 반등 관찰',
      };
    }
    if (nearVwap) {
      return {
        settleKo: '안착대기',
        bias: 'wait',
        noteKo: '골든×AVWAP 합류 · 안착 확인 전 대기',
      };
    }
    return {
      settleKo: '반등',
      bias: 'wait',
      noteKo: '저점피보 골든포켓 반등 구간',
    };
  }

  /** AVWAP 재테스트 홀드 근사 */
  if (nearVwap && lastVwap != null) {
    if (role === 'high' && price < fibHigh && price > (fibHigh + fibLow) / 2) {
      return {
        settleKo: aboveVwap === false ? '안착확정' : '안착대기',
        bias: aboveVwap === false ? 'short' : 'wait',
        noteKo: 'AVWAP 재테스트 · 고점피보 상단권',
      };
    }
    if (role === 'low' && price > fibLow && price < (fibHigh + fibLow) / 2) {
      return {
        settleKo: aboveVwap === true ? '안착확정' : '안착대기',
        bias: aboveVwap === true ? 'long' : 'wait',
        noteKo: 'AVWAP 재테스트 · 저점피보 하단권',
      };
    }
  }

  if (price > fibHigh) {
    return {
      settleKo: '돌파실패',
      bias: 'wait',
      noteKo: '피보 0(고) 위 · 헌팅/연장 관찰',
    };
  }
  if (price < fibLow) {
    return {
      settleKo: '돌파실패',
      bias: 'wait',
      noteKo: '피보 1(저) 아래 · 헌팅/연장 관찰',
    };
  }
  return {
    settleKo: '관찰',
    bias: 'wait',
    noteKo: 'AVWAP 피보 레그 내 관찰',
  };
}

function buildLegFromHigh(
  candles: Candle[],
  pack: MergedDeskAnchoredVwapPack,
  timeframe: string
): AvwapFibLeg | null {
  const n = candles.length;
  const ai = pack.anchorIndex;
  if (ai < 0 || ai >= n - 2) return null;
  const opp = findPostAnchorSwingLow(candles, ai);
  if (opp == null) return null;
  const fibHigh = Number(candles[ai]!.high);
  const fibLow = Number(candles[opp]!.low);
  if (!(fibHigh > fibLow) || !Number.isFinite(fibHigh) || !Number.isFinite(fibLow)) return null;

  const end = Math.max(0, n - 2);
  const atr = atrApprox(candles, end);
  const range = fibHigh - fibLow;
  const huntPad = Math.max(atr * 0.35, range * HUNT_EXT);
  const goldenTop = Math.max(fibPrice(fibHigh, fibLow, 0.382), fibPrice(fibHigh, fibLow, 0.618));
  const goldenBot = Math.min(fibPrice(fibHigh, fibLow, 0.382), fibPrice(fibHigh, fibLow, 0.618));
  const huntAboveBot = fibHigh;
  const huntAboveTop = fibHigh + huntPad;
  const huntBelowTop = fibLow;
  const huntBelowBot = fibLow - huntPad;
  const lastVwap = lastLineValue(pack.extremeLine) ?? lastLineValue(pack.openLine);
  const price = Number(candles[end]!.close);
  const cls = classifyLeg({
    price,
    fibHigh,
    fibLow,
    goldenTop,
    goldenBot,
    huntAboveTop,
    huntAboveBot,
    huntBelowTop,
    huntBelowBot,
    lastVwap,
    role: 'high',
    atr,
  });
  const tLast = Number(candles[n - 1]!.time);
  const barSec = candleBarDurationSec(timeframe, tLast);
  return {
    role: 'high',
    fibHigh,
    fibLow,
    tStart: Number(candles[ai]!.time),
    tEnd: tLast + 12 * barSec,
    anchorIndex: ai,
    oppositeIndex: opp,
    risingLeg: false,
    goldenTop,
    goldenBot,
    huntAboveTop,
    huntAboveBot,
    huntBelowTop,
    huntBelowBot,
    lastVwap,
    settleKo: cls.settleKo,
    bias: cls.bias,
    noteKo: cls.noteKo,
  };
}

function buildLegFromLow(
  candles: Candle[],
  pack: MergedDeskAnchoredVwapPack,
  timeframe: string
): AvwapFibLeg | null {
  const n = candles.length;
  const ai = pack.anchorIndex;
  if (ai < 0 || ai >= n - 2) return null;
  const opp = findPostAnchorSwingHigh(candles, ai);
  if (opp == null) return null;
  const fibLow = Number(candles[ai]!.low);
  const fibHigh = Number(candles[opp]!.high);
  if (!(fibHigh > fibLow) || !Number.isFinite(fibHigh) || !Number.isFinite(fibLow)) return null;

  const end = Math.max(0, n - 2);
  const atr = atrApprox(candles, end);
  const range = fibHigh - fibLow;
  const huntPad = Math.max(atr * 0.35, range * HUNT_EXT);
  const goldenTop = Math.max(fibPrice(fibHigh, fibLow, 0.382), fibPrice(fibHigh, fibLow, 0.618));
  const goldenBot = Math.min(fibPrice(fibHigh, fibLow, 0.382), fibPrice(fibHigh, fibLow, 0.618));
  const huntAboveBot = fibHigh;
  const huntAboveTop = fibHigh + huntPad;
  const huntBelowTop = fibLow;
  const huntBelowBot = fibLow - huntPad;
  const lastVwap = lastLineValue(pack.extremeLine) ?? lastLineValue(pack.openLine);
  const price = Number(candles[end]!.close);
  const cls = classifyLeg({
    price,
    fibHigh,
    fibLow,
    goldenTop,
    goldenBot,
    huntAboveTop,
    huntAboveBot,
    huntBelowTop,
    huntBelowBot,
    lastVwap,
    role: 'low',
    atr,
  });
  const tLast = Number(candles[n - 1]!.time);
  const barSec = candleBarDurationSec(timeframe, tLast);
  return {
    role: 'low',
    fibHigh,
    fibLow,
    tStart: Number(candles[ai]!.time),
    tEnd: tLast + 12 * barSec,
    anchorIndex: ai,
    oppositeIndex: opp,
    risingLeg: true,
    goldenTop,
    goldenBot,
    huntAboveTop,
    huntAboveBot,
    huntBelowTop,
    huntBelowBot,
    lastVwap,
    settleKo: cls.settleKo,
    bias: cls.bias,
    noteKo: cls.noteKo,
  };
}

function rgbaFromHex(hex: string, a: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(148,163,184,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function overlaysForLeg(leg: AvwapFibLeg, price: number, atr: number): OverlayItem[] {
  const primary = leg.role === 'high' ? AVWAP_FIB_COLORS.highExt : AVWAP_FIB_COLORS.lowExt;
  const secondary = leg.role === 'high' ? AVWAP_FIB_COLORS.highOpen : AVWAP_FIB_COLORS.lowOpen;
  const tag = leg.role === 'high' ? 'AVWAP고' : 'AVWAP저';
  const idBase = `merged-desk-avwap-fib-${leg.role}`;
  const out: OverlayItem[] = [];
  const gpMid = (leg.goldenTop + leg.goldenBot) / 2;
  const gpNear = !isAvwapFibLevelDeepRef(price, gpMid, atr);

  /** 핵심 되돌림 — 먼 0.5/0.618은 「깊은·참고」(롱/숏 타점 아님) */
  const keyRets = [0, 0.236, 0.382, 0.5, 0.618, 1] as const;
  for (const r of keyRets) {
    const p = fibPrice(leg.fibHigh, leg.fibLow, r);
    const deep = isAvwapFibLevelDeepRef(price, p, atr);
    const isGpEdge = r === 0.382 || r === 0.618;
    const shallow = r === 0.236 || r === 0.382;
    const col = isGpEdge || r === 0.5 ? secondary : primary;
    let label = `${tag}·${r}`;
    if (isGpEdge) label = deep ? `${tag}·깊은GP${r}(참고)` : `${tag}·GP${r}`;
    else if (r === 0.5) label = deep ? `${tag}·깊은0.5(참고)` : `${tag}·0.5`;
    else if (r === 0.236) label = deep ? `${tag}·0.236(참고)` : `${tag}·얕은0.236`;
    out.push({
      id: `${idBase}-ret-${String(r).replace('.', '-')}`,
      kind: 'fibLine',
      label,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: leg.tStart,
      time2: leg.tEnd,
      price1: p,
      price2: p,
      confidence: deep ? 48 : shallow || isGpEdge ? 86 : 78,
      color: col,
      lineLabelColor: col,
      lineDash: deep || (r !== 0 && r !== 1) ? '5 4' : undefined,
      lineStrokeWidth: deep ? 1.1 : isGpEdge || shallow ? 2.4 : 1.6,
      category: 'chartPrimeTrendChannels',
      noProject: true,
      zoneFillPreserve: true,
      overlayZoneExtraClass: deep
        ? 'merged-desk-avwap-fib merged-desk-avwap-fib-deep-ref merged-desk-trendline-keep'
        : 'merged-desk-avwap-fib merged-desk-trendline-keep',
      labelTooltip: deep
        ? `${tag} 피보 ${r} · 현재가에서 멀음 · 선물 진입 타점 아님(깊은 되돌림 참고)`
        : `${tag} 피보 ${r} · ${leg.noteKo} (조건부 참고 · 확정 아님)`,
      structureBias: leg.risingLeg ? 'bullish' : 'bearish',
    });
  }

  /** 골든포켓 면 — 멀면 참고면만(핫존 클래스 제거) */
  out.push({
    id: `${idBase}-gp`,
    kind: 'zone',
    label: gpNear
      ? `${tag}·골든포켓·${leg.settleKo}`
      : `${tag}·골든(깊은참고)·${leg.settleKo}`,
    zoneFaceBase: `${tag}골든`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: leg.tStart,
    time2: leg.tEnd,
    price1: leg.goldenTop,
    price2: leg.goldenBot,
    confidence: gpNear ? 88 : 52,
    color: rgbaFromHex(primary, gpNear ? 0.42 : 0.18),
    lineLabelColor: primary,
    category: 'chartPrimeTrendChannels',
    zoneFillPreserve: true,
    overlayZoneExtraClass: gpNear
      ? 'merged-desk-avwap-fib merged-desk-avwap-fib-gp merged-desk-hotzone-entry'
      : 'merged-desk-avwap-fib merged-desk-avwap-fib-gp merged-desk-avwap-fib-deep-ref',
    labelTooltip: gpNear
      ? `${tag} 골든포켓 0.382~0.618 · ${leg.noteKo} · 터치+합류 시에만 관찰`
      : `${tag} 골든포켓 · 현재가에서 멀음 · 선물 즉시 롱/숏 자리 아님`,
    structureBias: leg.risingLeg ? 'bullish' : 'bearish',
  });

  /** 헌팅 열림 — 고 위 / 저 아래 */
  out.push({
    id: `${idBase}-hunt-hi`,
    kind: 'zone',
    label: `${tag}·헌팅열림·상`,
    zoneFaceBase: `${tag}헌팅상`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: leg.tStart,
    time2: leg.tEnd,
    price1: leg.huntAboveTop,
    price2: leg.huntAboveBot,
    confidence: 72,
    color: rgbaFromHex(secondary, 0.28),
    lineLabelColor: secondary,
    category: 'chartPrimeTrendChannels',
    zoneFillPreserve: true,
    overlayZoneExtraClass: 'merged-desk-avwap-fib merged-desk-avwap-fib-hunt',
    labelTooltip: `${tag} 고가 위 유동성 헌팅 열림(EQ고·스톱) · 확정 신호 아님`,
    structureBias: 'bearish',
  });
  out.push({
    id: `${idBase}-hunt-lo`,
    kind: 'zone',
    label: `${tag}·헌팅열림·하`,
    zoneFaceBase: `${tag}헌팅하`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    time1: leg.tStart,
    time2: leg.tEnd,
    price1: leg.huntBelowTop,
    price2: leg.huntBelowBot,
    confidence: 72,
    color: rgbaFromHex(secondary, 0.28),
    lineLabelColor: secondary,
    category: 'chartPrimeTrendChannels',
    zoneFillPreserve: true,
    overlayZoneExtraClass: 'merged-desk-avwap-fib merged-desk-avwap-fib-hunt',
    labelTooltip: `${tag} 저가 아래 유동성 헌팅 열림(EQ저·스톱) · 확정 신호 아님`,
    structureBias: 'bullish',
  });

  return out;
}

function priceLinesForLeg(leg: AvwapFibLeg, price: number, atr: number): AtlasPulsePriceLine[] {
  const primary = leg.role === 'high' ? AVWAP_FIB_COLORS.highExt : AVWAP_FIB_COLORS.lowExt;
  const secondary = leg.role === 'high' ? AVWAP_FIB_COLORS.highOpen : AVWAP_FIB_COLORS.lowOpen;
  const tag = leg.role === 'high' ? 'AVWAP고' : 'AVWAP저';
  const gpHi = Math.max(leg.goldenTop, leg.goldenBot);
  const gpLo = Math.min(leg.goldenTop, leg.goldenBot);
  const midGp = (gpHi + gpLo) / 2;
  const gpDeep = isAvwapFibLevelDeepRef(price, midGp, atr);
  /** 깊은 GP는 허브/진입 가격선으로 안 올림 — 점선 참고만 */
  if (gpDeep) {
    return [
      {
        price: midGp,
        color: secondary,
        title: `${tag}·깊은골든(참고)`,
        lineWidth: 1,
        lineStyle: 'dotted',
        axisLabel: false,
      },
    ];
  }
  return [
    {
      price: gpHi,
      color: primary,
      title: `${tag}·GP0.382`,
      lineWidth: 2,
      lineStyle: 'dashed',
      axisLabel: false,
    },
    {
      price: gpLo,
      color: primary,
      title: `${tag}·GP0.618`,
      lineWidth: 2,
      lineStyle: 'dashed',
      axisLabel: false,
    },
    {
      price: midGp,
      color: secondary,
      title: `${tag}·골든·${leg.settleKo}`,
      lineWidth: 2,
      lineStyle: 'solid',
      axisLabel: false,
    },
    {
      price:
        leg.role === 'high'
          ? (leg.huntAboveTop + leg.huntAboveBot) / 2
          : (leg.huntBelowTop + leg.huntBelowBot) / 2,
      color: secondary,
      title: `${tag}·헌팅열림`,
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: false,
    },
  ];
}

/**
 * AVWAP 고/저 앵커 기준 피보·골든·헌팅 합류 팩.
 * 줄선은 ChartView가 유지 · 여기선 오버레이·가격선만.
 * 깊은 0.5/0.618 ≠ 선물 진입 · 정밀 타점은 precision 팩.
 */
export function buildAvwapFibConfluencePack(params: {
  candles: Candle[];
  timeframe: string;
  highPack: MergedDeskAnchoredVwapPack | null;
  lowPack: MergedDeskAnchoredVwapPack | null;
}): AvwapFibConfluencePack {
  const candles = params.candles ?? [];
  const empty: AvwapFibConfluencePack = {
    overlays: [],
    priceLines: [],
    summaryKo: 'AVWAP피보 · 대기',
    legs: [],
    precision: null,
  };
  if (candles.length < 30) return empty;

  const legs: AvwapFibLeg[] = [];
  if (params.highPack) {
    const leg = buildLegFromHigh(candles, params.highPack, params.timeframe);
    if (leg) legs.push(leg);
  }
  if (params.lowPack) {
    const leg = buildLegFromLow(candles, params.lowPack, params.timeframe);
    if (leg) legs.push(leg);
  }
  if (!legs.length) return empty;

  const end = Math.max(0, candles.length - 2);
  const price = Number(candles[end]!.close);
  const atr = atrApprox(candles, end);

  const overlays: OverlayItem[] = [];
  const priceLines: AtlasPulsePriceLine[] = [];
  for (const leg of legs) {
    overlays.push(...overlaysForLeg(leg, price, atr));
    priceLines.push(...priceLinesForLeg(leg, price, atr));
  }

  const precision = buildAvwapPrecisionEntryPack({
    candles,
    timeframe: params.timeframe,
    legs,
    highPack: params.highPack,
    lowPack: params.lowPack,
  });
  overlays.push(...precision.overlays);
  priceLines.push(...precision.priceLines);

  const primary = legs.find((l) => l.bias !== 'wait') ?? legs[0]!;
  const biasKo =
    primary.bias === 'long' ? '롱관찰' : primary.bias === 'short' ? '숏관찰' : '대기';
  const inGpNow = inGoldenPocket(
    Number(candles[Math.max(0, candles.length - 2)]!.close),
    primary.fibHigh,
    primary.fibLow
  );
  const precN = precision.candidates.length;
  const summaryKo = (
    precN > 0
      ? `AVWAP피보·${biasKo}·정밀${precN}${inGpNow ? '·GP터치' : ''}`
      : `AVWAP피보·${biasKo}·${primary.settleKo}${inGpNow ? '·GP' : ''}·깊은피보≠진입`
  ).slice(0, 56);

  return { overlays, priceLines, summaryKo, legs, precision };
}
