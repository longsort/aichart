/**
 * 파랑빨강띠 — 레일 붙음 레벨을 핵심 지지 1 · 저항 1로 클러스터.
 * 4h 핵심은 15m(차트) 레일과 겹칠 때만. 터치 후 유지/실패 n (조건부, 승률·수익 아님).
 * 작도는 전폭 가격선. 기존 zone/엔진 삭제 없음.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import type { MergedDeskChannelGeom } from '@/lib/mergedDeskBlueRedChannels';
import type { MergedDeskHotZoneEntry } from '@/lib/mergedDeskHotZoneEntry';
import type { MergedDeskCoreSrPack } from '@/lib/mergedDeskCoreSrZones';
import type { MtfDumpZoneSpec } from '@/lib/mergedDeskMtfDumpZoneBridge';
import type { MergedKeyZone } from '@/lib/mergedAnalysisKeyZones';
import type { MergedCriticalZone } from '@/lib/mergedAnalysisCriticalZones';
import { getLastInstitutionalBandEdges } from '@/lib/institutionalSuperBand';
import { calcTradeRewardRisk } from '@/lib/mergedDeskUnifiedTradeRails';

type SnapPlan = {
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  tp1: number;
  invalidationPrice: number;
  rr: number;
  reasonsKo: string[];
  sourceKo: string;
};

const CLUSTER_ATR = 0.5;
const RAIL_NEAR_ATR = 0.55;
const TOUCH_ATR = 0.22;
const HORIZON_BARS = 4;
const LOOKBACK_BARS = 96;
const SAMPLE_PCT_MIN = 5;

export type RbCoreSrSide = 'SUPPORT' | 'RESIST';

export type RbCoreSrLevel = {
  side: RbCoreSrSide;
  price: number;
  sourceKos: string[];
  weight: number;
  htf4h: boolean;
  touches: number;
  holdN: number;
  failN: number;
  /** 조건부 % — 표본 부족이면 null. 승률 아님 */
  holdPct: number | null;
  titleKo: string;
  tipKo: string;
};

export type MergedDeskRbCoreSrClusterPack = {
  support: RbCoreSrLevel | null;
  resist: RbCoreSrLevel | null;
  priceLines: AtlasPulsePriceLine[];
  overlays: OverlayItem[];
  summaryKo: string;
  railLo: number;
  railHi: number;
};

type Cand = {
  price: number;
  top: number;
  bot: number;
  side: RbCoreSrSide | 'BOTH';
  sourceKo: string;
  weight: number;
  htf4h: boolean;
};

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) {
    const c = Number(candles[n - 1]?.close) || 0;
    return c > 0 ? c * 0.008 : 0;
  }
  const start = Math.max(1, n - 14);
  let sum = 0;
  let cnt = 0;
  for (let i = start; i < n; i++) {
    const h = Number(candles[i]!.high);
    const l = Number(candles[i]!.low);
    const pc = Number(candles[i - 1]!.close);
    if (![h, l, pc].every(Number.isFinite)) continue;
    sum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    cnt += 1;
  }
  if (cnt <= 0) {
    const c = Number(candles[n - 1]?.close) || 0;
    return c > 0 ? c * 0.008 : 0;
  }
  return sum / cnt;
}

export function railBandFromGeoms(
  geoms: MergedDeskChannelGeom[]
): { lo: number; hi: number } | null {
  const primary = geoms.find((g) => g.primary) ?? geoms[0];
  if (!primary) return null;
  let lo = Math.min(primary.tipLower, primary.tipUpper);
  let hi = Math.max(primary.tipLower, primary.tipUpper);
  for (const g of geoms) {
    lo = Math.min(lo, g.tipLower, g.tipUpper);
    hi = Math.max(hi, g.tipLower, g.tipUpper);
  }
  if (!(hi > lo) || !(lo > 0)) return null;
  return { lo, hi };
}

function overlaps(aHi: number, aLo: number, bHi: number, bLo: number): boolean {
  return Math.max(aHi, aLo) >= Math.min(bHi, bLo) && Math.min(aHi, aLo) <= Math.max(bHi, bLo);
}

function nearRail(price: number, railLo: number, railHi: number, pad: number): boolean {
  if (!(price > 0)) return false;
  return price >= railLo - pad && price <= railHi + pad;
}

