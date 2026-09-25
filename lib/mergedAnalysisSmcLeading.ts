/**
 * 통합·분석 — SMC 선행·실시간 (BOS 누적 · CHoCH · OB · 반등 목표).
 * 종가 확정 전 마지막 봉 high/low로 developing 구조 돌파도 선반영.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { AtlasPulseMarker } from '@/lib/monthDeskAtlasPulseDesk';
import type { UTCTimestamp } from 'lightweight-charts';
import { normalizeChartTimeframe } from '@/lib/constants';
import { chochMarkerLabelKo } from '@/lib/mergedDeskStructurePhaseKo';
import {
  resolveStructureMarkPhase,
  structureMarksFu,
  type StructureMarkPhase,
} from '@/lib/smcDeskOverlay';
import {
  mergedAnalysisChartZoneTimesSnapped,
  mergedWorkCandles,
  MERGED_ARES_ZONE_CAPTION_CLASS,
} from '@/lib/mergedAnalysisOverlayTimes';

export type MergedSmcStructureMark = {
  index: number;
  time: number;
  price: number;
  tag: 'BOS' | 'CHOCH' | 'MSB';
  bias: 'bullish' | 'bearish';
  phase: StructureMarkPhase | 'pending';
  developing: boolean;
};

export type MergedSmcLeadingOb = {
  id: string;
  bias: 'bullish' | 'bearish';
  low: number;
  high: number;
  time: number;
  chochIndex: number;
  labelKo: string;
};

export type MergedSmcBounceHint = {
  direction: 'up' | 'down';
  anchorPrice: number;
  anchorTop: number;
  anchorBot: number;
  anchorTime: number;
  legHigh: number;
  legLow: number;
  t1: number;
  t2: number;
  tmax: number;
  bosCount: number;
  strengthKo: string;
};

export type MergedSmcLeadingContext = {
  marks: MergedSmcStructureMark[];
  obs: MergedSmcLeadingOb[];
  bosCountInLeg: number;
  legDirection: 'down' | 'up' | 'range';
  lastChoch: MergedSmcStructureMark | null;
  bounceHint: MergedSmcBounceHint | null;
  summaryKo: string;
  detailKo: string;
  active: boolean;
};

function sourceCandles(candles: Candle[], timeframe: string): Candle[] {
  return mergedWorkCandles(candles, timeframe);
}

function swingPivot(tf: string): number {
  const t = normalizeChartTimeframe(tf);
  if (t === '1d' || t === '1w' || t === '1M') return 2;
  if (t === '4h' || t === '6h' || t === '12h') return 2;
  return 2;
}

function fmtPx(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return p.toFixed(0);
  if (a >= 1) return p.toFixed(1);
  return p.toFixed(3);
}

function overlayTimes(candles: Candle[], timeframe: string): { t1: number; t2: number } {
  const { t1, t2 } = mergedAnalysisChartZoneTimesSnapped(candles, timeframe);
  return { t1: Number(t1), t2: Number(t2) };
}

function findObBeforeBreak(
  candles: Candle[],
  breakIndex: number,
  bias: 'bullish' | 'bearish'
): { low: number; high: number; index: number } | null {
  const start = Math.max(1, breakIndex - 8);
  const end = breakIndex - 1;
  if (end <= start) return null;
  if (bias === 'bullish') {
    for (let i = end; i >= start; i--) {
      const c = candles[i]!;
      if (c.close < c.open) {
        return {
          index: i,
          low: Math.min(c.open, c.close),
          high: c.high,
        };
      }
    }
  } else {
    for (let i = end; i >= start; i--) {
      const c = candles[i]!;
      if (c.close > c.open) {
        return {
          index: i,
          low: c.low,
          high: Math.max(c.open, c.close),
        };
      }
    }
  }
  return null;
}

/** 마지막 봉 high/low로 developing CHoCH/BOS 선반영 */
function scanDevelopingMark(
  candles: Candle[],
  L: number,
  existing: Array<{ index: number; bias: string; tag: string }>
): MergedSmcStructureMark | null {
  const n = candles.length;
  if (n < L * 2 + 6) return null;
  const lastIdx = n - 1;
  const last = candles[lastIdx]!;
  if (existing.some((m) => m.index === lastIdx)) return null;

  let lastHigh: number | null = null;
  let lastHighIdx: number | null = null;
  let lastLow: number | null = null;
  let lastLowIdx: number | null = null;
  let trend = 0;

  for (let i = L; i < n - L; i++) {
    let isH = true;
    let isL = true;
    const hi = candles[i]!.high;
    const lo = candles[i]!.low;
    for (let k = 1; k <= L; k++) {
      if (candles[i - k]!.high >= hi) isH = false;
      if (candles[i + k]!.high > hi) isH = false;
      if (candles[i - k]!.low <= lo) isL = false;
      if (candles[i + k]!.low < lo) isL = false;
    }
    if (isH) {
      lastHighIdx = i;
      lastHigh = hi;
    }
    if (isL) {
      lastLowIdx = i;
      lastLow = lo;
    }

    const close = candles[i]!.close;
    if (lastHighIdx != null && lastHigh != null && i > lastHighIdx && close > lastHigh) {
      trend = trend <= 0 ? 1 : trend;
      if (trend === 1 && i < lastIdx) {
        /* BOS up on closed bar */
      }
    }
    if (lastLowIdx != null && lastLow != null && i > lastLowIdx && close < lastLow) {
      trend = trend >= 0 ? -1 : trend;
    }
  }

  // Recompute trend from marks on closed bars
  const closedMarks = structureMarksFu(candles.slice(0, -1), L, 24);
  trend = 0;
  for (const m of closedMarks) trend = m.bias === 'bullish' ? 1 : -1;

  const devHigh = Math.max(last.open, last.close, last.high);
  const devLow = Math.min(last.open, last.close, last.low);

  if (lastHigh != null && lastHighIdx != null && lastIdx > lastHighIdx && devHigh > lastHigh && last.close <= lastHigh) {
    const tag = trend <= 0 ? 'CHOCH' : 'BOS';
    return {
      index: lastIdx,
      time: Number(last.time),
      price: lastHigh,
      tag: tag as 'CHOCH' | 'BOS',
      bias: 'bullish',
      phase: 'pending',
      developing: true,
    };
  }
  if (lastLow != null && lastLowIdx != null && lastIdx > lastLowIdx && devLow < lastLow && last.close >= lastLow) {
    const tag = trend >= 0 ? 'CHOCH' : 'BOS';
    return {
      index: lastIdx,
      time: Number(last.time),
      price: lastLow,
      tag: tag as 'CHOCH' | 'BOS',
      bias: 'bearish',
      phase: 'pending',
      developing: true,
    };
  }

  if (lastHigh != null && lastHighIdx != null && lastIdx > lastHighIdx && last.close > lastHigh) {
    const tag = trend <= 0 ? 'CHOCH' : 'BOS';
    return {
      index: lastIdx,
      time: Number(last.time),
      price: lastHigh,
      tag: tag as 'CHOCH' | 'BOS',
      bias: 'bullish',
      phase: resolveStructureMarkPhase({ index: lastIdx, price: lastHigh, bias: 'bullish' }, candles, n),
      developing: true,
    };
  }
  if (lastLow != null && lastLowIdx != null && lastIdx > lastLowIdx && last.close < lastLow) {
    const tag = trend >= 0 ? 'CHOCH' : 'BOS';
    return {
      index: lastIdx,
      time: Number(last.time),
      price: lastLow,
      tag: tag as 'CHOCH' | 'BOS',
      bias: 'bearish',
      phase: resolveStructureMarkPhase({ index: lastIdx, price: lastLow, bias: 'bearish' }, candles, n),
      developing: true,
    };
  }

  return null;
}

