/**
 * 파랑빨강띠 통로 색 — 롱=초록 / 숏=빨강.
 * 하단 지지 반등·상단 저항 하락 시 연동 데이터를 모아 즉시 전환.
 * 확정 수익·승률 보장 아님.
 */
import type { Candle } from '@/types';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import type { MergedDeskRbVolumeSyncPack } from '@/lib/mergedDeskRbVolumeSync';
import type { MergedDeskHotZoneEntry } from '@/lib/mergedDeskHotZoneEntry';
import {
  evaluateMergedDeskRbPocRelation,
  mergedDeskRbStyleWeights,
  type MergedDeskRbTradeStyle,
} from '@/lib/mergedDeskRbAiStyleBrain';

export type MergedDeskRbCorridorPaintSide = 'long' | 'short';
export type MergedDeskRbCorridorPaintTrigger =
  | 'break-down'
  | 'break-up'
  | 'path'
  | 'rail-bounce'
  | 'rail-drop'
  | 'stance'
  | 'flow'
  | 'poc'
  | 'slope';

export type MergedDeskRbCorridorPaint = {
  side: MergedDeskRbCorridorPaintSide;
  bear: boolean;
  trigger: MergedDeskRbCorridorPaintTrigger;
  atSupport: boolean;
  atResist: boolean;
  summaryKo: string;
  tradeStyle?: MergedDeskRbTradeStyle;
  styleKo?: string;
  pocKo?: string;
};

type EdgeSnap = {
  pos?: number;
  lower?: string;
  upper?: string;
  lowerSettle?: string;
  upperSettle?: string;
};

/** 통로 안에서 최근 봉이 이미 하락/상승 중인지 — 기울기 반전을 기다리지 않음 */
function detectCorridorPath(
  rows: Candle[],
  g: { tipUpper: number; tipLower: number; tipMid?: number } | null,
  lookback = 4,
  minSteps = 2
): 'up' | 'down' | 'chop' {
  const n = rows.length;
  const lb = Math.max(3, Math.min(8, Math.round(lookback)));
  if (n < lb + 1) return 'chop';
  const win = rows.slice(-lb);
  const closes = win.map((c) => Number(c.close));
  const highs = win.map((c) => Number(c.high));
  const lows = win.map((c) => Number(c.low));
  if (closes.some((x) => !(x > 0))) return 'chop';
  let downSteps = 0;
  let upSteps = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i]! < closes[i - 1]!) downSteps += 1;
    else if (closes[i]! > closes[i - 1]!) upSteps += 1;
  }
  const last = closes.length - 1;
  const midI = Math.max(0, Math.floor(last / 2));
  const lowerHighs = highs[last]! < highs[midI]! && highs[last - 1]! <= highs[0]! * 1.001;
  const higherLows = lows[last]! > lows[midI]! && lows[last - 1]! >= lows[0]! * 0.999;
  const mid = g ? (g.tipUpper + g.tipLower) / 2 : closes[last]!;
  const inLower = closes[last]! <= mid;
  const inUpper = closes[last]! >= mid;
  const netDn = closes[last]! < closes[0]!;
  const netUp = closes[last]! > closes[0]!;
  const need = Math.max(2, Math.min(4, Math.round(minSteps)));
  if (downSteps >= need && netDn && (lowerHighs || inLower)) return 'down';
  if (upSteps >= need && netUp && (higherLows || inUpper)) return 'up';
  return 'chop';
}

