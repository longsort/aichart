/**
 * 마감·안착 — $$$$ 돈구간 + BOS/CHOCH/×/OB **통합·경량** 작도.
 * SMC 다이어그램과 돈구간 중복을 막고, 교재식 연동만 남긴다.
 */
import type { Candle, OverlayItem } from '@/types';
import { OVERLAY_COLORS } from '@/lib/overlayColors';
import { isMonthDeskHtfTimeframe } from '@/lib/monthDeskZonePrecision';
import { monthDeskTrainerSideColors } from '@/lib/monthDeskChartTrainerTheme';
import { normalizeChartTimeframe } from '@/lib/constants';
import {
  MONTH_DESK_MONEY_LABEL,
  buildMonthDeskHistoricalMoneyZoneOverlays,
  detectMonthDeskMoneyZones,
  monthDeskMoneyChartLabel,
  monthDeskMoneyDirectionHint,
  monthDeskMoneySideKo,
  type MonthDeskMoneyZone,
  type MonthDeskMoneyZoneHud,
} from '@/lib/monthDeskMoneyZone';
import { structureMarksFu, resolveStructureMarkPhase } from '@/lib/smcDeskOverlay';
import { structurePhaseLabelSuffix } from '@/lib/mergedDeskStructurePhaseKo';
import {
  extractMonthDeskMoneyAnchors,
  resolveMonthDeskMoneyPoolGeometry,
  type MonthDeskMoneyAnchor,
} from '@/lib/monthDeskMoneyAnchors';

export type MonthDeskSmcStructureMark = {
  tag: 'BOS' | 'CHOCH' | 'MSB';
  bias: 'bullish' | 'bearish';
  price: number;
  barTime: number;
  barIndex: number;
};

export type MonthDeskSmcLinkedOb = {
  priceTop: number;
  priceBot: number;
  barTime: number;
  bull: boolean;
};

export type MonthDeskSmcMoneyPool = MonthDeskMoneyZone & {
  linkedBos?: MonthDeskSmcStructureMark;
  linkedChoch?: MonthDeskSmcStructureMark;
  linkedOb?: MonthDeskSmcLinkedOb;
  sweepBarTime?: number;
  /** 0 = 핵심(존+라벨), 1+ = 보조(선만) */
  displayRank: number;
};

export type MonthDeskSmcMoneyPackHud = Omit<MonthDeskMoneyZoneHud, 'pools'> & {
  pools: MonthDeskSmcMoneyPool[];
  latestBos: MonthDeskSmcStructureMark | null;
  latestChoch: MonthDeskSmcStructureMark | null;
};

export type MonthDeskSmcMoneyPack = {
  hud: MonthDeskSmcMoneyPackHud;
  overlays: OverlayItem[];
};

export type MonthDeskSmcMoneyPackOptions = {
  /** 연합·타입옴·플랜 등 분석 zone — $$$$를 여기에 스냅 */
  anchorOverlays?: OverlayItem[];
  /** ChartView 통합 타점 병합 시 보조 풀·중복 zone 생략 */
  unifiedEntryMerge?: boolean;
};

type ObBlock = { leftIdx: number; top: number; bot: number; bull: boolean };

function atr14(candles: Candle[]): number {
  const n = candles.length;
  if (n < 16) {
    const last = candles[n - 1];
    return Math.max((last?.high ?? 0) - (last?.low ?? 0), (last?.close ?? 1) * 0.004);
  }
  let sum = 0;
  for (let i = n - 14; i < n; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    sum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  return sum / 14;
}

function collectObBlocks(candles: Candle[], start: number, atr: number): ObBlock[] {
  const n = candles.length;
  const out: ObBlock[] = [];
  if (atr <= 0 || n < start + 5) return out;
  const mult = 1.15;
  const seen = new Set<string>();
  for (let i = n - 4; i >= start + 1; i--) {
    if (out.length >= 6) break;
    const c = candles[i];
    const next = candles[i + 1];
    const bear = c.close < c.open;
    const bull = c.close > c.open;
    const top = Math.max(c.open, c.close);
    const bot = Math.min(c.open, c.close);
    if (bear && next.close > c.high && next.close - bot >= atr * mult) {
      const key = `b${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ leftIdx: i, top, bot, bull: true });
      }
    }
    if (bull && next.close < c.low && top - next.close >= atr * mult) {
      const key = `s${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ leftIdx: i, top, bot, bull: false });
      }
    }
  }
  return out;
}

function relDiff(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9);
}