function zoneOnRail(
  top: number,
  bot: number,
  railLo: number,
  railHi: number,
  pad: number
): boolean {
  const hi = Math.max(top, bot);
  const lo = Math.min(top, bot);
  if (!(hi > 0) || !(lo > 0)) return nearRail((hi + lo) / 2 || hi || lo, railLo, railHi, pad);
  return overlaps(hi, lo, railHi + pad, railLo - pad);
}

function isTf4h(tf: string | null | undefined): boolean {
  return normalizeChartTimeframe(String(tf || '')) === '4h';
}

function htf4hFromLabel(label: string | null | undefined): boolean {
  return /4h|4시간/i.test(String(label || ''));
}

function pushCand(out: Cand[], c: Partial<Cand> & { price: number; sourceKo: string; weight: number }) {
  const p = Number(c.price);
  if (!Number.isFinite(p) || !(p > 0)) return;
  const top = Number(c.top) > 0 ? Number(c.top) : p;
  const bot = Number(c.bot) > 0 ? Number(c.bot) : p;
  out.push({
    price: p,
    top: Math.max(top, bot),
    bot: Math.min(top, bot),
    side: c.side ?? 'BOTH',
    sourceKo: c.sourceKo,
    weight: c.weight,
    htf4h: !!c.htf4h,
  });
}

