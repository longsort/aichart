/**
 * 통합·분석 — TradingView/ARES 참조형 매매 차트 비주얼.
 * 번호·가격 수요/공급 밴드 · 포지션 박스 · 진입 마커 · E/SL/TP 라인.
 * 조건부 참고용 — 확정 수익·투자 권유 아님.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import type { MonthDeskStrikeDeskBundle, MonthDeskStrikeLeg } from '@/lib/monthDeskStrikeDesk';
import { enrichStrikeDeskWithAi } from '@/lib/monthDeskStrikeAiSignal';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import {
  MERGED_VRVP_KO,
  mergedVrvpPocTitle,
  mergedVrvpPocTone,
  mergedVrvpVaHighTitle,
  mergedVrvpVaLowTitle,
} from '@/lib/mergedAnalysisVrvpLabels';
import type { UnifiedDeskTradePlan } from '@/lib/unifiedDeskTradePlan';
import { buildMergedDeskUnifiedTradePriceLines } from '@/lib/mergedDeskUnifiedTradeRails';
import { mergedDeskLastCandleZoneTimes } from '@/lib/mergedAnalysisOverlayTimes';

function fmtPx(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return p.toFixed(1);
  if (a >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function vrvpSpotMoveFootLocal(params: {
  upsidePct: number | null | undefined;
  downsidePct: number | null | undefined;
}): string {
  const up = params.upsidePct;
  const dn = params.downsidePct;
  const upS = up != null && Number.isFinite(up) ? `${up >= 0 ? '+' : ''}${up.toFixed(1)}%` : '—';
  const dnS = dn != null && Number.isFinite(dn) ? `${dn >= 0 ? '-' : ''}${Math.abs(dn).toFixed(1)}%` : '—';
  return `현물 VA기준 ↑${upS} ↓${dnS} · 추정`;
}

export type MergedAresZoneRole = 'sl' | 'entry' | 'tp1' | 'tp2' | 'tp3';

export type MergedAresLevel = {
  index: number;
  role: MergedAresZoneRole;
  roleKo: string;
  kind: 'demand' | 'supply';
  price: number;
  top: number;
  bot: number;
  label: string;
  chartLabel: string;
};

const ROLE_KO: Record<MergedAresZoneRole, string> = {
  sl: '손절 SL',
  entry: '진입 E',
  tp1: '목표 TP1',
  tp2: '목표 TP2',
  tp3: '목표 TP3',
};

function zoneKind(side: 'LONG' | 'SHORT', role: MergedAresZoneRole): 'demand' | 'supply' {
  if (side === 'LONG') {
    return role === 'sl' || role === 'entry' ? 'demand' : 'supply';
  }
  return role === 'sl' || role === 'entry' ? 'supply' : 'demand';
}

export function mergedAresPriceRange(levels: MergedAresLevel[]): { min: number; max: number } | null {
  if (!levels.length) return null;
  return {
    min: Math.min(...levels.map((l) => l.bot)),
    max: Math.max(...levels.map((l) => l.top)),
  };
}

/** LWC 가격축 — E/SL/TP 점선 + 우측 라벨 (HTML 라벨 스택 방지) */
export function buildMergedAresPriceLines(leg: MonthDeskStrikeLeg | null): AtlasPulsePriceLine[] {
  if (!leg) return [];
  return [
    { price: leg.entry, color: '#FACC15', title: 'E', lineWidth: 2, lineStyle: 'solid' },
    { price: leg.stopLoss, color: '#F87171', title: 'SL', lineWidth: 2, lineStyle: 'dashed' },
    { price: leg.tp1, color: '#86EFAC', title: 'TP1', lineWidth: 1, lineStyle: 'dotted' },
    { price: leg.tp2, color: '#7DD3FC', title: 'TP2', lineWidth: 1, lineStyle: 'dotted' },
    { price: leg.tp3, color: '#A78BFA', title: 'TP3', lineWidth: 1, lineStyle: 'dotted' },
  ];
}

