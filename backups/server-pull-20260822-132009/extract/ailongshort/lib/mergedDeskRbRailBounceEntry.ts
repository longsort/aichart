/**
 * 파랑빨강띠 레일 반등·저항 타점 zone.
 * 하단 레일 근접/터치 반등 · 상단 레일 근접/터치 저항을 zone+라벨+축선으로 표시.
 * 확정 수익·승률 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import { mergedDeskRbFutureTime2 } from '@/lib/mergedDeskBlueRedChannels';
import { MERGED_DESK_RB_FUTURE_BARS } from '@/lib/mergedDeskSharedChartView';
import { mergedWorkCandles } from '@/lib/mergedAnalysisOverlayTimes';
import type { MergedDeskRbCorridorPaint } from '@/lib/mergedDeskRbCorridorPaint';
import type { MergedDeskRbTradeStyle } from '@/lib/mergedDeskRbAiStyleBrain';
import { mergedDeskRbStyleWeights } from '@/lib/mergedDeskRbAiStyleBrain';
import { evaluateMergedDeskRbPocRelation } from '@/lib/mergedDeskRbAiStyleBrain';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import { gradeMergedDeskRbBounceStrength } from '@/lib/mergedDeskRbBounceStrength';

export type MergedDeskRbRailBounceSide = 'LONG' | 'SHORT';
export type MergedDeskRbRailBounceStatus = 'READY' | 'NEAR' | 'HOLD' | 'WAIT';

export type MergedDeskRbRailBounceEntry = {
  side: MergedDeskRbRailBounceSide;
  status: MergedDeskRbRailBounceStatus;
  zoneTop: number;
  zoneBot: number;
  entry: number;
  railPrice: number;
  touchTime: number;
  time1: number;
  time2: number;
  labelKo: string;
  signalKo: string;
  tooltipKo: string;
  score: number;
  grade?: 'weak' | 'mid' | 'strong' | 'ultra';
  gradeKo?: string;
};

export type MergedDeskRbRailBouncePack = {
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
  entry: MergedDeskRbRailBounceEntry | null;
  summaryKo: string;
};

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const cur = candles[i]!;
    const prev = candles[i - 1]!;
    s += Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    c += 1;
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
}

function railAtTime(
  g: MergedDeskChannelGeom,
  time: number,
  edge: 'lower' | 'upper',
  lastBarTime: number
): number {
  const t0 = Number(g.tStart);
  const t1 = lastBarTime > t0 ? lastBarTime : Number(g.tEnd) || lastBarTime;
  const span = Math.max(1, t1 - t0);
  const t = Math.max(0, Math.min(1.4, (Number(time) - t0) / span));
  if (edge === 'lower') return g.lo1 + (g.tipLower - g.lo1) * t;
  return g.up1 + (g.tipUpper - g.up1) * t;
}

type Hit = { i: number; rail: number; score: number; prox: number };

function scanLower(candles: Candle[], g: MergedDeskChannelGeom, atr: number, lookback: number): Hit | null {
  const n = candles.length;
  const lastT = Number(candles[n - 1]!.time);
  const from = Math.max(0, n - lookback);
  let best: Hit | null = null;
  for (let i = from; i < n; i++) {
    const c = candles[i]!;
    const rail = railAtTime(g, Number(c.time), 'lower', lastT);
    const tol = Math.max(atr * 0.55, Math.abs(rail) * 0.0016);
    const low = Number(c.low);
    const close = Number(c.close);
    const open = Number(c.open);
    const prox = Math.min(Math.abs(low - rail), Math.abs(close - rail)) / Math.max(atr, 1e-9);
    const touched = low <= rail + tol;
    const near = prox <= 1.35;
    if (!touched && !near) continue;
    let score = near ? 36 : 28;
    if (touched) score += 16;
    if (low <= rail + atr * 0.12) score += 10;
    if (close >= rail - tol * 0.5) score += 12;
    if (close >= open) score += 14;
    if (close > low + (Number(c.high) - low) * 0.28) score += 10;
    if (i >= n - 3) score += 12;
    if (i >= n - 1) score += 6;
    if (!best || score > best.score || (score === best.score && i > best.i)) {
      best = { i, rail, score, prox };
    }
  }
  return best;
}

function scanUpper(candles: Candle[], g: MergedDeskChannelGeom, atr: number, lookback: number): Hit | null {
  const n = candles.length;
  const lastT = Number(candles[n - 1]!.time);
  const from = Math.max(0, n - lookback);
  let best: Hit | null = null;
  for (let i = from; i < n; i++) {
    const c = candles[i]!;
    const rail = railAtTime(g, Number(c.time), 'upper', lastT);
    const tol = Math.max(atr * 0.55, Math.abs(rail) * 0.0016);
    const high = Number(c.high);
    const close = Number(c.close);
    const open = Number(c.open);
    const prox = Math.min(Math.abs(high - rail), Math.abs(close - rail)) / Math.max(atr, 1e-9);
    const touched = high >= rail - tol;
    const near = prox <= 1.35;
    if (!touched && !near) continue;
    let score = near ? 36 : 28;
    if (touched) score += 16;
    if (high >= rail - atr * 0.12) score += 10;
    if (close <= rail + tol * 0.5) score += 12;
    if (close <= open) score += 14;
    if (close < high - (high - Number(c.low)) * 0.28) score += 10;
    if (i >= n - 3) score += 12;
    if (i >= n - 1) score += 6;
    if (!best || score > best.score || (score === best.score && i > best.i)) {
      best = { i, rail, score, prox };
    }
  }
  return best;
}

function buildBounceOverlay(e: MergedDeskRbRailBounceEntry): OverlayItem {
  const isLong = e.side === 'LONG';
  const grade = e.grade || 'mid';
  const faceHex =
    grade === 'ultra'
      ? isLong
        ? '#FDE047'
        : '#FB7185'
      : grade === 'strong'
        ? isLong
          ? '#4ADE80'
          : '#F87171'
        : isLong
          ? '#86EFAC'
          : '#FDA4AF';
  const fillAlpha =
    grade === 'ultra' ? 0.42 : grade === 'strong' ? 0.36 : grade === 'mid' ? 0.28 : 0.2;
  const fill = isLong
    ? `rgba(34,197,94,${fillAlpha})`
    : `rgba(239,68,68,${fillAlpha})`;
  return {
    id: 'merged-desk-rb-rail-bounce-zone',
    kind: 'zone',
    label: e.labelKo,
    zoneFaceBase: e.labelKo,
    /** 면 라벨은 1개 — signal은 툴팁만 */
    zoneFaceSignal: undefined,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: e.time1 as UTCTimestamp,
    time2: e.time2 as UTCTimestamp,
    price1: e.zoneTop,
    price2: e.zoneBot,
    confidence: Math.max(45, Math.min(96, e.score)),
    color: fill,
    category: 'scenario',
    structureBias: isLong ? 'bullish' : 'bearish',
    zoneFillPreserve: true,
    zonePulse: true,
    overlayZoneExtraClass: [
      'merged-desk-rb-rail-bounce',
      'merged-desk-rb-channel',
      'merged-desk-rb-channel-keep',
      'merged-desk-money-zone-keep',
      'merged-desk-zone-pro-hero',
      'merged-desk-pill-zone',
      'merged-desk-zone-label-solo',
      'merged-desk-zone-label-on',
      'merged-desk-zone-caption-clean',
      isLong ? 'merged-desk-rb-rail-bounce-long' : 'merged-desk-rb-rail-bounce-short',
      `merged-desk-rb-rail-bounce-${e.status.toLowerCase()}`,
      `merged-desk-rb-bounce-grade--${grade}`,
    ].join(' '),
    labelTooltip: e.tooltipKo,
    lineLabelColor: faceHex,
    labelBackgroundColor:
      grade === 'ultra'
        ? isLong
          ? 'rgba(113,63,18,0.96)'
          : 'rgba(136,19,55,0.96)'
        : isLong
          ? 'rgba(6,95,70,0.96)'
          : 'rgba(136,19,55,0.96)',
    labelTextColor: '#f8fafc',
  };
}