function collectCandidates(params: {
  candles: Candle[];
  geoms: MergedDeskChannelGeom[];
  railLo: number;
  railHi: number;
  atr: number;
  analysis?: AnalyzeResponse | null;
  hotZones?: MergedDeskHotZoneEntry[] | null;
  vrvpPoc?: number | null;
  vrvpVaLow?: number | null;
  vrvpVaHigh?: number | null;
  coreSr?: MergedDeskCoreSrPack | null;
  dumpZones?: MtfDumpZoneSpec[] | null;
  keyZones?: MergedKeyZone[] | null;
  criticalZones?: MergedCriticalZone[] | null;
}): Cand[] {
  const { geoms, railLo, railHi, atr } = params;
  const pad = Math.max(atr * RAIL_NEAR_ATR, (railHi - railLo) * 0.08);
  const out: Cand[] = [];
  const accept = (top: number, bot: number, htf4h: boolean) => {
    if (htf4h) return zoneOnRail(top, bot, railLo, railHi, atr * 0.12);
    return zoneOnRail(top, bot, railLo, railHi, pad);
  };

  for (const g of geoms) {
    const w = g.primary ? 14 : 8;
    const tag = g.primary ? '레일' : g.horizonKo;
    pushCand(out, {
      price: g.tipLower,
      top: g.tipLower,
      bot: g.tipLower,
      side: 'SUPPORT',
      sourceKo: `${tag}하단`,
      weight: w,
    });
    pushCand(out, {
      price: g.tipUpper,
      top: g.tipUpper,
      bot: g.tipUpper,
      side: 'RESIST',
      sourceKo: `${tag}상단`,
      weight: w,
    });
    pushCand(out, {
      price: g.tipMid,
      top: g.tipMid,
      bot: g.tipMid,
      side: 'BOTH',
      sourceKo: `${tag}중선`,
      weight: Math.max(4, w - 4),
    });
  }

  const st = getLastInstitutionalBandEdges(params.candles);
  if (st) {
    if (accept(st.lower, st.lower, false)) {
      pushCand(out, {
        price: st.lower,
        side: 'SUPPORT',
        sourceKo: '기관하단',
        weight: 11,
      });
    }
    if (accept(st.upper, st.upper, false)) {
      pushCand(out, {
        price: st.upper,
        side: 'RESIST',
        sourceKo: '기관상단',
        weight: 11,
      });
    }
  }

  const poc = Number(params.vrvpPoc);
  const vaL = Number(params.vrvpVaLow);
  const vaH = Number(params.vrvpVaHigh);
  if (poc > 0 && accept(poc, poc, false)) {
    pushCand(out, { price: poc, side: 'BOTH', sourceKo: 'POC', weight: 10 });
  }
  if (vaL > 0 && accept(vaL, vaL, false)) {
    pushCand(out, { price: vaL, side: 'SUPPORT', sourceKo: 'VA하단', weight: 9 });
  }
  if (vaH > 0 && accept(vaH, vaH, false)) {
    pushCand(out, { price: vaH, side: 'RESIST', sourceKo: 'VA상단', weight: 9 });
  }

  for (const z of params.hotZones ?? []) {
    const mid = Number(z.mid);
    const top = Number(z.top) || mid;
    const bot = Number(z.bot) || mid;
    if (!accept(top, bot, false)) continue;
    const money =
      String(z.labelKo || '').includes('$$$$') ||
      (z.sources ?? []).some((s) => String(s).includes('$$$$'));
    const w = money ? 12 : 9;
    if (z.side === 'LONG') {
      pushCand(out, {
        price: mid > 0 ? mid : (top + bot) / 2,
        top,
        bot,
        side: 'SUPPORT',
        sourceKo: money ? '$$$$지지' : 'Hot지지',
        weight: w,
      });
    } else if (z.side === 'SHORT') {
      pushCand(out, {
        price: mid > 0 ? mid : (top + bot) / 2,
        top,
        bot,
        side: 'RESIST',
        sourceKo: money ? '$$$$저항' : 'Hot저항',
        weight: w,
      });
    }
  }

  const a = params.analysis;
  if (a?.supportLevel?.price && accept(a.supportLevel.price, a.supportLevel.price, false)) {
    pushCand(out, {
      price: a.supportLevel.price,
      side: 'SUPPORT',
      sourceKo: '분석지지',
      weight: 9,
    });
  }
  if (a?.resistanceLevel?.price && accept(a.resistanceLevel.price, a.resistanceLevel.price, false)) {
    pushCand(out, {
      price: a.resistanceLevel.price,
      side: 'RESIST',
      sourceKo: '분석저항',
      weight: 9,
    });
  }
  const sob = a?.nearestSupportOb;
  if (sob && sob.low > 0 && sob.high > 0 && accept(sob.high, sob.low, false)) {
    pushCand(out, {
      price: (sob.low + sob.high) / 2,
      top: sob.high,
      bot: sob.low,
      side: 'SUPPORT',
      sourceKo: 'OB지지',
      weight: 8,
    });
  }
  const rob = a?.nearestResistanceOb;
  if (rob && rob.low > 0 && rob.high > 0 && accept(rob.high, rob.low, false)) {
    pushCand(out, {
      price: (rob.low + rob.high) / 2,
      top: rob.high,
      bot: rob.low,
      side: 'RESIST',
      sourceKo: 'OB저항',
      weight: 8,
    });
  }

  for (const z of params.coreSr?.all ?? []) {
    const htf = (z.sources ?? []).some((s) => htf4hFromLabel(s)) || htf4hFromLabel(z.reasonKo);
    if (!accept(z.top, z.bot, htf)) continue;
    pushCand(out, {
      price: z.mid,
      top: z.top,
      bot: z.bot,
      side: z.side,
      sourceKo: z.rank === 1 ? (z.side === 'SUPPORT' ? '핵심존하' : '핵심존상') : '핵심존',
      weight: z.rank === 1 ? 10 : 7,
      htf4h: htf,
    });
  }

  for (const z of params.keyZones ?? []) {
    if (!accept(z.top, z.bot, false)) continue;
    pushCand(out, {
      price: z.price || (z.top + z.bot) / 2,
      top: z.top,
      bot: z.bot,
      side: z.kind === 'demand' ? 'SUPPORT' : 'RESIST',
      sourceKo: z.kind === 'demand' ? '수요존' : '공급존',
      weight: 7 + Math.min(4, z.score),
    });
  }

  for (const z of params.criticalZones ?? []) {
    const htf = htf4hFromLabel(z.htfLabel);
    if (!accept(z.top, z.bot, htf)) continue;
    const isSup = z.scenario === 'if_decline' || z.kind === 'demand';
    pushCand(out, {
      price: z.price || (z.top + z.bot) / 2,
      top: z.top,
      bot: z.bot,
      side: isSup ? 'SUPPORT' : 'RESIST',
      sourceKo: htf ? '4h임계' : '임계존',
      weight: (z.isPrimary ? 10 : 7) + (htf ? 8 : 0),
      htf4h: htf,
    });
  }

  for (const z of params.dumpZones ?? []) {
    const htf = isTf4h(z.sourceTf);
    if (!accept(z.top, z.bot, htf)) continue;
    const isCeil = z.bandRole === 'ceiling';
    pushCand(out, {
      price: z.mid || (z.top + z.bot) / 2,
      top: z.top,
      bot: z.bot,
      side: isCeil ? 'RESIST' : 'SUPPORT',
      sourceKo: htf ? (isCeil ? '4h상단' : '4h하단') : isCeil ? '폭등감시' : '폭락바닥',
      weight: htf ? 16 : 6,
      htf4h: htf,
    });
  }

  return out;
}

