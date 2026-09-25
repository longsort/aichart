/**
 * 파랑빨강띠 — 레일LED · 안개포켓 · 구조문(중력우물).
 * 점선 남발 대신: 채널 레일 점등 + zone 안개 + 문 링.
 * E/SL/TP/무효는 전폭 실선 createPriceLine(한글)과 병행.
 * 확정 수익·승률 보장 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import { mergedDeskRbFutureTime2 } from '@/lib/mergedDeskBlueRedChannels';
import { MERGED_DESK_RIGHT_FUTURE_BARS } from '@/lib/mergedDeskSharedChartView';

/** MoneyEdge 플랜 최소 필드 (순환 import 방지) */
export type RbRailLedFogPlanLite = {
  direction: 'LONG' | 'SHORT';
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  invalidationPrice: number;
  status: string;
  statusKo: string;
  entryAllowed: boolean;
  edgeStateKo?: string;
  tp1Ko?: string;
  tp2Ko?: string;
};

function fmt(n: number): string {
  if (!(n > 0) || !Number.isFinite(n)) return '-';
  if (n >= 1000) return n.toFixed(0);
  if (n >= 100) return n.toFixed(1);
  return n.toFixed(2);
}

function approxAtr(candles: Candle[]): number {
  const n = candles.length;
  if (n < 3) return 0;
  const take = Math.min(14, n - 1);
  let sum = 0;
  for (let i = n - take; i < n; i++) {
    const c = candles[i]!;
    const p = candles[i - 1];
    const tr = Math.max(
      Number(c.high) - Number(c.low),
      p ? Math.abs(Number(c.high) - Number(p.close)) : 0,
      p ? Math.abs(Number(c.low) - Number(p.close)) : 0
    );
    sum += tr;
  }
  return sum / take;
}