function findSweepBarTime(
  candles: Candle[],
  poolPrice: number,
  side: 'LONG' | 'SHORT',
  fromIdx: number,
  end: number
): number | undefined {
  for (let j = Math.max(fromIdx, end - 20); j <= end; j++) {
    const c = candles[j];
    if (side === 'SHORT' && c.high > poolPrice && c.close < poolPrice) {
      return Number(c.time);
    }
    if (side === 'LONG' && c.low < poolPrice && c.close > poolPrice) {
      return Number(c.time);
    }
  }
  return undefined;
}

function toStructureMark(
  mk: { index: number; price: number; tag: 'BOS' | 'CHOCH' | 'MSB'; bias: 'bullish' | 'bearish' },
  candles: Candle[]
): MonthDeskSmcStructureMark {
  return {
    tag: mk.tag,
    bias: mk.bias,
    price: mk.price,
    barIndex: mk.index,
    barTime: Number(candles[mk.index]?.time),
  };
}

function linkPack(
  hud: MonthDeskMoneyZoneHud,
  candles: Candle[],
  swingPivot: number,
  start: number
): MonthDeskSmcMoneyPackHud {
  const L = Math.max(2, Math.min(4, Math.floor(swingPivot || 2)));
  const end = candles.length - 1;
  const atr = atr14(candles);
  const marks = structureMarksFu(candles, L, 8);
  const latestBos =
    [...marks].reverse().find((m) => m.tag === 'BOS' || m.tag === 'MSB') ?? null;
  const latestChoch = [...marks].reverse().find((m) => m.tag === 'CHOCH') ?? null;
  const obs = collectObBlocks(candles, start, atr);

  const pools: MonthDeskSmcMoneyPool[] = hud.pools.map((p, i) => {
    const sideHighs = p.side === 'SHORT';
    let linkedOb: MonthDeskSmcLinkedOb | undefined;
    for (const ob of obs) {
      const obMid = (ob.top + ob.bot) / 2;
      const matchSide = sideHighs ? !ob.bull : ob.bull;
      if (!matchSide) continue;
      if (relDiff(obMid, p.priceMid) > 0.018) continue;
      linkedOb = {
        priceTop: ob.top,
        priceBot: ob.bot,
        barTime: Number(candles[ob.leftIdx]?.time),
        bull: ob.bull,
      };
      break;
    }

    let linkedBos: MonthDeskSmcStructureMark | undefined;
    if (latestBos) {
      const bos = toStructureMark(latestBos, candles);
      const bosOk =
        (sideHighs && bos.bias === 'bullish' && relDiff(bos.price, p.priceMid) < 0.025) ||
        (!sideHighs && bos.bias === 'bearish' && relDiff(bos.price, p.priceMid) < 0.025);
      if (bosOk) linkedBos = bos;
    }

    let linkedChoch: MonthDeskSmcStructureMark | undefined;
    if (latestChoch) {
      const ch = toStructureMark(latestChoch, candles);
      if (relDiff(ch.price, p.priceMid) < 0.03) linkedChoch = ch;
    }

    const lastSwingIdx = Math.max(
      0,
      candles.findIndex((c) => Number(c.time) >= p.barTimeStart)
    );
    const sweepBarTime = findSweepBarTime(candles, p.priceMid, p.side, lastSwingIdx, end);

    return {
      ...p,
      swept: p.swept || sweepBarTime != null,
      linkedOb,
      linkedBos,
      linkedChoch,
      sweepBarTime,
      displayRank: i,
    };
  });

  return {
    ...hud,
    pools,
    latestBos: latestBos ? toStructureMark(latestBos, candles) : null,
    latestChoch: latestChoch ? toStructureMark(latestChoch, candles) : null,
  };
}