function buildPriceLines(e: MergedDeskRbRailBounceEntry): AtlasPulsePriceLine[] {
  const isLong = e.side === 'LONG';
  const faceHex = isLong ? '#4ADE80' : '#FB7185';
  return [
    {
      price: e.railPrice,
      color: faceHex,
      title: e.labelKo,
      lineWidth: 2 as const,
      lineStyle: 'dashed' as const,
      axisLabel: true,
    },
    {
      price: e.entry,
      color: faceHex,
      title: isLong ? '반등E' : '하락E',
      lineWidth: 1 as const,
      lineStyle: 'solid' as const,
      axisLabel: true,
    },
  ].filter((l) => Number.isFinite(l.price) && l.price > 0);
}

/**
 * 파랑빨강띠 레일 반응 반등/저항 타점.
 * 레일 1.35ATR 이내·지지/저항 paint면 반드시 zone+라벨을 낸다.
 */
export function buildMergedDeskRbRailBounceEntryPack(params: {
  candles: Candle[];
  timeframe: string;
  geoms?: MergedDeskChannelGeom[] | null;
  paint?: MergedDeskRbCorridorPaint | null;
  tradeStyle?: MergedDeskRbTradeStyle | null;
  vrvpPoc?: number | null;
  vrvpVaLow?: number | null;
  vrvpVaHigh?: number | null;
}): MergedDeskRbRailBouncePack {
  const empty: MergedDeskRbRailBouncePack = {
    overlays: [],
    priceLines: [],
    entry: null,
    summaryKo: '레일반등 — 반응 없음',
  };
  const safe = mergedWorkCandles(params.candles, params.timeframe);
  if (safe.length < 8) return empty;
  const styleW = mergedDeskRbStyleWeights(params.tradeStyle ?? params.paint?.tradeStyle);
  const g =
    params.geoms?.find((x) => x.primary) ??
    params.geoms?.find((x) => x.horizon === styleW.preferredHorizon) ??
    params.geoms?.find((x) => x.horizon === 'short') ??
    params.geoms?.find((x) => x.horizon === 'fb') ??
    params.geoms?.[0] ??
    null;
  if (!g || !(g.tipLower > 0) || !(g.tipUpper > 0)) return empty;

  const atr = atr14(safe);
  const n = safe.length;
  const close = Number(safe[n - 1]!.close) || 0;
  const lookback = styleW.style === 'scalp' ? 12 : styleW.style === 'mid' ? 32 : 22;
  const paint = params.paint;

  const longHit = scanLower(safe, g, atr, lookback);
  const shortHit = scanUpper(safe, g, atr, lookback);

  const distLo = Math.abs(close - g.tipLower) / Math.max(atr, 1e-9);
  const distHi = Math.abs(close - g.tipUpper) / Math.max(atr, 1e-9);
  const nearLower = distLo <= 1.5 || paint?.atSupport === true || paint?.trigger === 'rail-bounce';
  const nearUpper = distHi <= 1.5 || paint?.atResist === true || paint?.trigger === 'rail-drop';

  /** 하단 근접이면 하락채널이어도 반등 우선 */
  let pick: { side: MergedDeskRbRailBounceSide; hit: Hit } | null = null;
  if (nearLower && longHit && (!nearUpper || distLo <= distHi + 0.15 || (longHit.score >= (shortHit?.score ?? 0) - 6))) {
    pick = { side: 'LONG', hit: longHit };
  } else if (nearUpper && shortHit) {
    pick = { side: 'SHORT', hit: shortHit };
  } else if (longHit && (!shortHit || longHit.prox <= shortHit.prox)) {
    pick = { side: 'LONG', hit: longHit };
  } else if (shortHit) {
    pick = { side: 'SHORT', hit: shortHit };
  } else if (nearLower) {
    pick = {
      side: 'LONG',
      hit: { i: n - 1, rail: g.tipLower, score: 44, prox: distLo },
    };
  } else if (nearUpper) {
    pick = {
      side: 'SHORT',
      hit: { i: n - 1, rail: g.tipUpper, score: 44, prox: distHi },
    };
  }
  if (!pick) return empty;

  const forced =
    (nearLower && pick.side === 'LONG') ||
    (nearUpper && pick.side === 'SHORT') ||
    paint?.trigger === 'rail-bounce' ||
    paint?.trigger === 'rail-drop' ||
    paint?.atSupport === true ||
    paint?.atResist === true;
  if (!forced && pick.hit.score < 40) {
    return { ...empty, summaryKo: `레일반응 — 점수 ${pick.hit.score}` };
  }

  const { hit, side } = pick;
  const railNow = side === 'LONG' ? g.tipLower : g.tipUpper;
  const half = Math.max(atr * 0.28, Math.abs(railNow) * 0.0018);
  const zoneMid = (hit.rail + railNow) / 2;
  const zoneTop = zoneMid + half;
  const zoneBot = zoneMid - half;
  const distAtr = Math.abs(close - railNow) / Math.max(atr, 1e-9);
  let status: MergedDeskRbRailBounceStatus = 'WAIT';
  if (close <= zoneTop && close >= zoneBot) status = 'READY';
  else if (distAtr <= 1.1) status = 'NEAR';
  else if (hit.i >= n - 4) status = 'HOLD';

  const pocRel = evaluateMergedDeskRbPocRelation({
    close,
    poc: params.vrvpPoc,
    vaLow: params.vrvpVaLow,
    vaHigh: params.vrvpVaHigh,
    atr,
  });
  let score = Math.max(hit.score, forced ? 52 : hit.score);
  if (side === 'LONG' && pocRel.side === 'LONG') score += Math.round(8 * styleW.pocMult);
  if (side === 'SHORT' && pocRel.side === 'SHORT') score += Math.round(8 * styleW.pocMult);
  if (forced) score += 8;
  score = Math.max(0, Math.min(100, score));

  const touchIdx = Math.max(0, Math.min(n - 1, hit.i));
  const touchBar = safe[touchIdx]!;
  const touchOpen = Number(touchBar.open);
  const touchClose = Number(touchBar.close);
  const touchLow = Number(touchBar.low);
  const touchHigh = Number(touchBar.high);
  const wickHold =
    side === 'LONG'
      ? touchLow <= railNow + atr * 0.2 && touchClose >= railNow - atr * 0.05
      : touchHigh >= railNow - atr * 0.2 && touchClose <= railNow + atr * 0.05;
  const bullOrBearBar = side === 'LONG' ? touchClose >= touchOpen : touchClose <= touchOpen;
  const range = Math.max(1e-9, touchHigh - touchLow);
  const reboundBody =
    side === 'LONG'
      ? touchClose > touchLow + range * 0.35
      : touchClose < touchHigh - range * 0.35;

  const strength = gradeMergedDeskRbBounceStrength({
    side,
    baseScore: score,
    status,
    paintTrigger: paint?.trigger,
    atRail: distAtr <= 0.85,
    wickHold,
    bullOrBearBar,
    reboundBody,
    pocAligned:
      (side === 'LONG' && pocRel.side === 'LONG') || (side === 'SHORT' && pocRel.side === 'SHORT'),
    distAtr,
  });
  score = strength.score;

  const statusKo =
    status === 'READY' ? '도달' : status === 'NEAR' ? '접근' : status === 'HOLD' ? '홀드' : '대기';
  const labelKo = strength.labelKo;
  const signalKo = `${strength.shortKo}·${styleW.styleKo}·${statusKo}${pocRel.ko ? `·${pocRel.ko}` : ''}`;
  const spanStart = Math.max(0, Math.min(touchIdx, n - 6));
  const t1 = Number(safe[spanStart]!.time);
  const t2 = mergedDeskRbFutureTime2(safe, Number(safe[n - 1]!.time), n - 1, MERGED_DESK_RB_FUTURE_BARS);
  const tooltipKo = [
    `파랑빨강띠 ${g.horizonKo} ${labelKo}`,
    `강도 ${strength.shortKo} · 점수 ${score} · ${styleW.styleKo} · ${statusKo}`,
    ...strength.reasons.slice(0, 5),
    `레일 ${railNow.toFixed(railNow >= 1000 ? 0 : 1)} · zone ${zoneBot.toFixed(zoneBot >= 1000 ? 0 : 1)}~${zoneTop.toFixed(zoneTop >= 1000 ? 0 : 1)}`,
    paint?.summaryKo || '',
    pocRel.ko || '',
    '조건부 반응 타점 — 확정 수익·승률 아님',
  ]
    .filter(Boolean)
    .join('\n');

  const entry: MergedDeskRbRailBounceEntry = {
    side,
    status,
    zoneTop,
    zoneBot,
    entry: Math.max(zoneBot, Math.min(zoneTop, railNow)),
    railPrice: railNow,
    touchTime: Number(safe[touchIdx]!.time),
    time1: t1,
    time2: t2,
    labelKo,
    signalKo,
    tooltipKo,
    score,
    grade: strength.grade,
    gradeKo: strength.shortKo,
  };

  return {
    overlays: [buildBounceOverlay(entry)],
    priceLines: buildPriceLines(entry),
    entry,
    summaryKo: `${labelKo} · ${signalKo} · ${score}점`,
  };
}