function countBosInLeg(
  marks: MergedSmcStructureMark[],
  legDirection: 'down' | 'up'
): number {
  const bias = legDirection === 'down' ? 'bearish' : 'bullish';
  const oppositeChoch = legDirection === 'down' ? 'bullish' : 'bearish';
  let startIdx = 0;
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i]!;
    if (m.tag === 'CHOCH' && m.bias === oppositeChoch) {
      startIdx = m.index;
      break;
    }
  }
  const count = marks.filter((m) => m.index >= startIdx && m.tag === 'BOS' && m.bias === bias).length;
  const last = marks[marks.length - 1];
  if (last && last.index >= startIdx && last.tag === 'BOS' && last.bias === bias && last.developing) {
    return count + 1;
  }
  return count;
}

function bounceStrengthKo(bosCount: number, phase: StructureMarkPhase | 'pending'): string {
  if (phase === 'pending') return `BOS ${bosCount}개 · CHoCH 형성중(선행)`;
  if (phase === 'breakout') return `BOS ${bosCount}개 · CHoCH 돌파 → OB까지 되돌림 후 반등/거부`;
  if (phase === 'settling') return `BOS ${bosCount}개 · CHoCH 안착중 → OB 경로 유효`;
  if (phase === 'confirmed') {
    if (bosCount <= 1) return `BOS ${bosCount}개 · CHoCH 안착 → OB 되돌림 깊을 수 있음`;
    if (bosCount <= 3) return `BOS ${bosCount}개 · CHoCH 안착 → OB까지 중간 반등`;
    return `BOS ${bosCount}개 · CHoCH 안착 → OB 얕은 반등 가능`;
  }
  if (phase === 'failed') return `BOS ${bosCount}개 · CHoCH 무효`;
  return `BOS ${bosCount}개`;
}