/** VRVP 최다거래 — 매수최다=초록 · 매도최다=빨강 · 상태·강도 포함 */
export function buildMergedVrvpPocPriceLine(
  poc: number | null | undefined,
  bias?: {
    side?: 'buy' | 'sell' | 'balanced' | null;
    buyPct?: number | null;
    sellPct?: number | null;
    upsidePct?: number | null;
    downsidePct?: number | null;
    stateKo?: string | null;
    spotToPocPct?: number | null;
    strength?: number | null;
    scenarioKo?: string | null;
  } | null
): AtlasPulsePriceLine | null {
  if (poc == null || !Number.isFinite(poc)) return null;
  const tone = mergedVrvpPocTone({
    side: bias?.side,
    buyPct: bias?.buyPct,
    sellPct: bias?.sellPct,
    strength: bias?.strength,
  });
  const side = tone.side;
  const strong = tone.strong;
  const color = tone.lineHex;

  const title = mergedVrvpPocTitle(poc, fmtPx, bias);
  const stateBit = bias?.stateKo ? ` · ${bias.stateKo}` : '';
  const distBit =
    bias?.spotToPocPct != null && Number.isFinite(bias.spotToPocPct)
      ? bias.spotToPocPct > 0
        ? ` · +${bias.spotToPocPct}%`
        : bias.spotToPocPct < 0
          ? ` · ${bias.spotToPocPct}%`
          : ''
      : '';
  const move =
    bias?.upsidePct != null || bias?.downsidePct != null
      ? ` · ${vrvpSpotMoveFootLocal({
          upsidePct: bias?.upsidePct,
          downsidePct: bias?.downsidePct,
        })}`
      : '';
  const strBit =
    bias?.strength != null && bias.strength > 0 ? ` · 강${Math.round(bias.strength)}` : '';
  return {
    price: poc,
    color,
    title: `${title}${stateBit}${distBit}${strBit}${move}`,
    lineWidth: strong ? 3 : 2,
    lineStyle: side === 'balanced' || side == null ? 'dashed' : 'solid',
    axisLabel: true,
  };
}