type Cluster = {
  price: number;
  top: number;
  bot: number;
  weight: number;
  sourceKos: string[];
  htf4h: boolean;
  n: number;
};

function clusterCands(cands: Cand[], gap: number): Cluster[] {
  if (!cands.length) return [];
  const sorted = [...cands].sort((a, b) => a.price - b.price);
  const groups: Cand[][] = [];
  let cur: Cand[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i]!;
    const last = cur[cur.length - 1]!;
    if (Math.abs(p.price - last.price) <= gap) cur.push(p);
    else {
      groups.push(cur);
      cur = [p];
    }
  }
  groups.push(cur);
  return groups.map((g) => {
    let wSum = 0;
    let px = 0;
    let top = -Infinity;
    let bot = Infinity;
    const src: string[] = [];
    let htf = false;
    for (const c of g) {
      wSum += c.weight;
      px += c.price * c.weight;
      top = Math.max(top, c.top, c.price);
      bot = Math.min(bot, c.bot, c.price);
      if (!src.includes(c.sourceKo)) src.push(c.sourceKo);
      if (c.htf4h) htf = true;
    }
    return {
      price: wSum > 0 ? px / wSum : g[0]!.price,
      top,
      bot,
      weight: wSum,
      sourceKos: src.slice(0, 6),
      htf4h: htf,
      n: g.length,
    };
  });
}

function scoreHoldFail(
  candles: Candle[],
  level: number,
  side: RbCoreSrSide,
  atr: number
): { touches: number; holdN: number; failN: number; holdPct: number | null } {
  const n = candles.length;
  if (n < 8 || !(level > 0) || !(atr > 0)) {
    return { touches: 0, holdN: 0, failN: 0, holdPct: null };
  }
  const startI = Math.max(2, n - LOOKBACK_BARS);
  const tol = Math.max(atr * TOUCH_ATR, level * 0.0008);
  let touches = 0;
  let holdN = 0;
  let failN = 0;
  let cooldown = 0;
  for (let i = startI; i < n - 2; i++) {
    if (cooldown > 0) {
      cooldown -= 1;
      continue;
    }
    const c = candles[i]!;
    if (c.low > level + tol || c.high < level - tol) continue;
    const fromAbove = c.close >= level || (c.open + c.close) / 2 >= level;
    if (side === 'SUPPORT' && !fromAbove) continue;
    if (side === 'RESIST' && fromAbove) continue;
    touches += 1;
    const end = Math.min(n - 1, i + HORIZON_BARS);
    const last = candles[end]!;
    if (side === 'SUPPORT') {
      if (last.close >= level * 0.997) holdN += 1;
      else failN += 1;
    } else if (last.close <= level * 1.003) holdN += 1;
    else failN += 1;
    cooldown = 2;
  }
  const den = holdN + failN;
  const holdPct =
    den >= SAMPLE_PCT_MIN ? Math.round((holdN / den) * 100) : null;
  return { touches, holdN, failN, holdPct };
}