function buildBounceHint(params: {
  candles: Candle[];
  choch: MergedSmcStructureMark;
  bosCount: number;
  obs: MergedSmcLeadingOb[];
}): MergedSmcBounceHint | null {
  const { candles, choch, bosCount, obs } = params;
  const n = candles.length;
  const close = candles[n - 1]!.close;
  const start = Math.max(0, choch.index - 80);
  let legHigh = -Infinity;
  let legLow = Infinity;
  for (let i = start; i <= choch.index; i++) {
    legHigh = Math.max(legHigh, candles[i]!.high);
    legLow = Math.min(legLow, candles[i]!.low);
  }
  if (!Number.isFinite(legHigh) || !Number.isFinite(legLow) || legHigh <= legLow) return null;

  const range = legHigh - legLow;
  const supplyOb = obs.find((o) => o.bias === 'bearish');

  if (choch.bias === 'bullish') {
    const anchor = legLow;
    const shallow = bosCount >= 4;
    const t1 = choch.price;
    const t2 = supplyOb ? (supplyOb.low + supplyOb.high) / 2 : anchor + range * (shallow ? 0.382 : 0.5);
    const tmax = shallow ? anchor + range * 0.5 : legHigh;
    return {
      direction: 'up',
      anchorPrice: anchor,
      anchorTop: anchor + range * 0.06,
      anchorBot: anchor - range * 0.03,
      anchorTime: Number(candles[Math.max(start, choch.index - 12)]!.time),
      legHigh,
      legLow,
      t1,
      t2,
      tmax,
      bosCount,
      strengthKo: bounceStrengthKo(bosCount, choch.phase),
    };
  }

  const anchor = legHigh;
  const shallow = bosCount >= 4;
  const demandOb = obs.find((o) => o.bias === 'bullish');
  const t1 = choch.price;
  const t2 = demandOb ? (demandOb.low + demandOb.high) / 2 : anchor - range * (shallow ? 0.382 : 0.5);
  const tmax = shallow ? anchor - range * 0.5 : legLow;
  return {
    direction: 'down',
    anchorPrice: anchor,
    anchorTop: anchor + range * 0.03,
    anchorBot: anchor - range * 0.06,
    anchorTime: Number(candles[Math.max(start, choch.index - 12)]!.time),
    legHigh,
    legLow,
    t1,
    t2,
    tmax,
    bosCount,
    strengthKo: bounceStrengthKo(bosCount, choch.phase),
  };
}