/** 채널 띠·엣지에 레일LED 클래스 스탬프 (진입=녹 / 손절=빨 / 목표=호박) */
export function stampRbOverlaysWithRailLed(
  overlays: OverlayItem[],
  plan: RbRailLedFogPlanLite | null | undefined
): OverlayItem[] {
  if (!plan || !(plan.entry > 0)) {
    return overlays.map((o) => {
      const prev = String(o.overlayZoneExtraClass || '');
      if (!prev.includes('merged-desk-blue-red-channel') && !prev.includes('merged-desk-rb-channel')) {
        return o;
      }
      if (prev.includes('merged-desk-rb-rail-led')) return o;
      return {
        ...o,
        overlayZoneExtraClass: `${prev} merged-desk-rb-rail-led`.trim(),
      };
    });
  }

  const isLong = plan.direction === 'LONG';
  return overlays.map((o) => {
    const prev = String(o.overlayZoneExtraClass || '');
    const isRb =
      prev.includes('merged-desk-blue-red-channel') ||
      prev.includes('merged-desk-rb-channel') ||
      o.kind === 'channelBand';
    if (!isRb) return o;

    const isUp = prev.includes('merged-desk-rb-edge-up') || /upper|-상|-up/i.test(String(o.id || ''));
    const isDn = prev.includes('merged-desk-rb-edge-dn') || /lower|-하|-dn/i.test(String(o.id || ''));
    const isBand = o.kind === 'channelBand';

    const tags: string[] = ['merged-desk-rb-rail-led'];
    if (isBand) {
      tags.push('merged-desk-rb-rail-led--band', 'merged-desk-rb-fog-corridor');
    }
    if (isLong) {
      if (isDn) tags.push('merged-desk-rb-rail-led--entry');
      if (isUp) tags.push('merged-desk-rb-rail-led--resist');
    } else {
      if (isUp) tags.push('merged-desk-rb-rail-led--entry');
      if (isDn) tags.push('merged-desk-rb-rail-led--resist');
    }

    const cleaned = prev
      .replace(/\bmerged-desk-rb-rail-led(--\w+)?\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    /** 면 채움색은 사용자 농도(무색·연·중·진) 유지 — 덮어쓰지 않음. 상·하 레일만 LED 강조 */
    let color = o.color;
    if (!isBand) {
      if (isUp) color = 'rgba(248,113,113,0.95)';
      else if (isDn) color = 'rgba(56,189,248,0.95)';
    }

    return {
      ...o,
      color,
      lineStrokeWidth: isUp || isDn ? Math.max(Number(o.lineStrokeWidth) || 2, 3) : o.lineStrokeWidth,
      overlayZoneExtraClass: `${cleaned} ${tags.join(' ')}`.trim(),
    };
  });
}

/** 구조문 → 중력우물 링 클래스 */
export function stampRbDoorGravityWell(overlays: OverlayItem[]): OverlayItem[] {
  return overlays.map((o) => {
    const id = String(o.id || '');
    const prev = String(o.overlayZoneExtraClass || '');
    if (id !== 'merged-desk-rb-horizon-door' && !prev.includes('merged-desk-rb-horizon-door')) {
      return o;
    }
    if (prev.includes('merged-desk-rb-gravity-well')) return o;
    return {
      ...o,
      label: o.label || '구조문',
      zoneFaceBase: o.zoneFaceBase || '구조문',
      overlayZoneExtraClass: `${prev} merged-desk-rb-gravity-well merged-desk-rb-rail-led--door`.trim(),
      lineStrokeWidth: Math.max(Number(o.lineStrokeWidth) || 2, 3),
      color: o.color || 'rgba(250,204,21,0.95)',
    };
  });
}

/**
 * 안개포켓 — 진입/손절/목표/합류 (zone 면, 짧은 레일 금지).
 * 가격선과 병행.
 */
export function buildRbRailLedFogOverlays(
  plan: RbRailLedFogPlanLite,
  candles: Candle[]
): OverlayItem[] {
  if (!(plan.entry > 0) || candles.length < 8) return [];
  const n = candles.length;
  const lastT = Number(candles[n - 1]!.time);
  /** 면·존: 구조는 직전봉까지, 시각 연장은 우측 여백(+20)까지 */
  const endI = Math.max(0, n - 2);
  const formI = Math.max(0, endI - Math.min(64, Math.max(20, Math.floor(n * 0.32))));
  const formT = Number(candles[formI]!.time);
  const endT = mergedDeskRbFutureTime2(candles, lastT, n - 1, MERGED_DESK_RIGHT_FUTURE_BARS);
  if (!(endT > formT)) return [];

  const atr = approxAtr(candles);
  const half = atr > 0 ? atr * 0.42 : plan.entry * 0.0028;
  const isLong = plan.direction === 'LONG';
  const dead = plan.status === 'INVALID';
  const out: OverlayItem[] = [];

  const pushFog = (
    id: string,
    label: string,
    mid: number,
    pad: number,
    color: string,
    extra: string,
    conf: number,
    tip: string
  ) => {
    if (!(mid > 0)) return;
    out.push({
      id,
      kind: 'zone',
      label,
      zoneFaceBase: label,
      zoneFaceSignal: tip.slice(0, 16),
      x1: 0,
      y1: 0,
      confidence: conf,
      color,
      time1: formT,
      time2: endT,
      price1: mid + pad,
      price2: mid - pad,
      category: 'structure',
      overlayZoneExtraClass: `${extra} merged-desk-rb-fog-pocket merged-desk-zone-label-on merged-desk-zone-caption-clean merged-desk-rb-channel-keep`.trim(),
      labelTooltip: `${label}\n${tip}\n참고·승률아님`,
    });
  };

  pushFog(
    'merged-desk-rb-fog-entry',
    isLong ? '롱진입' : '숏진입',
    plan.entry,
    half,
    dead
      ? 'rgba(45,212,191,0.1)'
      : isLong
        ? 'rgba(74,222,128,0.2)'
        : 'rgba(251,113,133,0.2)',
    `merged-desk-rb-fog-entry merged-desk-entry-zone ${isLong ? 'merged-desk-rb-fog--long' : 'merged-desk-rb-fog--short'}`,
    plan.entryAllowed ? 90 : 74,
    `${plan.edgeStateKo || '게이트'} · ${plan.statusKo}`
  );

  if (plan.stopLoss > 0) {
    pushFog(
      'merged-desk-rb-fog-sl',
      '손절',
      plan.stopLoss,
      half * 0.7,
      dead ? 'rgba(248,113,113,0.08)' : 'rgba(248,113,113,0.18)',
      'merged-desk-rb-fog-sl merged-desk-sl-zone',
      72,
      `왜: ${isLong ? '저점 이탈' : '고점 이탈'} 위험`
    );
  }

  if (plan.tp1 > 0) {
    pushFog(
      'merged-desk-rb-fog-tp1',
      '목표1',
      plan.tp1,
      half * 0.8,
      dead ? 'rgba(251,191,36,0.08)' : 'rgba(251,191,36,0.18)',
      'merged-desk-rb-fog-tp merged-desk-tp-zone',
      76,
      plan.tp1Ko || '1차 목표·참고'
    );
  }
  if (plan.tp2 > 0) {
    pushFog(
      'merged-desk-rb-fog-tp2',
      '목표2',
      plan.tp2,
      half * 0.65,
      dead ? 'rgba(251,146,60,0.07)' : 'rgba(251,146,60,0.14)',
      'merged-desk-rb-fog-tp2 merged-desk-tp-zone',
      70,
      plan.tp2Ko || '2차 목표·참고'
    );
  }

  if (plan.stopLoss > 0 && Math.abs(plan.entry - plan.stopLoss) > half * 2) {
    const hi = Math.max(plan.entry, plan.stopLoss);
    const lo = Math.min(plan.entry, plan.stopLoss);
    pushFog(
      'merged-desk-rb-fog-hot',
      '합류',
      (hi + lo) / 2,
      Math.min(half * 0.5, (hi - lo) * 0.12),
      isLong ? 'rgba(45,212,191,0.12)' : 'rgba(244,114,182,0.12)',
      'merged-desk-rb-fog-hot merged-desk-hot-glow-band',
      62,
      '진입~손절 합류 안개'
    );
  }

  return out;
}

/** 채널 게이트 가격선 → 한글 실선 (롱진입/손절/목표/무효화) */
export function polishRbRailLedTradePriceLines(
  lines: AtlasPulsePriceLine[],
  plan: RbRailLedFogPlanLite
): AtlasPulsePriceLine[] {
  const isLong = plan.direction === 'LONG';
  const entryKo = isLong ? '롱진입' : '숏진입';
  return lines.map((pl) => {
    const t = String(pl.title || '');
    const p = Number(pl.price);
    if (!(p > 0)) return pl;
    /** 레일 핵심 S/R 통계 라벨 유지 — 진입 스냅과 가격이 같아도 덮지 않음 */
    if (/핵심지지|핵심저항/.test(t)) return pl;

    const near = (a: number, b: number) =>
      Math.abs(a - b) / Math.max(Math.abs(b), 1) <= 0.00035;

    if (near(p, plan.entry) || /관점|진입|E·|▲|▼/.test(t)) {
      return {
        ...pl,
        title: `${entryKo} ${fmt(plan.entry)}`,
        lineStyle: 'solid' as const,
        lineWidth: Math.max(Number(pl.lineWidth) || 2, 2) as 1 | 2 | 3 | 4,
        axisLabel: true,
      };
    }
    if (near(p, plan.stopLoss) || /손절|SL/.test(t)) {
      return {
        ...pl,
        title: `손절 ${fmt(plan.stopLoss)}`,
        lineStyle: 'solid' as const,
        lineWidth: 2 as 1 | 2 | 3 | 4,
        axisLabel: true,
        color: pl.color || '#F87171',
      };
    }
    if (plan.tp1 > 0 && (near(p, plan.tp1) || /TP1|익절TP1|목표1|매수목표|매도목표/.test(t))) {
      return {
        ...pl,
        title: `목표1 ${fmt(plan.tp1)}`,
        lineStyle: 'solid' as const,
        lineWidth: 2 as 1 | 2 | 3 | 4,
        axisLabel: true,
      };
    }
    if (plan.tp2 > 0 && (near(p, plan.tp2) || /TP2|익절TP2|목표2/.test(t))) {
      return {
        ...pl,
        title: `목표2 ${fmt(plan.tp2)}`,
        lineStyle: 'solid' as const,
        lineWidth: 2 as 1 | 2 | 3 | 4,
        axisLabel: true,
      };
    }
    if (plan.tp3 > 0 && (near(p, plan.tp3) || /TP3|익절TP3|목표3/.test(t))) {
      return {
        ...pl,
        title: `목표3 ${fmt(plan.tp3)}`,
        lineStyle: 'solid' as const,
        lineWidth: 1 as 1 | 2 | 3 | 4,
        axisLabel: true,
      };
    }
    if (
      (plan.invalidationPrice > 0 && near(p, plan.invalidationPrice)) ||
      /무효/.test(t)
    ) {
      return {
        ...pl,
        title: `무효화 ${fmt(plan.invalidationPrice > 0 ? plan.invalidationPrice : plan.stopLoss)}`,
        lineStyle: 'solid' as const,
        lineWidth: 2 as 1 | 2 | 3 | 4,
        axisLabel: true,
      };
    }
    return pl;
  });
}

/** MoneyEdge 팩에 레일LED·안개·중력우물 일괄 적용 + 우측 여백 연장 */
export function applyRbRailLedFogPack(params: {
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
  plan: RbRailLedFogPlanLite | null | undefined;
  candles: Candle[];
}): { overlays: OverlayItem[]; priceLines: AtlasPulsePriceLine[] } {
  const { plan, candles } = params;
  let overlays = stampRbDoorGravityWell(stampRbOverlaysWithRailLed(params.overlays, plan));
  let priceLines = params.priceLines;
  if (plan && plan.entry > 0) {
    overlays = [...overlays, ...buildRbRailLedFogOverlays(plan, candles)];
    priceLines = polishRbRailLedTradePriceLines(priceLines, plan);
  }
  overlays = extendRbOverlaysToRightPad(overlays, candles);
  return { overlays, priceLines };
}

/** tip존·안개 등 잔여 RB 면을 가격축 앞(+20)까지 연장. 구조문은 유지 */
function extendRbOverlaysToRightPad(overlays: OverlayItem[], candles: Candle[]): OverlayItem[] {
  if (candles.length < 2) return overlays;
  const n = candles.length;
  const tPad = mergedDeskRbFutureTime2(
    candles,
    Number(candles[n - 1]!.time),
    n - 1,
    MERGED_DESK_RIGHT_FUTURE_BARS
  );
  return overlays.map((o) => {
    const id = String(o.id || '');
    const extra = String(o.overlayZoneExtraClass || '');
    if (id === 'merged-desk-rb-horizon-door') return o;
    if (o.kind === 'label' && extra.includes('merged-desk-rb-tip-pin')) return o;
    const hit =
      id.startsWith('merged-desk-rb-fog-') ||
      id.startsWith('merged-desk-rb-tip-zone') ||
      extra.includes('merged-desk-rb-fog-pocket') ||
      extra.includes('merged-desk-rb-tip-zone') ||
      (extra.includes('merged-desk-rb-right-pad') === false &&
        (extra.includes('merged-desk-rb-channel') || extra.includes('merged-desk-blue-red-channel')) &&
        (o.kind === 'channelBand' || o.kind === 'trendLine'));
    if (!hit) return o;
    const t2 = Number(o.time2);
    if (t2 > 0 && t2 >= tPad) return o;
    if (o.kind === 'channelBand' && o.channelBand) {
      return {
        ...o,
        time2: tPad,
        channelBand: { ...o.channelBand, time2: tPad },
        overlayZoneExtraClass: `${extra} merged-desk-rb-right-pad`.trim(),
      };
    }
    return {
      ...o,
      time2: tPad,
      overlayZoneExtraClass: `${extra} merged-desk-rb-right-pad`.trim(),
    };
  });
}