function pickBest(
  clusters: Cluster[],
  close: number,
  atr: number,
  side: RbCoreSrSide
): Cluster | null {
  if (!clusters.length) return null;
  const pad = atr * 0.22;
  let pool =
    side === 'SUPPORT'
      ? clusters.filter((c) => c.price <= close + pad)
      : clusters.filter((c) => c.price >= close - pad);
  if (!pool.length) {
    pool =
      side === 'SUPPORT'
        ? clusters.filter((c) => c.price <= close)
        : clusters.filter((c) => c.price >= close);
  }
  if (!pool.length) pool = clusters;
  let best: Cluster | null = null;
  let bestScore = -Infinity;
  for (const c of pool) {
    const dist = Math.abs(c.price - close) / Math.max(atr, 1e-9);
    const near = dist <= 2.4 ? 6 - dist * 1.4 : 2 - dist * 0.35;
    const htf = c.htf4h ? 8 : 0;
    const srcN = Math.min(6, c.sourceKos.length) * 1.6;
    const score = c.weight + htf + srcN + near;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function levelFromCluster(
  c: Cluster,
  side: RbCoreSrSide,
  candles: Candle[],
  atr: number
): RbCoreSrLevel {
  const st = scoreHoldFail(candles, c.price, side, atr);
  const name = side === 'SUPPORT' ? '핵심지지' : '핵심저항';
  const verb = side === 'SUPPORT' ? '유지' : '거부';
  const bits = [name];
  if (c.htf4h) bits.push('4h겹');
  if (st.touches > 0) {
    bits.push(`터치${st.touches}`);
    bits.push(`${verb}${st.holdN}`);
    bits.push(`실패${st.failN}`);
  }
  const titleKo = bits.join(' ');
  const src = c.sourceKos.slice(0, 4).join('+');
  const tipKo =
    st.holdPct != null
      ? `${src} · 터치 후 ${verb} ${st.holdN}/${st.holdN + st.failN} (조건부, 표본 ${st.touches})`
      : st.touches > 0
        ? `${src} · 터치${st.touches} ${verb}${st.holdN} 실패${st.failN} (표본 적음)`
        : `${src} · 최근 창 터치 없음`;
  return {
    side,
    price: c.price,
    sourceKos: c.sourceKos,
    weight: c.weight,
    htf4h: c.htf4h,
    touches: st.touches,
    holdN: st.holdN,
    failN: st.failN,
    holdPct: st.holdPct,
    titleKo,
    tipKo,
  };
}

function toPriceLine(lv: RbCoreSrLevel): AtlasPulsePriceLine {
  const isSup = lv.side === 'SUPPORT';
  return {
    price: lv.price,
    color: isSup ? '#22D3EE' : '#FB7185',
    title: lv.side === 'SUPPORT' ? '핵심지지' : '핵심저항',
    lineWidth: 3,
    lineStyle: 'solid',
    axisLabel: true,
  };
}

function toOverlay(lv: RbCoreSrLevel, candles: Candle[]): OverlayItem {
  const isSup = lv.side === 'SUPPORT';
  const n = candles.length;
  const t1 = Number(candles[Math.max(0, n - 64)]?.time);
  const t2 = Number(candles[n - 1]?.time);
  const name = isSup ? '핵심지지' : '핵심저항';
  return {
    id: isSup ? 'merged-desk-rb-core-sr-support' : 'merged-desk-rb-core-sr-resist',
    kind: 'keyLevel',
    label: name,
    zoneFaceBase: lv.titleKo,
    labelTooltip: lv.tipKo,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: t1 as UTCTimestamp,
    time2: t2 as UTCTimestamp,
    price1: lv.price,
    price2: lv.price,
    confidence: 90,
    color: isSup ? '#22D3EE' : '#FB7185',
    lineLabelColor: isSup ? '#ecfeff' : '#fff1f2',
    labelBackgroundColor: isSup ? 'rgba(8,47,73,0.96)' : 'rgba(136,19,55,0.96)',
    labelTextColor: '#ffffff',
    lineStrokeWidth: 3,
    category: 'structure',
    zonePulse: true,
    overlayZoneExtraClass: 'merged-desk-rb-core-sr-line merged-desk-rb-core-sr-keep',
  };
}

export function buildMergedDeskRbCoreSrCluster(params: {
  candles: Candle[];
  geoms: MergedDeskChannelGeom[];
  analysis?: AnalyzeResponse | null;
  hotZones?: MergedDeskHotZoneEntry[] | null;
  vrvpPoc?: number | null;
  vrvpVaLow?: number | null;
  vrvpVaHigh?: number | null;
  coreSr?: MergedDeskCoreSrPack | null;
  dumpZones?: MtfDumpZoneSpec[] | null;
  keyZones?: MergedKeyZone[] | null;
  criticalZones?: MergedCriticalZone[] | null;
}): MergedDeskRbCoreSrClusterPack | null {
  const candles = params.candles;
  const band = railBandFromGeoms(params.geoms);
  if (!band || candles.length < 12) return null;
  const close = Number(candles[candles.length - 1]?.close) || 0;
  if (!(close > 0)) return null;
  const atr = atrApprox(candles);
  if (!(atr > 0)) return null;

  const raw = collectCandidates({ ...params, railLo: band.lo, railHi: band.hi, atr });
  if (!raw.length) return null;

  const gap = Math.max(atr * CLUSTER_ATR, close * 0.0035);
  const supCands = raw.filter((c) => c.side === 'SUPPORT' || c.side === 'BOTH');
  const resCands = raw.filter((c) => c.side === 'RESIST' || c.side === 'BOTH');
  const supClusters = clusterCands(supCands, gap);
  const resClusters = clusterCands(resCands, gap);

  let supCl = pickBest(supClusters, close, atr, 'SUPPORT');
  let resCl = pickBest(resClusters, close, atr, 'RESIST');
  if (!supCl) {
    supCl = {
      price: band.lo,
      top: band.lo,
      bot: band.lo,
      weight: 8,
      sourceKos: ['레일하단'],
      htf4h: false,
      n: 1,
    };
  }
  if (!resCl) {
    resCl = {
      price: band.hi,
      top: band.hi,
      bot: band.hi,
      weight: 8,
      sourceKos: ['레일상단'],
      htf4h: false,
      n: 1,
    };
  }
  if (supCl && resCl && Math.abs(supCl.price - resCl.price) <= gap * 0.6) {
    if (supCl.price <= close) resCl = null;
    else supCl = null;
  }

  const support = supCl ? levelFromCluster(supCl, 'SUPPORT', candles, atr) : null;
  const resist = resCl ? levelFromCluster(resCl, 'RESIST', candles, atr) : null;
  if (!support && !resist) return null;

  const priceLines: AtlasPulsePriceLine[] = [];
  const overlays: OverlayItem[] = [];
  if (support) {
    priceLines.push(toPriceLine(support));
    overlays.push(toOverlay(support, candles));
  }
  if (resist) {
    priceLines.push(toPriceLine(resist));
    overlays.push(toOverlay(resist, candles));
  }

  const bits: string[] = [];
  if (support) bits.push(support.titleKo);
  if (resist) bits.push(resist.titleKo);
  return {
    support,
    resist,
    priceLines,
    overlays,
    summaryKo: bits.join(' · ') || '레일 핵심 S/R 없음',
    railLo: band.lo,
    railHi: band.hi,
  };
}

/** 합류 2+ · 방향 있을 때만 채널 플랜 진입을 핵심 S/R에 스냅. E/SL은 ActiveTrade 전폭선. */
export function snapChannelPlanToRbCoreSr<T extends SnapPlan>(
  plan: T | null,
  cluster: MergedDeskRbCoreSrClusterPack | null,
  opts: { atr: number; placeRefOk: boolean }
): T | null {
  if (!plan || !cluster || !opts.placeRefOk) return plan;
  const atr = opts.atr > 0 ? opts.atr : Math.abs(plan.entry) * 0.008;
  const maxDist = atr * 1.35;
  let entry = plan.entry;
  let stopLoss = plan.stopLoss;
  const reasons = [...plan.reasonsKo];

  if (plan.direction === 'LONG' && cluster.support) {
    const px = cluster.support.price;
    if (Math.abs(entry - px) <= maxDist || Math.abs(stopLoss - px) <= maxDist * 1.2) {
      entry = px;
      if (!(stopLoss < entry - atr * 0.12)) stopLoss = entry - Math.max(atr * 0.35, entry * 0.0015);
      reasons.push('레일핵심지지');
    }
  } else if (plan.direction === 'SHORT' && cluster.resist) {
    const px = cluster.resist.price;
    if (Math.abs(entry - px) <= maxDist || Math.abs(stopLoss - px) <= maxDist * 1.2) {
      entry = px;
      if (!(stopLoss > entry + atr * 0.12)) stopLoss = entry + Math.max(atr * 0.35, entry * 0.0015);
      reasons.push('레일핵심저항');
    }
  } else {
    return plan;
  }

  if (entry === plan.entry && stopLoss === plan.stopLoss) return plan;
  const rr = calcTradeRewardRisk(entry, stopLoss, plan.tp1);
  return {
    ...plan,
    entry,
    stopLoss,
    invalidationPrice: stopLoss,
    rr: rr != null && Number.isFinite(rr) ? rr : plan.rr,
    reasonsKo: reasons.slice(0, 8),
    sourceKo: `${plan.sourceKo}·핵심S/R`,
  };
}