export function detectMergedSmcLeadingContext(params: {
  candles: Candle[];
  timeframe: string;
  analysis?: AnalyzeResponse | null;
}): MergedSmcLeadingContext {
  const candles = sourceCandles(params.candles, params.timeframe);
  const tf = normalizeChartTimeframe(params.timeframe);
  const L = swingPivot(tf);
  const empty: MergedSmcLeadingContext = {
    marks: [],
    obs: [],
    bosCountInLeg: 0,
    legDirection: 'range',
    lastChoch: null,
    bounceHint: null,
    summaryKo: 'SMC 선행 — 구조 돌파 대기',
    detailKo: '—',
    active: false,
  };
  if (candles.length < 16) return empty;

  const raw = structureMarksFu(candles, L, 28);
  const marks: MergedSmcStructureMark[] = raw.map((m) => ({
    index: m.index,
    time: Number(candles[m.index]?.time),
    price: m.price,
    tag: m.tag,
    bias: m.bias,
    phase: resolveStructureMarkPhase(m, candles, candles.length),
    developing: false,
  }));

  const developing = scanDevelopingMark(
    candles,
    L,
    marks.map((m) => ({ index: m.index, bias: m.bias, tag: m.tag }))
  );
  if (developing) {
    const dup = marks.findIndex((m) => m.index === developing.index && m.bias === developing.bias);
    if (dup >= 0) marks[dup] = developing;
    else marks.push(developing);
  }
  marks.sort((a, b) => a.index - b.index);

  const last = marks[marks.length - 1];
  const legDirection: 'down' | 'up' | 'range' =
    last?.bias === 'bearish' ? 'down' : last?.bias === 'bullish' ? 'up' : 'range';
  const bosCountInLeg = legDirection === 'range' ? 0 : countBosInLeg(marks, legDirection);

  const chochMarks = marks.filter((m) => m.tag === 'CHOCH');
  const lastChoch = chochMarks[chochMarks.length - 1] ?? null;

  const obs: MergedSmcLeadingOb[] = [];
  const obSources = [...chochMarks.slice(-2)];
  const lastMark = marks[marks.length - 1];
  if (
    lastMark &&
    (lastMark.tag === 'CHOCH' || (lastMark.developing && lastMark.tag === 'BOS')) &&
    !obSources.some((m) => m.index === lastMark.index)
  ) {
    obSources.push(lastMark);
  }
  for (const c of obSources) {
    const ob = findObBeforeBreak(candles, c.index, c.bias);
    if (!ob) continue;
    const supplySide = c.bias === 'bullish';
    obs.push({
      id: `merged-smc-ob-${c.bias}-${c.index}${c.developing ? '-dev' : ''}`,
      bias: supplySide ? 'bearish' : 'bullish',
      low: ob.low,
      high: ob.high,
      time: Number(candles[ob.index]?.time),
      chochIndex: c.index,
      labelKo: c.developing
        ? supplySide
          ? '선행 CHoCH↑ OB'
          : '선행 CHoCH↓ OB'
        : supplySide
          ? 'CHoCH↑ OB(공급)'
          : 'CHoCH↓ OB(수요)',
    });
  }

  const bounceAnchor = lastChoch ?? (lastMark?.tag === 'BOS' && lastMark.developing ? lastMark : null);
  let bounceHint: MergedSmcBounceHint | null = null;
  if (bounceAnchor && bounceAnchor.phase !== 'failed') {
    bounceHint = buildBounceHint({
      candles,
      choch: bounceAnchor,
      bosCount: bosCountInLeg,
      obs,
    });
  }

  const active =
    (!!lastChoch &&
      (lastChoch.phase === 'pending' ||
        lastChoch.phase === 'breakout' ||
        lastChoch.phase === 'settling' ||
        lastChoch.phase === 'confirmed')) ||
    (!!lastMark?.developing && lastMark.phase === 'pending');

  const dirKo =
    lastChoch?.bias === 'bullish' ? '상방 CHoCH' : lastChoch?.bias === 'bearish' ? '하방 CHoCH' : '구조';
  const phaseKo =
    lastChoch?.phase === 'confirmed'
      ? '안착'
      : lastChoch?.phase === 'settling'
        ? '안착중'
        : lastChoch?.phase === 'breakout'
          ? '돌파'
          : lastChoch?.phase === 'pending'
            ? '선행'
            : lastChoch?.phase === 'failed'
              ? '무효'
              : '';

  const summaryKo = lastChoch
    ? `${dirKo} ${phaseKo} · BOS ${bosCountInLeg}개${bounceHint ? ` · 반등 ${fmtPx(bounceHint.t2)}~${fmtPx(bounceHint.tmax)}` : ''}`
    : bosCountInLeg > 0
      ? `하락 BOS ${bosCountInLeg}개 누적 · CHoCH 대기`
      : 'SMC 선행 — 구조 돌파 대기';

  const detailKo = bounceHint
    ? `${bounceHint.strengthKo} · T1 ${fmtPx(bounceHint.t1)} · T2 ${fmtPx(bounceHint.t2)} · Tmax ${fmtPx(bounceHint.tmax)}`
    : lastChoch
      ? `${dirKo} ${phaseKo} · OB ${obs.length}개`
      : '—';

  return {
    marks,
    obs,
    bosCountInLeg,
    legDirection,
    lastChoch,
    bounceHint,
    summaryKo,
    detailKo,
    active,
  };
}