function fmt(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function buildStructureOverlay(
  mk: MonthDeskSmcStructureMark,
  candles: Candle[],
  timeframe: string,
  swingPivot: number
): OverlayItem {
  const n = candles.length;
  const L = Math.max(2, Math.min(4, Math.floor(swingPivot || 2)));
  const raw = structureMarksFu(candles, L, 8).find((m) => m.index === mk.barIndex);
  const phase = raw ? resolveStructureMarkPhase(raw, candles, n) : 'breakout';
  const isChoch = mk.tag === 'CHOCH';
  const bull = mk.bias === 'bullish';
  const baseHex = isChoch
    ? bull
      ? OVERLAY_COLORS.chochBullish
      : OVERLAY_COLORS.chochBearish
    : bull
      ? OVERLAY_COLORS.bosBullish
      : OVERLAY_COLORS.bosBearish;
  const i2 = Math.min(n - 1, mk.barIndex + 6);
  const suffix = structurePhaseLabelSuffix(phase);
  return {
    id: `month-desk-smc-${isChoch ? 'choch' : 'bos'}-${mk.barIndex}`,
    kind: isChoch ? 'choch' : 'bos',
    label: `${mk.tag}${suffix}`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: mk.barTime,
    time2: Number(candles[i2]?.time),
    price1: mk.price,
    price2: mk.price,
    confidence: 62,
    color: bull ? 'rgba(74,222,128,0.55)' : 'rgba(248,113,113,0.55)',
    lineLabelColor: baseHex,
    lineDash: '5 4',
    category: 'scenario',
    structureBias: mk.bias,
    labelTooltip: `[${timeframe}] ${mk.tag} — 돈구간 연동`,
    noProject: true,
  };
}

function sideLabelColors(isLong: boolean): {
  lineLabelColor: string;
  labelBackgroundColor: string;
  labelTextColor: string;
  zoneFill: string;
} {
  const s = monthDeskTrainerSideColors(isLong);
  return {
    lineLabelColor: s.lineLabel,
    labelBackgroundColor: s.labelBg,
    labelTextColor: s.labelText,
    zoneFill: s.zoneFill,
  };
}

function buildPoolOverlays(
  z: MonthDeskSmcMoneyPool,
  idx: number,
  candles: Candle[],
  anchors: MonthDeskMoneyAnchor[]
): OverlayItem[] {
  const out: OverlayItem[] = [];
  const isLong = z.side === 'LONG';
  const sideTag = isLong ? 'long' : 'short';
  const sideKo = monthDeskMoneySideKo(z.side);
  const sideColors = sideLabelColors(isLong);
  const primary = z.displayRank === 0;
  const geom = resolveMonthDeskMoneyPoolGeometry(z, candles, anchors);
  const { time1: t1, time2: t2, priceTop: zoneTop, priceBot: zoneBot, labelTime, labelPrice } = geom;

  const extras: string[] = [];
  if (z.linkedOb) extras.push('OB');
  if (z.linkedBos) extras.push(z.linkedBos.tag);
  const zoneLabel = monthDeskMoneyChartLabel(z.side, extras.length ? extras.join(' · ') : undefined);
  const dirHint = monthDeskMoneyDirectionHint(z.side);

  if (primary) {
    out.push({
      id: `month-desk-money-${sideTag}-${idx}-zone`,
      kind: 'zone',
      label: zoneLabel,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1,
      time2: t2,
      price1: zoneTop,
      price2: zoneBot,
      noProject: true,
      confidence: Math.min(96, Math.round(z.strength)),
      color: sideColors.zoneFill,
      category: 'scenario',
      labelTooltip: [
        `${sideKo} 돈구간 — ${dirHint}`,
        z.headlineKo,
        z.linkedOb ? `OB ${fmt(z.linkedOb.priceBot)}~${fmt(z.linkedOb.priceTop)}` : '',
        z.linkedBos ? `${z.linkedBos.tag} @ ${fmt(z.linkedBos.price)}` : '',
        z.swept ? '스윕(×) 완료' : '스윕(×) 전 — 유동성 대기',
        geom.snappedToAnchorId ? `분석 zone 부착: ${geom.snappedToAnchorId}` : '터치 캔들 구간에 부착',
        'SMC 교육·참고 — 확정 매매 아님',
      ]
        .filter(Boolean)
        .join('\n'),
      zoneFillPreserve: true,
      zonePulse: z.swept,
      lineLabelColor: sideColors.lineLabelColor,
      labelBackgroundColor: sideColors.labelBackgroundColor,
      labelTextColor: sideColors.labelTextColor,
      overlayZoneExtraClass: `overlay-zone--monthdesk-money overlay-zone--monthdesk-money--${sideTag} overlay-zone--monthdesk-money--pool overlay-zone--monthdesk-money--primary`,
    });
  }

  const isInternalTrend =
    z.poolKind === 'internal_trend' &&
    z.trendTime1 != null &&
    z.trendPrice1 != null &&
    z.trendTime2 != null &&
    z.trendPrice2 != null;

  out.push({
    id: `month-desk-money-${sideTag}-${idx}-liq`,
    kind: 'trendLine',
    label: monthDeskMoneyChartLabel(z.side),
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: isInternalTrend ? z.trendTime1! : t1,
    time2: isInternalTrend ? z.trendTime2! : t2,
    price1: isInternalTrend ? z.trendPrice1! : z.priceMid,
    price2: isInternalTrend ? z.trendPrice2! : z.priceMid,
    confidence: 88,
    color: isLong ? 'rgba(74,222,128,0.75)' : 'rgba(248,113,113,0.75)',
    lineLabelColor: sideColors.lineLabelColor,
    labelBackgroundColor: sideColors.labelBackgroundColor,
    labelTextColor: sideColors.labelTextColor,
    lineDash: primary ? '6 4' : '4 8',
    category: 'scenario',
    labelTooltip: `${sideKo} ${MONTH_DESK_MONEY_LABEL}\n${dirHint}`,
    noProject: true,
  });

  out.push({
    id: `month-desk-money-${sideTag}-${idx}-tag`,
    kind: 'label',
    label: monthDeskMoneyChartLabel(z.side),
    x1: 0,
    y1: 0,
    time1: labelTime,
    price1: labelPrice,
    confidence: 95,
    color: sideColors.labelTextColor,
    lineLabelColor: sideColors.lineLabelColor,
    labelBackgroundColor: sideColors.labelBackgroundColor,
    labelTextColor: sideColors.labelTextColor,
    category: 'scenario',
    labelTooltip: `${sideKo} · 터치 캔들\n${dirHint}`,
    noProject: true,
  });

  const touchIndices = z.anchorBarIndices ?? [];
  for (let ti = 0; ti < touchIndices.length && ti < 4; ti++) {
    const bi = touchIndices[ti]!;
    const c = candles[bi];
    if (!c) continue;
    out.push({
      id: `month-desk-money-${sideTag}-${idx}-touch-${bi}`,
      kind: 'label',
      label: '·',
      x1: 0,
      y1: 0,
      time1: Number(c.time),
      price1: isLong ? c.low : c.high,
      confidence: 70,
      color: sideColors.lineLabelColor,
      lineLabelColor: sideColors.lineLabelColor,
      category: 'scenario',
      noProject: true,
    });
  }

  if (z.sweepBarTime != null) {
    const sweepIdx = candles.findIndex((c) => Number(c.time) === z.sweepBarTime);
    const sweepC = sweepIdx >= 0 ? candles[sweepIdx] : candles[candles.length - 1];
    const sweepPrice = isLong ? sweepC?.low : sweepC?.high;
    if (sweepC && Number.isFinite(sweepPrice)) {
      out.push({
        id: `month-desk-money-${sideTag}-${idx}-sweep`,
        kind: 'label',
        label: `${sideKo} ×`,
        x1: 0,
        y1: 0,
        time1: z.sweepBarTime,
        price1: Number(sweepPrice) + (isLong ? -atr14(candles) * 0.15 : atr14(candles) * 0.15),
        confidence: 94,
        color: sideColors.lineLabelColor,
        lineLabelColor: sideColors.lineLabelColor,
        labelBackgroundColor: sideColors.labelBackgroundColor,
        labelTextColor: sideColors.labelTextColor,
        category: 'scenario',
        labelTooltip: `${sideKo} 스윕(×) — ${dirHint}`,
        noProject: true,
      });
    }
  }

  return out;
}

export function buildMonthDeskSmcMoneyPack(
  candles: Candle[],
  timeframe: string,
  swingPivot: number,
  density: 'lite' | 'full' = 'lite',
  options: MonthDeskSmcMoneyPackOptions = {}
): MonthDeskSmcMoneyPack {
  const emptyHud: MonthDeskSmcMoneyPackHud = {
    long: null,
    short: null,
    pools: [],
    latestBos: null,
    latestChoch: null,
  };
  if (candles.length < 24) return { hud: emptyHud, overlays: [] };

  const chartTf = normalizeChartTimeframe(timeframe);
  const htf = isMonthDeskHtfTimeframe(chartTf);
  /** pool zone은 통합 핵심 1개 + HTF는 과거 풀 스캔 확대 */
  const maxPools = density === 'full' ? (htf ? 8 : 6) : htf ? 6 : 4;
  const skipPoolZoneOverlays = options.unifiedEntryMerge !== false;
  const baseHud = detectMonthDeskMoneyZones(candles, timeframe, swingPivot, maxPools);
  const L = Math.max(2, Math.min(4, Math.floor(swingPivot || 2)));
  const start = Math.max(L, candles.length - 180);
  const hud = linkPack(baseHud, candles, swingPivot, start);

  const out: OverlayItem[] = [];
  const anchors = extractMonthDeskMoneyAnchors(options.anchorOverlays ?? []);

  const showChoch = density === 'full' || hud.latestChoch != null;
  const showBos = hud.latestBos != null;
  if (showBos && hud.latestBos) {
    out.push(buildStructureOverlay(hud.latestBos, candles, timeframe, swingPivot));
  }
  if (showChoch && hud.latestChoch && hud.latestChoch.barIndex !== hud.latestBos?.barIndex) {
    out.push(buildStructureOverlay(hud.latestChoch, candles, timeframe, swingPivot));
  }

  if (skipPoolZoneOverlays) {
    return { hud, overlays: out };
  }

  hud.pools.forEach((z, idx) => {
    out.push(...buildPoolOverlays(z, idx, candles, anchors));
  });

  return { hud, overlays: out };
}
