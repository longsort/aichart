/**
 * assets 잔여 ZONE — 하모닉PRZ · KillZone · 채널/SR Flip · Premium/Discount · Breaker · 쐐기·더블탑/바텀
 * 카드/HUD 없음. 고정 승률·확정 수익 금지.
 */
import type { Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import {
  findMergedDeskZoneFormationBarTime,
  mergedDeskAnalyzedZoneSpanTimes,
} from '@/lib/mergedAnalysisOverlayTimes';
import { detectAllHarmonics } from '@/lib/harmonic';
import { isKillZone } from '@/lib/smc';
import {
  detectSmcStructureOrderBlocks,
  isObBrokenByClose,
} from '@/lib/smcStructureOrderBlocks';

const EXTRA = 'merged-desk-asset-auto-zone';

export type AssetAutoZonesRemainCounts = {
  harmonic: number;
  killZone: number;
  channel: number;
  srFlip: number;
  premiumDiscount: number;
  breaker: number;
  wedge: number;
  doubleTopBot: number;
};

function atr(candles: Candle[], end: number, period = 14): number {
  if (end < 1) return Math.abs(candles[end]?.close ?? 1) * 0.01;
  let sum = 0;
  let n = 0;
  const start = Math.max(1, end - period + 1);
  for (let i = start; i <= end; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    n += 1;
  }
  return n > 0 ? sum / n : Math.abs(candles[end]!.close) * 0.01;
}

function fmt(p: number): string {
  if (!(p > 0)) return '—';
  if (p >= 1000) return p.toFixed(1);
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function pushZone(
  overlays: OverlayItem[],
  candles: Candle[],
  opts: {
    id: string;
    kind: 'demandZone' | 'supplyZone' | 'zone' | 'keyLevel' | 'fvg' | 'ob' | 'harmonic';
    label: string;
    top: number;
    bot: number;
    timePref: number;
    score: number;
    color: string;
    tip: string;
    extra: string;
    isLong?: boolean;
    asLine?: boolean;
  }
): void {
  const { top, bot } = opts;
  if (!(top > bot) || !Number.isFinite(top) || !Number.isFinite(bot)) return;
  if (opts.asLine) {
    const mid = (top + bot) / 2;
    const t = Number(candles[candles.length - 1]?.time);
    overlays.push({
      id: opts.id,
      kind: 'keyLevel',
      label: opts.label,
      zoneFaceBase: opts.label,
      labelTooltip: opts.tip,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: (Number.isFinite(opts.timePref) ? opts.timePref : t) as UTCTimestamp,
      time2: t as UTCTimestamp,
      price1: mid,
      confidence: opts.score,
      color: opts.color,
      lineLabelColor: opts.isLong === false ? '#fecaca' : '#bbf7d0',
      labelBackgroundColor:
        opts.isLong === false ? 'rgba(127,29,29,0.9)' : 'rgba(6,78,59,0.9)',
      labelTextColor: '#f8fafc',
      category: 'structure',
      lineDash: '4 4',
      lineStrokeWidth: 1.4,
      overlayZoneExtraClass: `${EXTRA} ${opts.extra}`.trim(),
    });
    return;
  }
  const formT = findMergedDeskZoneFormationBarTime(candles, top, bot, opts.timePref);
  const zoneTimes = mergedDeskAnalyzedZoneSpanTimes(candles, {
    id: opts.id,
    time1: formT,
    price1: top,
    price2: bot,
  });
  if (!zoneTimes) return;
  const isLong = opts.isLong !== false && opts.kind !== 'supplyZone';
  overlays.push({
    id: opts.id,
    kind: opts.kind,
    label: opts.label,
    zoneFaceBase: opts.label,
    labelTooltip: opts.tip,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: zoneTimes.t1,
    time2: zoneTimes.t2,
    price1: top,
    price2: bot,
    confidence: opts.score,
    color: opts.color,
    category: 'zones',
    zonePulse: opts.score >= 78,
    zoneFillPreserve: true,
    lineLabelColor: isLong ? '#bbf7d0' : '#fecaca',
    labelBackgroundColor: isLong ? 'rgba(6,78,59,0.92)' : 'rgba(127,29,29,0.92)',
    labelTextColor: '#f8fafc',
    overlayZoneExtraClass: [
      EXTRA,
      opts.extra,
      'merged-desk-zone-caption-clean',
      'merged-desk-pill-zone',
      'merged-desk-zone-pro-hero',
      isLong ? 'overlay-zone--asset-auto-long' : 'overlay-zone--asset-auto-short',
    ]
      .filter(Boolean)
      .join(' '),
  });
}

function pivotHigh(candles: Candle[], i: number, L = 2): boolean {
  if (i < L || i + L >= candles.length) return false;
  const v = candles[i]!.high;
  for (let k = i - L; k <= i + L; k++) if (k !== i && candles[k]!.high >= v) return false;
  return true;
}
function pivotLow(candles: Candle[], i: number, L = 2): boolean {
  if (i < L || i + L >= candles.length) return false;
  const v = candles[i]!.low;
  for (let k = i - L; k <= i + L; k++) if (k !== i && candles[k]!.low <= v) return false;
  return true;
}

function buildSwings(candles: Candle[]) {
  const swings: Array<{ type: 'high' | 'low'; index: number; price: number }> = [];
  for (let i = 3; i < candles.length - 3; i++) {
    if (pivotHigh(candles, i)) swings.push({ type: 'high', index: i, price: candles[i]!.high });
    if (pivotLow(candles, i)) swings.push({ type: 'low', index: i, price: candles[i]!.low });
  }
  return swings;
}

const HARM_KO: Record<string, string> = {
  butterfly: '나비',
  bat: '박쥐',
  gartley: '가틀리',
  crab: '크랩',
  altBat: '알트박쥐',
  deepCrab: '딥크랩',
};

/** 1) 하모닉 PRZ */
function detectHarmonicPrz(candles: Candle[], atrVal: number, overlays: OverlayItem[]): number {
  const swings = buildSwings(candles);
  const harms = detectAllHarmonics(candles, swings).slice(0, 3);
  let n = 0;
  for (const h of harms) {
    const isLong = h.bias === 'bullish';
    const half = Math.max(atrVal * 0.35, Math.abs(h.dPrice) * 0.0012);
    const name = HARM_KO[h.pattern] || h.pattern;
    const dIdx = Math.max(0, Math.min(candles.length - 1, h.d));
    pushZone(overlays, candles, {
      id: `merged-desk-asset-harm-prz-${h.pattern}-${h.d}`,
      kind: isLong ? 'demandZone' : 'supplyZone',
      label: `하모닉PRZ·${name}`,
      top: h.dPrice + half,
      bot: h.dPrice - half,
      timePref: Number(candles[dIdx]!.time),
      score: Math.min(92, 60 + h.score * 20),
      color: isLong ? 'rgba(167,139,250,0.2)' : 'rgba(251,146,60,0.2)',
      tip: `${name} PRZ D · ${fmt(h.dPrice)} · 하모닉 (참고)`,
      extra: `merged-desk-asset-harmonic merged-desk-asset-harmonic--${h.pattern}`,
      isLong,
    });
    n += 1;
  }
  return n;
}

/** 2) Kill Zone — 최근 세션 박스 (Asia / London / NY) */
function detectKillZones(candles: Candle[], atrVal: number, overlays: OverlayItem[]): number {
  const n = candles.length;
  if (n < 20) return 0;
  type Sess = { key: string; label: string; startMin: number; endMin: number; color: string };
  const sessions: Sess[] = [
    { key: 'asia', label: '킬존·아시아', startMin: 0, endMin: 8 * 60, color: 'rgba(148,163,184,0.14)' },
    { key: 'london', label: '킬존·런던', startMin: 8 * 60, endMin: 10 * 60, color: 'rgba(96,165,250,0.16)' },
    { key: 'ny', label: '킬존·뉴욕', startMin: 13 * 60, endMin: 15 * 60, color: 'rgba(251,191,36,0.16)' },
  ];
  let drawn = 0;
  const look = Math.min(n, 96);
  for (const sess of sessions) {
    let i0 = -1;
    let i1 = -1;
    let hi = -Infinity;
    let lo = Infinity;
    for (let i = n - look; i < n; i++) {
      const t = Number(candles[i]!.time);
      const d = new Date(t * 1000);
      const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes();
      const inS =
        sess.startMin <= sess.endMin
          ? utcMin >= sess.startMin && utcMin < sess.endMin
          : utcMin >= sess.startMin || utcMin < sess.endMin;
      if (!inS) continue;
      if (i0 < 0) i0 = i;
      i1 = i;
      hi = Math.max(hi, candles[i]!.high);
      lo = Math.min(lo, candles[i]!.low);
    }
    if (i0 < 0 || i1 < i0 || !(hi > lo)) continue;
    // pad thin sessions
    if (hi - lo < atrVal * 0.2) {
      const mid = (hi + lo) / 2;
      hi = mid + atrVal * 0.25;
      lo = mid - atrVal * 0.25;
    }
    pushZone(overlays, candles, {
      id: `merged-desk-asset-kill-${sess.key}-${Number(candles[i0]!.time)}`,
      kind: 'zone',
      label: sess.label,
      top: hi,
      bot: lo,
      timePref: Number(candles[i0]!.time),
      score: 66,
      color: sess.color,
      tip: `${sess.label} · UTC 세션 고저 · ${fmt(lo)}~${fmt(hi)} (참고)`,
      extra: `merged-desk-asset-killzone merged-desk-asset-killzone--${sess.key}`,
      isLong: true,
    });
    drawn += 1;
  }
  // 현재봉이 킬존이면 강조 라벨 밴드
  const last = candles[n - 1]!;
  if (isKillZone(Number(last.time))) {
    const half = atrVal * 0.2;
    pushZone(overlays, candles, {
      id: `merged-desk-asset-kill-now-${Number(last.time)}`,
      kind: 'zone',
      label: '킬존·활성',
      top: last.close + half,
      bot: last.close - half,
      timePref: Number(last.time),
      score: 72,
      color: 'rgba(250,204,21,0.18)',
      tip: '현재 봉이 런던/NY 킬존 시간대 (참고)',
      extra: 'merged-desk-asset-killzone merged-desk-asset-killzone--active',
      isLong: true,
    });
    drawn += 1;
  }
  return drawn;
}

/** 3) 하강/상승 채널 경계 ZONE */
function detectChannelZones(candles: Candle[], atrVal: number, overlays: OverlayItem[]): number {
  const swings = buildSwings(candles);
  const highs = swings.filter((s) => s.type === 'high').slice(-5);
  const lows = swings.filter((s) => s.type === 'low').slice(-5);
  if (highs.length < 2 || lows.length < 2) return 0;
  const h0 = highs[highs.length - 2]!;
  const h1 = highs[highs.length - 1]!;
  const l0 = lows[lows.length - 2]!;
  const l1 = lows[lows.length - 1]!;
  if (h1.index === h0.index || l1.index === l0.index) return 0;
  const slopeH = (h1.price - h0.price) / (h1.index - h0.index);
  const slopeL = (l1.price - l0.price) / (l1.index - l0.index);
  // roughly parallel
  if (Math.abs(slopeH - slopeL) > atrVal * 0.08) return 0;
  const lastI = candles.length - 1;
  const resist = h1.price + slopeH * (lastI - h1.index);
  const support = l1.price + slopeL * (lastI - l1.index);
  if (!(resist > support)) return 0;
  const half = atrVal * 0.22;
  pushZone(overlays, candles, {
    id: `merged-desk-asset-chan-res-${h1.index}`,
    kind: 'supplyZone',
    label: '채널저항ZONE',
    top: resist + half,
    bot: resist - half,
    timePref: Number(candles[h0.index]!.time),
    score: 74,
    color: 'rgba(248,113,113,0.16)',
    tip: `평행채널 상단 · ${fmt(resist)} (참고)`,
    extra: 'merged-desk-asset-channel merged-desk-asset-channel--resist',
    isLong: false,
  });
  pushZone(overlays, candles, {
    id: `merged-desk-asset-chan-sup-${l1.index}`,
    kind: 'demandZone',
    label: '채널지지ZONE',
    top: support + half,
    bot: support - half,
    timePref: Number(candles[l0.index]!.time),
    score: 74,
    color: 'rgba(52,211,153,0.16)',
    tip: `평행채널 하단 · ${fmt(support)} (참고)`,
    extra: 'merged-desk-asset-channel merged-desk-asset-channel--support',
    isLong: true,
  });
  return 2;
}

/** 4) SR Flip */
function detectSrFlip(candles: Candle[], atrVal: number, overlays: OverlayItem[]): number {
  const n = candles.length;
  const swings = buildSwings(candles);
  let count = 0;
  const close = candles[n - 1]!.close;
  // broken support → resistance
  for (const s of swings.filter((x) => x.type === 'low').slice(-6)) {
    let broken = false;
    for (let j = s.index + 1; j < n; j++) {
      if (candles[j]!.close < s.price - atrVal * 0.15) {
        broken = true;
        break;
      }
    }
    if (!broken) continue;
    // retest from below = short zone
    if (close > s.price + atrVal * 2) continue;
    const half = atrVal * 0.28;
    pushZone(overlays, candles, {
      id: `merged-desk-asset-srflip-res-${s.index}`,
      kind: 'supplyZone',
      label: 'SR Flip·저항',
      top: s.price + half,
      bot: s.price - half,
      timePref: Number(candles[s.index]!.time),
      score: 76,
      color: 'rgba(244,114,182,0.18)',
      tip: `지지→저항 전환 · ${fmt(s.price)} (참고)`,
      extra: 'merged-desk-asset-srflip merged-desk-asset-srflip--resist',
      isLong: false,
    });
    count += 1;
    if (count >= 2) break;
  }
  let count2 = 0;
  for (const s of swings.filter((x) => x.type === 'high').slice(-6)) {
    let broken = false;
    for (let j = s.index + 1; j < n; j++) {
      if (candles[j]!.close > s.price + atrVal * 0.15) {
        broken = true;
        break;
      }
    }
    if (!broken) continue;
    if (close < s.price - atrVal * 2) continue;
    const half = atrVal * 0.28;
    pushZone(overlays, candles, {
      id: `merged-desk-asset-srflip-sup-${s.index}`,
      kind: 'demandZone',
      label: 'SR Flip·지지',
      top: s.price + half,
      bot: s.price - half,
      timePref: Number(candles[s.index]!.time),
      score: 76,
      color: 'rgba(45,212,191,0.18)',
      tip: `저항→지지 전환 · ${fmt(s.price)} (참고)`,
      extra: 'merged-desk-asset-srflip merged-desk-asset-srflip--support',
      isLong: true,
    });
    count2 += 1;
    if (count2 >= 2) break;
  }
  return count + count2;
}

/** 5) Premium / Discount */
function detectPremiumDiscount(candles: Candle[], atrVal: number, overlays: OverlayItem[]): number {
  const swings = buildSwings(candles);
  const lastH = [...swings].reverse().find((s) => s.type === 'high');
  const lastL = [...swings].reverse().find((s) => s.type === 'low');
  if (!lastH || !lastL) return 0;
  const hi = Math.max(lastH.price, lastL.price);
  const lo = Math.min(lastH.price, lastL.price);
  if (hi - lo < atrVal * 2) return 0;
  const mid = (hi + lo) / 2;
  const t0 = Number(candles[Math.min(lastH.index, lastL.index)]!.time);
  pushZone(overlays, candles, {
    id: `merged-desk-asset-premium-${lastH.index}`,
    kind: 'supplyZone',
    label: '프리미엄ZONE',
    top: hi,
    bot: mid,
    timePref: t0,
    score: 70,
    color: 'rgba(251,113,133,0.12)',
    tip: `스윙 상단 50% · ${fmt(mid)}~${fmt(hi)} (참고)`,
    extra: 'merged-desk-asset-premium',
    isLong: false,
  });
  pushZone(overlays, candles, {
    id: `merged-desk-asset-discount-${lastL.index}`,
    kind: 'demandZone',
    label: '디스카운트ZONE',
    top: mid,
    bot: lo,
    timePref: t0,
    score: 70,
    color: 'rgba(56,189,248,0.12)',
    tip: `스윙 하단 50% · ${fmt(lo)}~${fmt(mid)} (참고)`,
    extra: 'merged-desk-asset-discount',
    isLong: true,
  });
  return 2;
}

/** 6) Breaker Block — 깨진 OB가 반대 역할 */
function detectBreaker(candles: Candle[], atrVal: number, overlays: OverlayItem[]): number {
  const { obs } = detectSmcStructureOrderBlocks(candles);
  let n = 0;
  for (const o of obs.slice(-10)) {
    if (!isObBrokenByClose(o, candles)) continue;
    const isLongNow = o.bias === 'bearish'; // broken bearish OB → support
    pushZone(overlays, candles, {
      id: `merged-desk-asset-breaker-${o.index}`,
      kind: isLongNow ? 'demandZone' : 'supplyZone',
      label: isLongNow ? '브레이커·지지' : '브레이커·저항',
      top: o.high,
      bot: o.low,
      timePref: Number(candles[o.index]!.time),
      score: 78,
      color: isLongNow ? 'rgba(74,222,128,0.18)' : 'rgba(251,113,133,0.18)',
      tip: `Breaker Block · 깨진 OB 전환 · ${fmt(o.low)}~${fmt(o.high)} (참고)`,
      extra: 'merged-desk-asset-breaker',
      isLong: isLongNow,
    });
    n += 1;
    if (n >= 2) break;
  }
  return n;
}

/** 7) Rising/Falling wedge breakout zone */
function detectWedge(candles: Candle[], atrVal: number, overlays: OverlayItem[]): number {
  const swings = buildSwings(candles);
  const highs = swings.filter((s) => s.type === 'high').slice(-4);
  const lows = swings.filter((s) => s.type === 'low').slice(-4);
  if (highs.length < 3 || lows.length < 3) return 0;
  const hSlope =
    (highs[highs.length - 1]!.price - highs[0]!.price) /
    Math.max(1, highs[highs.length - 1]!.index - highs[0]!.index);
  const lSlope =
    (lows[lows.length - 1]!.price - lows[0]!.price) /
    Math.max(1, lows[lows.length - 1]!.index - lows[0]!.index);
  const converging = Math.abs(hSlope - lSlope) > atrVal * 0.01;
  if (!converging) return 0;
  const last = candles[candles.length - 1]!;
  // rising wedge (both up, highs flatter) → bearish break potential
  if (hSlope > 0 && lSlope > 0 && lSlope > hSlope) {
    const top = highs[highs.length - 1]!.price;
    const bot = Math.max(lows[lows.length - 1]!.price, top - atrVal * 1.2);
    pushZone(overlays, candles, {
      id: `merged-desk-asset-wedge-rise-${highs[highs.length - 1]!.index}`,
      kind: 'supplyZone',
      label: '상승쐐기ZONE',
      top,
      bot,
      timePref: Number(candles[highs[0]!.index]!.time),
      score: 72,
      color: 'rgba(248,113,113,0.15)',
      tip: '상승 쐐기 · 하방 이탈 주시 (참고)',
      extra: 'merged-desk-asset-wedge merged-desk-asset-wedge--rising',
      isLong: false,
    });
    return 1;
  }
  // falling wedge → bullish
  if (hSlope < 0 && lSlope < 0 && hSlope < lSlope) {
    const bot = lows[lows.length - 1]!.price;
    const top = Math.min(highs[highs.length - 1]!.price, bot + atrVal * 1.2);
    pushZone(overlays, candles, {
      id: `merged-desk-asset-wedge-fall-${lows[lows.length - 1]!.index}`,
      kind: 'demandZone',
      label: '하락쐐기ZONE',
      top,
      bot,
      timePref: Number(candles[lows[0]!.index]!.time),
      score: 72,
      color: 'rgba(52,211,153,0.15)',
      tip: '하락 쐐기 · 상방 이탈 주시 (참고)',
      extra: 'merged-desk-asset-wedge merged-desk-asset-wedge--falling',
      isLong: true,
    });
    return 1;
  }
  void last;
  return 0;
}

/** 8) Double top / bottom */
function detectDoubleTopBot(candles: Candle[], atrVal: number, overlays: OverlayItem[]): number {
  const swings = buildSwings(candles);
  const highs = swings.filter((s) => s.type === 'high');
  const lows = swings.filter((s) => s.type === 'low');
  let n = 0;
  for (let i = 1; i < highs.length; i++) {
    const a = highs[i - 1]!;
    const b = highs[i]!;
    if (Math.abs(a.price - b.price) > atrVal * 0.45) continue;
    if (b.index - a.index < 5) continue;
    const valley = candles
      .slice(a.index, b.index + 1)
      .reduce((m, c) => Math.min(m, c.low), Infinity);
    const top = Math.max(a.price, b.price);
    const bot = Math.min(valley, top - atrVal * 0.3);
    pushZone(overlays, candles, {
      id: `merged-desk-asset-dtop-${a.index}-${b.index}`,
      kind: 'supplyZone',
      label: '더블탑ZONE',
      top: top + atrVal * 0.08,
      bot: Math.max(bot, top - atrVal * 0.9),
      timePref: Number(candles[a.index]!.time),
      score: 75,
      color: 'rgba(251,113,133,0.16)',
      tip: `더블탑 · ${fmt(a.price)}≈${fmt(b.price)} (참고)`,
      extra: 'merged-desk-asset-doubletop',
      isLong: false,
    });
    n += 1;
    break;
  }
  for (let i = 1; i < lows.length; i++) {
    const a = lows[i - 1]!;
    const b = lows[i]!;
    if (Math.abs(a.price - b.price) > atrVal * 0.45) continue;
    if (b.index - a.index < 5) continue;
    const peak = candles
      .slice(a.index, b.index + 1)
      .reduce((m, c) => Math.max(m, c.high), -Infinity);
    const bot = Math.min(a.price, b.price);
    pushZone(overlays, candles, {
      id: `merged-desk-asset-dbot-${a.index}-${b.index}`,
      kind: 'demandZone',
      label: '더블바텀ZONE',
      top: Math.min(peak, bot + atrVal * 0.9),
      bot: bot - atrVal * 0.08,
      timePref: Number(candles[a.index]!.time),
      score: 75,
      color: 'rgba(52,211,153,0.16)',
      tip: `더블바텀 · ${fmt(a.price)}≈${fmt(b.price)} (참고)`,
      extra: 'merged-desk-asset-doublebot',
      isLong: true,
    });
    n += 1;
    break;
  }
  return n;
}

export function detectMergedDeskAssetAutoZonesRemain(
  candles: Candle[],
  atrVal: number
): { overlays: OverlayItem[]; counts: AssetAutoZonesRemainCounts } {
  const overlays: OverlayItem[] = [];
  const counts: AssetAutoZonesRemainCounts = {
    harmonic: detectHarmonicPrz(candles, atrVal, overlays),
    killZone: detectKillZones(candles, atrVal, overlays),
    channel: detectChannelZones(candles, atrVal, overlays),
    srFlip: detectSrFlip(candles, atrVal, overlays),
    premiumDiscount: detectPremiumDiscount(candles, atrVal, overlays),
    breaker: detectBreaker(candles, atrVal, overlays),
    wedge: detectWedge(candles, atrVal, overlays),
    doubleTopBot: detectDoubleTopBot(candles, atrVal, overlays),
  };
  return { overlays, counts };
}