export function mergedSmcChochLevelLabelKo(
  choch: MergedSmcStructureMark,
  bosCountInLeg: number
): string {
  if (choch.phase === 'confirmed') {
    return choch.bias === 'bullish' ? 'CHoCH↑·안착' : 'CHoCH↓·안착';
  }
  if (choch.phase === 'settling') return 'CHoCH·안착중';
  if (choch.phase === 'breakout') return 'CHoCH·돌파';
  if (choch.phase === 'failed') return 'CHoCH·안착실패';
  if (choch.phase === 'pending') return `CHoCH·BOS${bosCountInLeg}`;
  return 'CHoCH';
}

/** CHoCH 분석 레벨 — 가로선 + 동일 가격 라벨(캔들 가림 최소) */
export function buildMergedSmcChochLevelOverlays(params: {
  choch: MergedSmcStructureMark;
  candles: Candle[];
  timeframe: string;
  bosCountInLeg: number;
  detailKo?: string;
}): OverlayItem[] {
  const src = sourceCandles(params.candles, params.timeframe);
  if (!src.length) return [];
  const { choch } = params;
  const tStart = Number(src[src.length - 1]?.time);
  const tEnd = Number(src[src.length - 1]?.time);
  const { t1: tailT1, t2: tailT2 } = overlayTimes(src, params.timeframe);
  const lineT1 = Number.isFinite(tailT1) ? tailT1 : tStart;
  const lineT2 = Number.isFinite(tailT2) ? tailT2 : tEnd;
  if (!Number.isFinite(lineT1) || !Number.isFinite(lineT2)) return [];

  const bull = choch.bias === 'bullish';
  const failed = choch.phase === 'failed';
  const lineColor = failed
    ? 'rgba(148,163,184,0.78)'
    : bull
      ? 'rgba(34,197,94,0.88)'
      : 'rgba(239,68,68,0.88)';
  const labelKo = mergedSmcChochLevelLabelKo(choch, params.bosCountInLeg);

  return [
    {
      id: `merged-smc-choch-level-${choch.index}`,
      kind: 'keyLevel',
      label: '',
      x1: 0,
      y1: choch.price,
      x2: 1,
      y2: choch.price,
      time1: lineT1 as UTCTimestamp,
      time2: lineT2 as UTCTimestamp,
      price1: choch.price,
      price2: choch.price,
      confidence: failed ? 62 : 90,
      color: lineColor,
      lineDash: choch.phase === 'confirmed' && !failed ? undefined : '8 4',
      lineStrokeWidth: choch.phase === 'confirmed' && !failed ? 2.5 : 2,
      category: 'structure',
      structureBias: choch.bias,
      overlayZoneExtraClass: [
        'merged-ares-smc-choch-line',
        bull && !failed ? 'merged-ares-smc-choch-line--bull' : '',
        !bull && !failed ? 'merged-ares-smc-choch-line--bear' : '',
        failed ? 'merged-ares-smc-choch-line--failed' : '',
        choch.developing ? 'merged-ares-smc-choch-line--developing' : '',
      ]
        .filter(Boolean)
        .join(' '),
      noProject: true,
      labelTooltip: params.detailKo,
    },
    {
      id: `merged-smc-choch-level-label-${choch.index}`,
      kind: 'label',
      label: labelKo,
      x1: 0,
      y1: 0,
      time1: tEnd as UTCTimestamp,
      price1: choch.price,
      confidence: failed ? 65 : 92,
      color: lineColor,
      labelBackgroundColor: failed
        ? 'rgba(51,65,85,0.92)'
        : bull
          ? 'rgba(22,101,52,0.92)'
          : 'rgba(127,29,29,0.92)',
      labelTextColor: '#f8fafc',
      category: 'structure',
      overlayZoneExtraClass: 'merged-ares-smc-choch-label merged-ares-mlsp-pin-right',
      labelTooltip: params.detailKo,
    },
  ];
}