export function computeMergedDeskRbCorridorPaint(params: {
  candles: Candle[];
  geoms?: MergedDeskChannelGeom[] | null;
  volSync?: MergedDeskRbVolumeSyncPack | null;
  stanceSide?: string | null;
  edgeReads?: EdgeSnap[] | null;
  primaryDir?: string | null;
  primaryMode?: string | null;
  primaryEdge?: string | null;
  aiStates?: string[] | null;
  hotZones?: MergedDeskHotZoneEntry[] | null;
  rocketDir?: string | null;
  schoolLongN?: number | null;
  schoolShortN?: number | null;
  schoolWaitN?: number | null;
  /** VRVP 최다거래(POC) — 파랑빨강띠 연동 */
  vrvpPoc?: number | null;
  vrvpVaLow?: number | null;
  vrvpVaHigh?: number | null;
  /** 단타·스윙·중투 */
  tradeStyle?: MergedDeskRbTradeStyle | null;
}): MergedDeskRbCorridorPaint {
  const rows = params.candles;
  const n = rows.length;
  const styleW = mergedDeskRbStyleWeights(params.tradeStyle);
  const g =
    params.geoms?.find((x) => x.primary) ??
    params.geoms?.find((x) => x.horizon === styleW.preferredHorizon) ??
    params.geoms?.find((x) => x.horizon === 'short') ??
    params.geoms?.[0] ??
    null;
  const last = n > 0 ? rows[n - 1]! : null;
  const prev = n > 1 ? rows[n - 2]! : null;
  const close = Number(last?.close) || 0;
  const open = Number(last?.open) || 0;
  const high = Number(last?.high) || close;
  const low = Number(last?.low) || close;
  const span = g && g.tipUpper > g.tipLower ? g.tipUpper - g.tipLower : Math.max(Math.abs(close) * 0.008, 1);
  const pos =
    g && span > 0 ? (close - g.tipLower) / span : 0.5;
  const atSupport = Boolean(g && (pos <= 0.28 || low <= g.tipLower + span * 0.1));
  const atResist = Boolean(g && (pos >= 0.72 || high >= g.tipUpper - span * 0.1));
  const bullBar = close > open && close >= (high + low) / 2;
  const bearBar = close < open && close <= (high + low) / 2;
  const prevBull = prev ? Number(prev.close) > Number(prev.open) : false;
  const prevBear = prev ? Number(prev.close) < Number(prev.open) : false;

  let longN = 0;
  let shortN = 0;
  let railLong = false;
  let railShort = false;
  let pocTriggered = false;

  if (g) {
    const hMult =
      g.horizon === 'long' ? styleW.longMult : g.horizon === 'short' ? styleW.shortMult : 1.1;
    if (!g.descending) longN += Math.round(8 * hMult);
    else shortN += Math.round(8 * hMult);
  }

  const vs = params.volSync;
  if (vs) {
    const rm = styleW.reactionMult;
    if (vs.side === 'up') longN += Math.round(10 * rm);
    else if (vs.side === 'down') shortN += Math.round(10 * rm);
    if (vs.buyPct >= 0.56) longN += Math.round(8 * rm);
    if (vs.sellPct >= 0.56) shortN += Math.round(8 * rm);
    if (vs.confirm === 'confirm') {
      if (vs.side === 'up') longN += Math.round(6 * rm);
      if (vs.side === 'down') shortN += Math.round(6 * rm);
    }
    if (vs.whaleHint === 'long') longN += Math.round(6 * rm);
    if (vs.whaleHint === 'short') shortN += Math.round(6 * rm);
  }

  const st = String(params.stanceSide || '');
  if (st === 'LONG') longN += 14;
  if (st === 'SHORT') shortN += 14;

  const ai = params.aiStates ?? [];
  for (const s of ai) {
    if (s === 'buyHeavy' || s === 'holdSupport' || s === 'battleLong' || s === 'stSupport') longN += 6;
    if (s === 'sellHeavy' || s === 'holdResist' || s === 'battleShort' || s === 'stResist') shortN += 6;
  }

  if (params.primaryDir === 'LONG') longN += params.primaryMode === 'bounce' ? 12 : 8;
  if (params.primaryDir === 'SHORT') shortN += params.primaryMode === 'bounce' ? 12 : 8;

  if (params.rocketDir === 'LONG') longN += Math.round(6 * styleW.reactionMult);
  if (params.rocketDir === 'SHORT') shortN += Math.round(6 * styleW.reactionMult);

  const schL = Number(params.schoolLongN) || 0;
  const schS = Number(params.schoolShortN) || 0;
  const schW = Number(params.schoolWaitN) || 0;
  if (schL > 0) longN += Math.min(22, Math.round(schL * 0.55));
  if (schS > 0) shortN += Math.min(22, Math.round(schS * 0.55));
  if (schW >= schL + 4 && schW >= schS + 4) {
    longN = Math.max(0, longN - 8);
    shortN = Math.max(0, shortN - 8);
  }

  if (close > 0 && params.hotZones?.length) {
    for (const z of params.hotZones) {
      if (!(z.bot <= close && close <= z.top)) continue;
      const pts = Math.round(8 * styleW.reactionMult);
      if (z.side === 'LONG') longN += pts;
      if (z.side === 'SHORT') shortN += pts;
    }
  }

  const atrHint = span > 0 ? span * 0.35 : Math.abs(close) * 0.008;
  const pocRel = evaluateMergedDeskRbPocRelation({
    close,
    poc: params.vrvpPoc,
    vaLow: params.vrvpVaLow,
    vaHigh: params.vrvpVaHigh,
    atr: atrHint,
  });
  if (pocRel.side === 'LONG' && pocRel.pts > 0) {
    longN += Math.round(pocRel.pts * styleW.pocMult);
    pocTriggered = true;
  } else if (pocRel.side === 'SHORT' && pocRel.pts > 0) {
    shortN += Math.round(pocRel.pts * styleW.pocMult);
    pocTriggered = true;
  }

  const read = params.edgeReads?.[0] ?? null;
  const lowerKo = String(read?.lower || '');
  const upperKo = String(read?.upper || '');
  const loSettle = String(read?.lowerSettle || '');
  const upSettle = String(read?.upperSettle || '');

  if (atSupport) {
    if (bullBar && g && low <= g.tipLower + span * 0.14) {
      longN += Math.round(28 * styleW.reactionMult);
      railLong = true;
    }
    if (prevBull && bullBar) {
      longN += Math.round(8 * styleW.reactionMult);
      railLong = true;
    }
    if (lowerKo.includes('지지') || lowerKo.includes('안착')) {
      longN += 22;
      railLong = true;
    }
    if ((loSettle === 'settled' || loSettle === 'attempt') && bullBar) {
      longN += 18;
      railLong = true;
    }
    if (params.primaryEdge === 'lower' && params.primaryDir === 'LONG') {
      longN += 10;
      railLong = true;
    }
    if (bearBar && g && close <= g.tipLower + span * 0.06) shortN += 12;
  }

  if (atResist) {
    if (bearBar && g && high >= g.tipUpper - span * 0.14) {
      shortN += Math.round(28 * styleW.reactionMult);
      railShort = true;
    }
    if (prevBear && bearBar) {
      shortN += Math.round(8 * styleW.reactionMult);
      railShort = true;
    }
    if (upperKo.includes('저항') || upperKo.includes('안착')) {
      shortN += 22;
      railShort = true;
    }
    if ((upSettle === 'settled' || upSettle === 'attempt') && bearBar) {
      shortN += 18;
      railShort = true;
    }
    if (params.primaryEdge === 'upper' && params.primaryDir === 'SHORT') {
      shortN += 10;
      railShort = true;
    }
    if (bullBar && g && close >= g.tipUpper - span * 0.06) longN += 12;
  }

  /** 테두리 이탈·통로 안 경로를 기울기보다 먼저 — 이미 밑이면 즉시 빨강 */
  const belowRail = Boolean(g && close > 0 && close < g.tipLower);
  const aboveRail = Boolean(g && close > 0 && close > g.tipUpper);
  /** 윅만 레일 아래·종가는 회복 = 반등(이탈 아님). 종가까지 이탈만 break-down */
  const wickUnderHold =
    Boolean(g && low < g.tipLower && close >= g.tipLower - span * 0.02 && close <= g.tipMid);
  const wickUnderBreak = Boolean(g && low < g.tipLower && close < g.tipLower);
  const wickOverHold =
    Boolean(g && high > g.tipUpper && close <= g.tipUpper + span * 0.02 && close >= g.tipMid);
  const wickOverBreak = Boolean(g && high > g.tipUpper && close > g.tipUpper);
  const breakDn = g?.breakout === 'down' || ((g?.breakoutBars ?? 0) >= 1 && g?.breakout === 'down');
  const breakUp = g?.breakout === 'up';
  const path = detectCorridorPath(rows, g, styleW.pathBars, styleW.pathSteps);

  if (wickUnderHold) {
    longN += Math.round(24 * styleW.reactionMult);
    railLong = true;
  }
  if (wickOverHold) {
    shortN += Math.round(24 * styleW.reactionMult);
    railShort = true;
  }

  let side: MergedDeskRbCorridorPaintSide;
  let trigger: MergedDeskRbCorridorPaintTrigger = 'slope';
  if (belowRail || breakDn || wickUnderBreak) {
    side = 'short';
    trigger = 'break-down';
  } else if (aboveRail || breakUp || wickOverBreak) {
    side = 'long';
    trigger = 'break-up';
  } else if (path === 'down') {
    side = 'short';
    trigger = 'path';
  } else if (path === 'up') {
    side = 'long';
    trigger = 'path';
  } else if (shortN >= longN + 4) {
    side = 'short';
    trigger = pocTriggered && pocRel.side === 'SHORT'
      ? 'poc'
      : vs && vs.side === 'down'
        ? 'flow'
        : st === 'SHORT'
          ? 'stance'
          : 'slope';
  } else if (longN >= shortN + 4) {
    side = 'long';
    trigger = pocTriggered && pocRel.side === 'LONG'
      ? 'poc'
      : vs && vs.side === 'up'
        ? 'flow'
        : st === 'LONG'
          ? 'stance'
          : 'slope';
  } else if (g) {
    side = g.descending ? 'short' : 'long';
    trigger = 'slope';
  } else {
    side = longN >= shortN ? 'long' : 'short';
    trigger = 'slope';
  }
  if (side === 'long' && railLong && trigger !== 'break-down') trigger = 'rail-bounce';
  else if (side === 'short' && railShort && trigger !== 'break-up') trigger = 'rail-drop';
  /** 하단 지지 윅 회복이면 하락통로여도 반등 트리거 우선 */
  if (wickUnderHold && !belowRail && !wickUnderBreak) {
    side = 'long';
    trigger = 'rail-bounce';
  } else if (wickOverHold && !aboveRail && !wickOverBreak) {
    side = 'short';
    trigger = 'rail-drop';
  }

  const locKo = atSupport ? '하단지지' : atResist ? '상단저항' : belowRail ? '테두리하단이탈' : '통로중가';
  const trigKo =
    trigger === 'break-down'
      ? '하단이탈·하락전환'
      : trigger === 'break-up'
        ? '상단이탈·상승전환'
        : trigger === 'path'
          ? '통로경로'
          : trigger === 'rail-bounce'
            ? '하단반등'
            : trigger === 'rail-drop'
              ? '상단하락'
              : trigger === 'stance'
                ? '마스터방향'
                : trigger === 'flow'
                  ? '수급방향'
                  : trigger === 'poc'
                    ? 'POC연동'
                    : '통로기울기';
  const summaryKo = `${styleW.styleKo}·${side === 'long' ? '상승통로·초록' : '하락통로·빨강'} · ${locKo} · ${trigKo}${
    pocRel.ko ? ` · ${pocRel.ko}` : ''
  }`;

  return {
    side,
    bear: side === 'short',
    trigger,
    atSupport,
    atResist,
    summaryKo,
    tradeStyle: styleW.style,
    styleKo: styleW.styleKo,
    pocKo: pocRel.ko || undefined,
  };
}