/** VRVP POC + VA + 인접 HVN + 진행최다 + 근처고거래 — 가격축 전폭선 */
export function buildMergedVrvpPriceLines(
  profile: {
    poc: number | null;
    vaHigh: number | null;
    vaLow: number | null;
    timeframe?: string;
    pocSideBias?: 'buy' | 'sell' | 'balanced' | null;
    pocBuyPct?: number | null;
    pocSellPct?: number | null;
    spotUpsidePct?: number | null;
    spotDownsidePct?: number | null;
    pocStateKo?: string | null;
    spotToPocPct?: number | null;
    pocStrength?: number | null;
    scenarioKo?: string | null;
    nextHvnAbove?: number | null;
    nextHvnBelow?: number | null;
    developingPoc?: number | null;
    developingPocSideBias?: 'buy' | 'sell' | 'balanced' | null;
    developingBars?: number | null;
    nearHvnAbove?: number | null;
    nearHvnBelow?: number | null;
  } | null | undefined
): AtlasPulsePriceLine[] {
  if (!profile) return [];
  const out: AtlasPulsePriceLine[] = [];
  const side = profile.pocSideBias;
  const pocLine = buildMergedVrvpPocPriceLine(profile.poc, {
    side,
    buyPct: profile.pocBuyPct,
    sellPct: profile.pocSellPct,
    upsidePct: profile.spotUpsidePct,
    downsidePct: profile.spotDownsidePct,
    stateKo: profile.pocStateKo,
    spotToPocPct: profile.spotToPocPct,
    strength: profile.pocStrength,
    scenarioKo: profile.scenarioKo,
  });
  if (pocLine) out.push(pocLine);

  const vaHiColor =
    side === 'buy'
      ? 'rgba(74,222,128,0.55)'
      : side === 'sell'
        ? 'rgba(248,113,113,0.5)'
        : 'rgba(251,191,36,0.55)';
  const vaLoColor =
    side === 'buy'
      ? 'rgba(34,197,94,0.45)'
      : side === 'sell'
        ? 'rgba(239,68,68,0.42)'
        : 'rgba(251,191,36,0.45)';

  if (profile.vaHigh != null && Number.isFinite(profile.vaHigh)) {
    out.push({
      price: profile.vaHigh,
      color: vaHiColor,
      title: mergedVrvpVaHighTitle(profile.vaHigh, fmtPx),
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }
  if (profile.vaLow != null && Number.isFinite(profile.vaLow)) {
    out.push({
      price: profile.vaLow,
      color: vaLoColor,
      title: mergedVrvpVaLowTitle(profile.vaLow, fmtPx),
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }

  /** 진행 최다거래 — 급등·급락 후 현재 구간 기준 */
  if (profile.developingPoc != null && Number.isFinite(profile.developingPoc)) {
    const dSide = profile.developingPocSideBias;
    const dColor =
      dSide === 'buy' ? '#2dd4bf' : dSide === 'sell' ? '#fb7185' : '#67e8f9';
    const barsBit =
      profile.developingBars != null && profile.developingBars > 0
        ? ` · ${profile.developingBars}봉`
        : '';
    out.push({
      price: profile.developingPoc,
      color: dColor,
      title: `${MERGED_VRVP_KO.developingPoc} ${fmtPx(profile.developingPoc)}${barsBit}`,
      lineWidth: 2,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }

  /** 현재가 근처 고거래 — 먼 고정 POC와 구분 */
  if (profile.nearHvnAbove != null && Number.isFinite(profile.nearHvnAbove)) {
    out.push({
      price: profile.nearHvnAbove,
      color: 'rgba(45,212,191,0.7)',
      title: `${MERGED_VRVP_KO.nearHvnAbove} ${fmtPx(profile.nearHvnAbove)}`,
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }
  if (profile.nearHvnBelow != null && Number.isFinite(profile.nearHvnBelow)) {
    out.push({
      price: profile.nearHvnBelow,
      color: 'rgba(192,132,252,0.65)',
      title: `${MERGED_VRVP_KO.nearHvnBelow} ${fmtPx(profile.nearHvnBelow)}`,
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }

  if (profile.nextHvnAbove != null && Number.isFinite(profile.nextHvnAbove)) {
    const dupNear =
      profile.nearHvnAbove != null &&
      Math.abs(profile.nextHvnAbove - profile.nearHvnAbove) /
        Math.max(profile.nextHvnAbove, 1) <
        0.0015;
    if (!dupNear) {
      out.push({
        price: profile.nextHvnAbove,
        color: 'rgba(125,211,252,0.55)',
        title: `다음고거래↑ ${fmtPx(profile.nextHvnAbove)}`,
        lineWidth: 1,
        lineStyle: 'dotted',
        axisLabel: true,
      });
    }
  }
  if (profile.nextHvnBelow != null && Number.isFinite(profile.nextHvnBelow)) {
    const dupNear =
      profile.nearHvnBelow != null &&
      Math.abs(profile.nextHvnBelow - profile.nearHvnBelow) /
        Math.max(profile.nextHvnBelow, 1) <
        0.0015;
    if (!dupNear) {
      out.push({
        price: profile.nextHvnBelow,
        color: 'rgba(167,139,250,0.5)',
        title: `다음고거래↓ ${fmtPx(profile.nextHvnBelow)}`,
        lineWidth: 1,
        lineStyle: 'dotted',
        axisLabel: true,
      });
    }
  }
  return out;
}

export function buildMergedDeskPriceLines(
  leg: MonthDeskStrikeLeg | null,
  vrvp: Parameters<typeof buildMergedVrvpPriceLines>[0],
  unifiedPlan?: UnifiedDeskTradePlan | null
): AtlasPulsePriceLine[] {
  const trade =
    unifiedPlan && unifiedPlan.direction !== 'NEUTRAL' && unifiedPlan.entry > 0
      ? buildMergedDeskUnifiedTradePriceLines(unifiedPlan)
      : buildMergedAresPriceLines(leg);
  const sideTag =
    unifiedPlan?.direction === 'LONG'
      ? '▲ 롱'
      : unifiedPlan?.direction === 'SHORT'
        ? '▼ 숏'
        : leg?.side === 'LONG'
          ? '▲ 롱'
          : leg?.side === 'SHORT'
            ? '▼ 숏'
            : '';
  const tradeTagged =
    unifiedPlan && unifiedPlan.direction !== 'NEUTRAL'
      ? trade
      : trade.map((p) => ({
          ...p,
          title: sideTag ? `${sideTag} ${p.title}` : p.title,
        }));
  return [...tradeTagged, ...buildMergedVrvpPriceLines(vrvp)];
}

function bandHalf(price: number, atr: number): number {
  return Math.max(atr * 0.38, Math.abs(price) * 0.0018, 1e-9);
}

function chartSpan(candles: Candle[], timeframe: string): { t1: number; t2: number } {
  const { t1, t2 } = mergedDeskLastCandleZoneTimes(candles, timeframe);
  return { t1: Number(t1), t2: Number(t2) };
}

function estimateAtr(candles: Candle[]): number {
  const tail = candles.slice(-20);
  if (tail.length < 2) return Math.abs(tail[0]?.close ?? 1) * 0.01;
  let sum = 0;
  for (const c of tail) sum += Math.max(c.high - c.low, Math.abs(c.close) * 0.002);
  return sum / tail.length;
}

/** Strike 레그 → 0~4 번호 zone (SL·진입·TP1~3), 롱/숏 색 자동 */
export function buildMergedAresNumberedLevels(
  leg: MonthDeskStrikeLeg,
  candles: Candle[]
): MergedAresLevel[] {
  const atr = estimateAtr(candles);
  const slHalf = bandHalf(leg.stopLoss, atr);
  const tpHalf = (tp: number) => bandHalf(tp, atr);

  const defs: Array<{ role: MergedAresZoneRole; price: number; top: number; bot: number }> = [
    { role: 'sl', price: leg.stopLoss, top: leg.stopLoss + slHalf, bot: leg.stopLoss - slHalf },
    {
      role: 'entry',
      price: (leg.zoneTop + leg.zoneBot) / 2,
      top: leg.zoneTop,
      bot: leg.zoneBot,
    },
    { role: 'tp1', price: leg.tp1, top: leg.tp1 + tpHalf(leg.tp1), bot: leg.tp1 - tpHalf(leg.tp1) },
    { role: 'tp2', price: leg.tp2, top: leg.tp2 + tpHalf(leg.tp2), bot: leg.tp2 - tpHalf(leg.tp2) },
    { role: 'tp3', price: leg.tp3, top: leg.tp3 + tpHalf(leg.tp3), bot: leg.tp3 - tpHalf(leg.tp3) },
  ];

  return defs
    .sort((a, b) => a.price - b.price)
    .map((d, i) => {
      const kind = zoneKind(leg.side, d.role);
      const roleKo = ROLE_KO[d.role];
      return {
        index: i,
        role: d.role,
        roleKo,
        kind,
        price: d.price,
        top: d.top,
        bot: d.bot,
        label: `${i} / ${fmtPx(d.price)}`,
        chartLabel: `${i} · ${roleKo}`,
      };
    });
}

/** 통합 TP 단일 소스 — ARES 번호 zone 가격 */
export function buildMergedAresNumberedLevelsFromPlan(
  plan: UnifiedDeskTradePlan,
  candles: Candle[]
): MergedAresLevel[] {
  if (plan.direction === 'NEUTRAL' || plan.entry <= 0) return [];
  const atr = estimateAtr(candles);
  const slHalf = bandHalf(plan.stopLoss, atr);
  const entryHalf = Math.max(atr * 0.35, Math.abs(plan.entry) * 0.0012);
  const tpHalf = (tp: number) => bandHalf(tp, atr);
  const side = plan.direction;

  const defs: Array<{ role: MergedAresZoneRole; price: number; top: number; bot: number }> = [
    {
      role: 'sl',
      price: plan.stopLoss,
      top: plan.stopLoss + slHalf,
      bot: plan.stopLoss - slHalf,
    },
    {
      role: 'entry',
      price: plan.entry,
      top: plan.entry + entryHalf,
      bot: plan.entry - entryHalf,
    },
    {
      role: 'tp1',
      price: plan.tp1,
      top: plan.tp1 + tpHalf(plan.tp1),
      bot: plan.tp1 - tpHalf(plan.tp1),
    },
    {
      role: 'tp2',
      price: plan.tp2,
      top: plan.tp2 + tpHalf(plan.tp2),
      bot: plan.tp2 - tpHalf(plan.tp2),
    },
    {
      role: 'tp3',
      price: plan.tp3,
      top: plan.tp3 + tpHalf(plan.tp3),
      bot: plan.tp3 - tpHalf(plan.tp3),
    },
  ];

  return defs
    .sort((a, b) => a.price - b.price)
    .map((d, i) => {
      const kind = zoneKind(side, d.role);
      const roleKo = ROLE_KO[d.role];
      return {
        index: i,
        role: d.role,
        roleKo,
        kind,
        price: d.price,
        top: d.top,
        bot: d.bot,
        label: `${i} / ${fmtPx(d.price)}`,
        chartLabel: `${i} · ${roleKo}`,
      };
    });
}

function aresZoneOverlay(
  level: MergedAresLevel,
  t1: number,
  t2: number,
  active: boolean,
  side: 'LONG' | 'SHORT'
): OverlayItem {
  const demand = level.kind === 'demand';
  const sideTag = side === 'LONG' ? '▲ 롱' : '▼ 숏';
  const roleKo = level.roleKo;
  return {
    id: `merged-ares-zone-${level.index}-${level.role}`,
    kind: demand ? 'demandZone' : 'supplyZone',
    label: `${sideTag} · ${level.index} · ${roleKo}`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: t1 as UTCTimestamp,
    time2: t2 as UTCTimestamp,
    price1: level.top,
    price2: level.bot,
    confidence: active ? 99 : 92,
    color: demand ? 'rgba(59,130,246,0.28)' : 'rgba(239,68,68,0.26)',
    category: 'scenario',
    zoneFillPreserve: true,
    zonePulse: active,
    overlayZoneExtraClass: [
      'merged-ares-zone',
      'merged-ares-zone-caption',
      demand ? 'merged-ares-demand' : 'merged-ares-supply',
      `merged-ares-role-${level.role}`,
      active ? 'merged-ares-zone-active' : '',
    ]
      .filter(Boolean)
      .join(' '),
    lineLabelColor: demand ? '#93c5fd' : '#fca5a5',
    labelBackgroundColor: demand ? 'rgba(30,64,175,0.92)' : 'rgba(153,27,27,0.92)',
    labelTextColor: '#f8fafc',
    labelTooltip: `${sideTag} ARES — ${level.chartLabel} · ${demand ? '수요' : '공급'} zone (조건부 참고)`,
  };
}

function aresLine(
  id: string,
  label: string,
  price: number,
  color: string,
  t1: number,
  t2: number,
  dash?: string
): OverlayItem {
  return {
    id,
    kind: 'keyLevel',
    label,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: t1 as UTCTimestamp,
    time2: t2 as UTCTimestamp,
    price1: price,
    confidence: 96,
    color,
    category: 'scenario',
    lineDash: dash,
    lineStrokeWidth: 2,
    lineLabelColor: color,
    labelBackgroundColor: 'rgba(15,23,42,0.88)',
    labelTextColor: '#e2e8f0',
    overlayZoneExtraClass: 'merged-ares-level-line',
  };
}

/** 롱/숏 포지션 박스 — 참조 이미지 녹색 수익 구간 */
function buildAresPositionBox(
  leg: MonthDeskStrikeLeg,
  candles: Candle[],
  t1: number,
  t2: number
): OverlayItem | null {
  const isLong = leg.side === 'LONG';
  const profitTop = isLong ? leg.tp1 : leg.entry;
  const profitBot = isLong ? leg.entry : leg.tp1;
  if (!(profitTop > profitBot)) return null;

  return {
    id: `merged-ares-position-${leg.side.toLowerCase()}`,
    kind: isLong ? 'demandZone' : 'supplyZone',
    label: isLong ? `▲ 롱 E→TP1 ${fmtPx(leg.entry)}` : `▼ 숏 E→TP1 ${fmtPx(leg.entry)}`,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    time1: t1 as UTCTimestamp,
    time2: t2 as UTCTimestamp,
    price1: profitTop,
    price2: profitBot,
    confidence: 97,
    color: isLong ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.2)',
    category: 'scenario',
    zoneFillPreserve: true,
    overlayZoneExtraClass: [
      'merged-ares-zone',
      'merged-ares-zone-caption',
      `merged-ares-position-box merged-ares-position-${leg.side.toLowerCase()}`,
    ].join(' '),
    lineLabelColor: isLong ? '#86efac' : '#fca5a5',
    labelBackgroundColor: isLong ? 'rgba(22,101,52,0.94)' : 'rgba(127,29,29,0.94)',
    labelTextColor: '#fff',
    labelTooltip: `${isLong ? '▲ 롱' : '▼ 숏'} 시나리오 — E ${fmtPx(leg.entry)} · SL ${fmtPx(leg.stopLoss)} · TP1 ${fmtPx(leg.tp1)} (조건부 참고)`,
  };
}

/** EMA 리본 — 추세 밴드 */
function buildAresTrendRibbon(candles: Candle[], t1: number, t2: number): OverlayItem[] {
  const n = candles.length;
  if (n < 30) return [];
  const period = 21;
  const k = 2 / (period + 1);
  let ema = candles[0]!.close;
  const emaSeries: number[] = [ema];
  for (let i = 1; i < n; i++) {
    ema = candles[i]!.close * k + ema * (1 - k);
    emaSeries.push(ema);
  }
  const tail = candles.slice(-60);
  const emaTail = emaSeries.slice(-60);
  const out: OverlayItem[] = [];
  const step = 6;
  for (let i = 0; i < tail.length - step; i += step) {
    const c0 = tail[i]!;
    const c1 = tail[Math.min(tail.length - 1, i + step)]!;
    const e0 = emaTail[i] ?? c0.close;
    const e1 = emaTail[Math.min(emaTail.length - 1, i + step)] ?? c1.close;
    const hi = Math.max(c0.high, c1.high, e0, e1);
    const lo = Math.min(c0.low, c1.low, e0, e1);
    out.push({
      id: `merged-ares-ribbon-${i}`,
      kind: 'zone',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: Number(c0.time) as UTCTimestamp,
      time2: Number(c1.time) as UTCTimestamp,
      price1: hi,
      price2: lo,
      confidence: 70,
      color: 'rgba(148,163,184,0.14)',
      category: 'structure',
      zoneFillPreserve: true,
      overlayZoneExtraClass: 'merged-ares-trend-ribbon',
    });
  }
  void t1;
  void t2;
  return out.slice(-8);
}

export function buildMergedAresVisualOverlays(params: {
  bundle: MonthDeskStrikeDeskBundle;
  candles: Candle[];
  timeframe?: string;
}): OverlayItem[] {
  const { bundle, candles, timeframe = '4h' } = params;
  const leg =
    bundle.primary === 'LONG'
      ? bundle.long
      : bundle.primary === 'SHORT'
        ? bundle.short
        : bundle.long ?? bundle.short;
  if (!leg || candles.length < 8) return [];

  const { t1, t2 } = chartSpan(candles, timeframe);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return [];

  const levels = buildMergedAresNumberedLevels(leg, candles);
  const out: OverlayItem[] = [];

  for (const lv of levels) {
    const active = lv.role === 'entry';
    out.push(aresZoneOverlay(lv, t1, t2, active, leg.side));
  }

  const pos = buildAresPositionBox(leg, candles, t1, t2);
  if (pos) out.push(pos);

  const lastT = Number(candles[candles.length - 1]?.time) as UTCTimestamp;
  void lastT;

  return out;
}

/** 참조형 진입 아이콘 — 파란 사각(롱) · 노란 원(숏·공급거부) · HOT 🛒/⚡ · 전구간 */
export function buildMergedAresChartMarkers(params: {
  bundle: MonthDeskStrikeDeskBundle;
  candles: Candle[];
  analysis?: AnalyzeResponse | null;
}): AtlasPulseMarker[] {
  const { bundle, candles, analysis } = params;
  const enriched = enrichStrikeDeskWithAi(bundle, candles, analysis);
  const leg =
    enriched.primary === 'LONG'
      ? enriched.long
      : enriched.primary === 'SHORT'
        ? enriched.short
        : enriched.long ?? enriched.short;
  if (!leg || candles.length < 12) return [];

  const out: AtlasPulseMarker[] = [];
  const seen = new Set<number>();
  const window = candles;

  for (let i = 0; i < window.length; i++) {
    const c = window[i]!;
    const t = Number(c.time) as UTCTimestamp;
    if (!Number.isFinite(t) || seen.has(t)) continue;

    const atr = estimateAtr(candles.slice(0, i + 1));
    const mid = (leg.zoneTop + leg.zoneBot) / 2;
    const touchDemand = c.low <= leg.zoneTop && c.low >= leg.zoneBot - atr * 0.06;
    const touchSupply = c.high >= leg.zoneBot && c.high <= leg.zoneTop + atr * 0.06;
    const touchSl = Math.abs(c.low - leg.stopLoss) <= atr * 0.5;
    const demandBounce = touchDemand && c.close >= mid - atr * 0.04;
    const supplyReject =
      touchSupply &&
      c.close <= mid + atr * 0.04 &&
      c.high - Math.max(c.open, c.close) > (c.high - c.low) * 0.25;

    if (leg.side === 'LONG' && (demandBounce || touchSl)) {
      const meta = enriched.ai?.long;
      const hot = meta?.phase === 'hot';
      out.push({
        time: t,
        position: 'belowBar',
        shape: 'square',
        color: hot ? '#22c55e' : '#3b82f6',
        text: hot ? '🛒' : 'B',
        size: hot ? 2 : 1,
        id: `merged-ares-long-${t}`,
      });
      seen.add(t);
    } else if (leg.side === 'SHORT' && supplyReject) {
      const meta = enriched.ai?.short;
      const hot = meta?.phase === 'hot';
      out.push({
        time: t,
        position: 'aboveBar',
        shape: 'circle',
        color: hot ? '#fb923c' : '#eab308',
        text: hot ? '⚡' : 'S',
        size: hot ? 2 : 1,
        id: `merged-ares-short-${t}`,
      });
      seen.add(t);
    } else if (demandBounce && leg.side === 'LONG') {
      out.push({
        time: t,
        position: 'belowBar',
        shape: 'circle',
        color: '#f472b6',
        text: '◉',
        size: 1,
        id: `merged-ares-align-${t}`,
      });
      seen.add(t);
    }
  }

  const lastT = Number(candles[candles.length - 1]?.time) as UTCTimestamp;
  if (Number.isFinite(lastT) && !seen.has(lastT)) {
    const priMeta =
      enriched.primary === 'LONG' ? enriched.ai?.long : enriched.ai?.short;
    if (priMeta && priMeta.phase !== 'scan') {
      const isLong = enriched.primary === 'LONG';
      out.push({
        time: lastT,
        position: isLong ? 'belowBar' : 'aboveBar',
        shape: priMeta.phase === 'hot' ? 'square' : 'circle',
        color: isLong ? '#3b82f6' : '#eab308',
        text: priMeta.phase === 'hot' ? (isLong ? '🛒' : '⚡') : isLong ? 'B' : 'S',
        size: priMeta.phase === 'hot' ? 2 : 1,
        id: `merged-ares-live-${lastT}`,
      });
    }
  }

  return out;
}