export function buildMergedSmcLeadingOverlays(
  candles: Candle[],
  ctx: MergedSmcLeadingContext,
  timeframe: string
): OverlayItem[] {
  if (!candles.length) return [];
  const out: OverlayItem[] = [];
  const src = sourceCandles(candles, timeframe);

  const choch = ctx.lastChoch;
  if (choch && choch.phase !== 'failed') {
    const { t1, t2 } = overlayTimes(src, timeframe);
    const band = Math.abs(src[choch.index]?.close ?? choch.price) * 0.0015;
    out.push(
      ...buildMergedSmcChochLevelOverlays({
        choch,
        candles,
        timeframe,
        bosCountInLeg: ctx.bosCountInLeg,
        detailKo: ctx.detailKo,
      })
    );
    out.push({
      id: `merged-smc-choch-settle-${choch.index}`,
      kind: choch.bias === 'bullish' ? 'demandZone' : 'supplyZone',
      label: '',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1 as UTCTimestamp,
      time2: t2 as UTCTimestamp,
      price1: choch.price + band,
      price2: choch.price - band,
      confidence: 80,
      color: 'rgba(167,139,250,0.1)',
      category: 'structure',
      zoneFillPreserve: true,
      overlayZoneExtraClass: [
        'merged-ares-zone',
        'merged-ares-smc-choch',
        MERGED_ARES_ZONE_CAPTION_CLASS,
        choch.developing ? 'merged-ares-smc-choch--developing' : '',
        choch.phase === 'confirmed' ? 'merged-ares-smc-choch--confirmed' : '',
      ]
        .filter(Boolean)
        .join(' '),
      labelTooltip: `${ctx.detailKo} · 조건부 참고`,
    });
  }

  const hint = ctx.bounceHint;
  if (hint) {
    const { t1, t2 } = overlayTimes(src, timeframe);
    const up = hint.direction === 'up';
    out.push({
      id: `merged-smc-bounce-path-${Math.round(hint.anchorPrice)}`,
      kind: up ? 'demandZone' : 'supplyZone',
      label: up ? 'CHoCH 반등목표' : 'CHoCH 하락목표',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: t1 as UTCTimestamp,
      time2: t2 as UTCTimestamp,
      price1: up ? hint.tmax : hint.anchorTop,
      price2: up ? hint.anchorBot : hint.tmax,
      confidence: 74,
      color: up ? 'rgba(251,146,60,0.1)' : 'rgba(248,113,113,0.1)',
      category: 'scenario',
      zoneFillPreserve: true,
      overlayZoneExtraClass: [
        'merged-ares-zone',
        'merged-ares-smc-bounce-path',
        MERGED_ARES_ZONE_CAPTION_CLASS,
        up ? 'merged-ares-smc-bounce-path--up' : 'merged-ares-smc-bounce-path--down',
      ].join(' '),
      labelTooltip: hint.strengthKo,
    });

    for (const [label, price] of [
      ['T1', hint.t1],
      ['T2', hint.t2],
      ['Tmax', hint.tmax],
    ] as const) {
      out.push({
        id: `merged-smc-bounce-${label}-${Math.round(price)}`,
        kind: 'keyLevel',
        label: '',
        x1: 0,
        y1: price,
        x2: 1,
        y2: price,
        time1: t1 as UTCTimestamp,
        time2: t2 as UTCTimestamp,
        price1: price,
        price2: price,
        confidence: label === 'Tmax' ? 76 : 70,
        color: up
          ? label === 'Tmax'
            ? '#22c55e'
            : label === 'T2'
              ? '#2dd4bf'
              : '#34d399'
          : label === 'Tmax'
            ? '#ef4444'
            : label === 'T2'
              ? '#fb923c'
              : '#f87171',
        category: 'structure',
        lineDash: label === 'Tmax' ? '4 4' : '10 6',
        lineStrokeWidth: label === 'Tmax' ? 2.2 : 1.6,
        overlayZoneExtraClass: [
          'merged-ares-smc-bounce-line',
          up ? 'merged-ares-smc-bounce-line--up' : 'merged-ares-smc-bounce-line--down',
          `merged-ares-smc-bounce-line--${label.toLowerCase()}`,
        ].join(' '),
        labelTooltip: `${label} ${fmtPx(price)} · ${hint.strengthKo}`,
      });
    }
  }

  return out;
}

function chochMarkerText(m: MergedSmcStructureMark): string {
  if (m.tag === 'BOS') return m.developing ? 'BOS+' : 'BOS';
  return chochMarkerLabelKo(m.phase, m.developing);
}

/** BOS 누적 · CHoCH 돌파/안착/무효 — 차트 마커 */
export function buildMergedSmcStructureMarkers(ctx: MergedSmcLeadingContext): AtlasPulseMarker[] {
  const out: AtlasPulseMarker[] = [];
  const bos = ctx.marks.filter((m) => m.tag === 'BOS').slice(-5);
  const choch = ctx.marks.filter((m) => m.tag === 'CHOCH').slice(-2);
  for (const m of [...bos, ...choch]) {
    const t = Number(m.time) as UTCTimestamp;
    if (!Number.isFinite(t)) continue;
    const long = m.bias === 'bullish';
    out.push({
      time: t,
      position: long ? 'belowBar' : 'aboveBar',
      shape: m.tag === 'CHOCH' ? 'square' : 'circle',
      color:
        m.phase === 'failed'
          ? '#94a3b8'
          : m.tag === 'CHOCH' && m.phase === 'confirmed'
            ? long
              ? '#22c55e'
              : '#ef4444'
            : long
              ? '#2dd4bf'
              : '#f472b6',
      text: chochMarkerText(m),
      size: m.developing || m.phase === 'pending' || m.phase === 'settling' ? 2 : 1,
      id: `merged-smc-${m.tag.toLowerCase()}-${m.index}-${t}`,
    });
  }
  return out;
}

export function summarizeMergedSmcLeadingKo(ctx: MergedSmcLeadingContext): string {
  return ctx.summaryKo;
}

export function summarizeMergedSmcLeadingDetailKo(ctx: MergedSmcLeadingContext): string {
  return ctx.detailKo;
}
