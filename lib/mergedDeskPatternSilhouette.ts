/**
 * 통합·분석 — 패턴 실루엣 + 피봇 스탬프 (카드 UI 없음).
 * 파이프: Candle → Pivot → Structure → Pattern → Landmark → Silhouette auto-fit.
 * 롱/숏 확정(ENTER·TOUCH+허용)일 때만 표시. WAIT·랜덤 신호 금지.
 * 미완성 캔들로 CONFIRMED 금지 · 미래 참조 금지. 확정 수익 아님.
 */
import type { AnalyzeResponse, Candle } from '@/types';
import type { PatternVisionResult, PatternVisionType } from '@/types/patternVision';
import { getDominantPattern, runPatternVision } from '@/lib/patternVision/patternVisionEngine';
import type { MergedDeskActiveTradePlan } from '@/lib/mergedDeskActiveTradePlan';
import {
  findVisualTemplateByKind,
  type VisualLandmarkId,
  type VisualPatternLifecycle,
  type VisualPatternTemplate,
  type VisualSilhouetteKind,
} from '@/lib/visualPatternTemplates';

export type MergedDeskSilhouetteKind = VisualSilhouetteKind | 'none';

export type MergedDeskStampKind =
  | 'elephant_tail'
  | 'person_peak'
  | 'person_trough'
  | 'bull'
  | 'bear'
  | 'bear_crown'
  | 'entry_xhair'
  | 'arrow_up'
  | 'arrow_down'
  | 'hammer';

export type MergedDeskSilhouetteAnchor = {
  time: number;
  price: number;
};

export type MergedDeskPatternStamp = {
  time: number;
  price: number;
  kind: MergedDeskStampKind;
};

export type MergedDeskLandmarkPoint = {
  id: VisualLandmarkId;
  time: number;
  price: number;
};

export type MergedDeskPatternSilhouettePack = {
  kind: MergedDeskSilhouetteKind;
  labelKo: string;
  confidence: number;
  patternScore: number;
  lifecycle: VisualPatternLifecycle;
  confirmedSide: 'LONG' | 'SHORT';
  structureTerms: string[];
  templateId: string | null;
  incomplete: boolean;
  landmarks: MergedDeskLandmarkPoint[];
  anchors: {
    left: MergedDeskSilhouetteAnchor;
    right: MergedDeskSilhouetteAnchor;
    top: MergedDeskSilhouetteAnchor;
    bottom: MergedDeskSilhouetteAnchor;
  };
  stamps: MergedDeskPatternStamp[];
  patternType: string;
  tradeLevels: {
    entry: number | null;
    sl: number | null;
    tp1: number | null;
    tp2: number | null;
    tp3: number | null;
  } | null;
};

const MIN_CONF = 62;

function mapSilhouetteKind(type: PatternVisionType | string): MergedDeskSilhouetteKind {
  switch (type) {
    case 'Head and Shoulders':
    case 'Inverse Head and Shoulders':
      return 'person';
    case 'Double Bottom':
    case 'Triple Bottom':
    case 'V Bottom':
      return 'butterfly';
    case 'Double Top':
    case 'Triple Top':
    case 'V Top':
      return 'heart';
    case 'Channel Down':
    case 'Channel Up':
    case 'Descending Triangle':
    case 'Ascending Triangle':
    case 'Falling Wedge':
    case 'Rising Wedge':
      return 'muscle';
    case 'Bear Flag':
    case 'Bull Flag':
      return 'elephant';
    case 'Order Block':
    case 'Breaker Block':
      return 'ob_block';
    default:
      return 'none';
  }
}

function labelKoFor(kind: MergedDeskSilhouetteKind, type: string): string {
  const tpl = kind !== 'none' ? findVisualTemplateByKind(kind) : null;
  if (tpl) return tpl.labelKo;
  return type || '패턴';
}

function resolveConfirmedSide(
  plan: MergedDeskActiveTradePlan | null | undefined,
  analysis: AnalyzeResponse | null | undefined
): 'LONG' | 'SHORT' | null {
  if (plan && (plan.direction === 'LONG' || plan.direction === 'SHORT')) {
    if (plan.status === 'ENTER') return plan.direction;
    if (plan.status === 'TOUCH' && plan.entryAllowed) return plan.direction;
  }
  const v = String((analysis as { verdict?: string } | null | undefined)?.verdict || '').toUpperCase();
  const exec = String(
    (analysis as { executionState?: string } | null | undefined)?.executionState || ''
  ).toUpperCase();
  if ((v === 'LONG' || v === 'SHORT') && exec === 'CONFIRMED') return v as 'LONG' | 'SHORT';
  return null;
}

function stampKindFor(
  silKind: MergedDeskSilhouetteKind,
  pivot: { type: 'high' | 'low' },
  bias: 'bullish' | 'bearish' | 'neutral',
  isPrimaryHigh: boolean
): MergedDeskStampKind {
  if (silKind === 'elephant') return 'elephant_tail';
  if (silKind === 'person') return pivot.type === 'high' ? 'person_peak' : 'person_trough';
  if (pivot.type === 'high') {
    if (isPrimaryHigh) return 'bear_crown';
    return 'bear';
  }
  void bias;
  return 'bull';
}

function detectElephantTrunk(candles: Candle[]): PatternVisionResult | null {
  const n = candles.length;
  if (n < 48) return null;
  const closed = candles.slice(0, -1);
  const win = closed.slice(-Math.min(120, closed.length));
  const w = win.length;
  let hiIdx = 0;
  let hi = -Infinity;
  for (let i = Math.floor(w * 0.25); i < w - 4; i++) {
    const h = Number(win[i]!.high);
    if (h > hi) {
      hi = h;
      hiIdx = i;
    }
  }
  if (hiIdx < 8 || hiIdx > w - 6) return null;
  const first = Number(win[0]!.close);
  const peak = hi;
  const last = Number(win[w - 1]!.close);
  if (!(first > 0) || !(peak > first * 1.012)) return null;
  const drop = (peak - last) / peak;
  if (drop < 0.018) return null;
  const consolStart = Math.max(0, hiIdx - 6);
  const consol = win.slice(consolStart, hiIdx + 1);
  const cHi = Math.max(...consol.map((c) => Number(c.high)));
  const cLo = Math.min(...consol.map((c) => Number(c.low)));
  if ((cHi - cLo) / peak > 0.035) return null;

  const absStart = closed.length - w;
  return {
    id: 'merged-desk-elephant-trunk',
    type: 'V Top',
    bias: 'bearish',
    confidence: Math.min(88, 70 + Math.round(drop * 400)),
    startIndex: absStart,
    endIndex: closed.length - 1,
    pivotPoints: [
      { index: absStart, price: Number(win[0]!.low), type: 'low' },
      { index: absStart + hiIdx, price: peak, type: 'high' },
      { index: closed.length - 1, price: last, type: 'low' },
    ],
    lines: [],
    zones: [],
    label: 'Elephant Trunk',
    reason: 'gradual-runup·head-base·trunk-drop',
  };
}

function detectEagleRecovery(candles: Candle[]): PatternVisionResult | null {
  const n = candles.length;
  if (n < 40) return null;
  const closed = candles.slice(0, -1);
  const win = closed.slice(-Math.min(100, closed.length));
  const w = win.length;
  let loIdx = 0;
  let lo = Infinity;
  for (let i = Math.floor(w * 0.2); i < w - 3; i++) {
    const l = Number(win[i]!.low);
    if (l < lo) {
      lo = l;
      loIdx = i;
    }
  }
  if (loIdx < 6 || loIdx > w - 5) return null;
  const first = Number(win[0]!.close);
  const last = Number(win[w - 1]!.close);
  if (!(first > lo * 1.01) || !(last > lo * 1.008)) return null;
  const leftDrop = (first - lo) / first;
  const rightLift = (last - lo) / lo;
  if (leftDrop < 0.012 || rightLift < 0.008) return null;
  const absStart = closed.length - w;
  return {
    id: 'merged-desk-eagle-recovery',
    type: 'V Bottom',
    bias: 'bullish',
    confidence: Math.min(86, 66 + Math.round((leftDrop + rightLift) * 200)),
    startIndex: absStart,
    endIndex: closed.length - 1,
    pivotPoints: [
      { index: absStart, price: first, type: 'high' },
      { index: absStart + loIdx, price: lo, type: 'low' },
      { index: closed.length - 1, price: last, type: 'high' },
    ],
    lines: [],
    zones: [],
    label: 'Eagle Recovery',
    reason: 'selloff·bottom·choch-recovery',
  };
}

function detectSupplyDemandFlip(candles: Candle[]): PatternVisionResult | null {
  const n = candles.length;
  if (n < 36) return null;
  const closed = candles.slice(0, -1);
  const win = closed.slice(-Math.min(80, closed.length));
  const w = win.length;
  let hiIdx = 0;
  let hi = -Infinity;
  for (let i = 4; i < w - 8; i++) {
    const h = Number(win[i]!.high);
    if (h > hi) {
      hi = h;
      hiIdx = i;
    }
  }
  const last = Number(win[w - 1]!.close);
  const drop = (hi - last) / hi;
  if (drop < 0.012 || hiIdx > w - 10) return null;
  const after = win.slice(hiIdx + 1);
  const rebound = after.some(
    (c) => Number(c.close) > Number(c.open) && Number(c.low) < last * 1.002
  );
  if (!rebound) return null;
  const absStart = closed.length - w;
  return {
    id: 'merged-desk-supply-demand-flip',
    type: 'V Bottom',
    bias: 'bullish',
    confidence: 64,
    startIndex: absStart + Math.max(0, hiIdx - 6),
    endIndex: closed.length - 1,
    pivotPoints: [
      { index: absStart + hiIdx, price: hi, type: 'high' },
      { index: closed.length - 1, price: last, type: 'low' },
    ],
    lines: [],
    zones: [],
    label: 'Supply→Demand',
    reason: 'supply-fail·demand-hold',
  };
}

function pickVisionPattern(
  analysis: AnalyzeResponse | null | undefined,
  candles: Candle[]
): PatternVisionResult | null {
  const closed = candles.length >= 3 ? candles.slice(0, -1) : candles;
  const cached = analysis?.detectedVisionPatterns as PatternVisionResult[] | undefined;
  const results = cached?.length ? cached : closed.length >= 40 ? runPatternVision(closed) : [];
  const elephant = detectElephantTrunk(candles);
  const eagle = detectEagleRecovery(candles);
  const sd = detectSupplyDemandFlip(candles);
  const extras = [elephant, eagle, sd].filter(Boolean) as PatternVisionResult[];
  const all = [...results, ...extras];
  if (!all.length) return null;
  const dom = getDominantPattern(all);
  if (!dom) return elephant ?? eagle ?? sd;
  const full = all.find((r) => r.type === dom.type && r.confidence === dom.confidence) ?? all[0]!;
  if (full.confidence < MIN_CONF) return elephant ?? eagle ?? sd;
  return full;
}

function resolveLifecycle(
  pattern: PatternVisionResult,
  incomplete: boolean,
  side: 'LONG' | 'SHORT'
): VisualPatternLifecycle {
  const biasOk =
    (side === 'LONG' && pattern.bias === 'bullish') ||
    (side === 'SHORT' && pattern.bias === 'bearish') ||
    pattern.bias === 'neutral';
  if (!biasOk && pattern.confidence < 70) return 'INVALID';
  if (incomplete) return pattern.confidence >= 72 ? 'CANDIDATE' : 'FORMING';
  if (pattern.confidence >= 78) return 'CONFIRMED';
  if (pattern.confidence >= MIN_CONF) return 'CANDIDATE';
  return 'FORMING';
}

function buildAnchors(
  candles: Candle[],
  pattern: PatternVisionResult
): MergedDeskPatternSilhouettePack['anchors'] | null {
  const n = candles.length;
  if (n < 2) return null;

  let i0 = Math.max(0, Math.min(n - 1, pattern.startIndex));
  let i1 = Math.max(0, Math.min(n - 1, pattern.endIndex));
  if (i1 < i0) [i0, i1] = [i1, i0];
  if (i1 >= n - 1 && n >= 3) i1 = n - 2;

  const pivots = (pattern.pivotPoints ?? [])
    .map((p) => ({
      type: p.type,
      price: Number(p.price),
      index: Math.max(0, Math.min(n - 1, p.index)),
    }))
    .filter((p) => Number.isFinite(p.price) && p.price > 0)
    .sort((a, b) => a.index - b.index);

  if (pivots.length >= 2) {
    const recent = pivots.slice(-Math.min(6, pivots.length));
    const p0 = recent[0]!.index;
    const p1 = recent[recent.length - 1]!.index;
    const span = i1 - i0;
    const pivSpan = Math.max(1, p1 - p0);
    if (span > Math.max(14, Math.ceil(pivSpan * 1.75))) {
      i0 = Math.max(0, p0 - 2);
      i1 = Math.min(n - 1, p1 + 2);
    } else {
      i0 = Math.max(i0, Math.max(0, p0 - 1));
      i1 = Math.min(i1, Math.min(n - 1, p1 + 1));
    }
  }

  if (i1 <= i0) i1 = Math.min(n - 1, i0 + 4);
  if (i1 <= i0) return null;

  const inRange = pivots.filter((p) => p.index >= i0 && p.index <= i1);
  let topP = -Infinity;
  let botP = Infinity;
  let topI = i0;
  let botI = i0;

  if (inRange.length >= 2) {
    for (const p of inRange) {
      if (p.price > topP) {
        topP = p.price;
        topI = p.index;
      }
      if (p.price < botP) {
        botP = p.price;
        botI = p.index;
      }
    }
    const hasHigh = inRange.some((p) => p.type === 'high');
    const hasLow = inRange.some((p) => p.type === 'low');
    if (!hasHigh || !hasLow) {
      for (let i = i0; i <= i1; i++) {
        const h = Number(candles[i]!.high);
        const l = Number(candles[i]!.low);
        if (!hasHigh && h > topP) {
          topP = h;
          topI = i;
        }
        if (!hasLow && l < botP) {
          botP = l;
          botI = i;
        }
      }
    }
  } else {
    for (let i = i0; i <= i1; i++) {
      const h = Number(candles[i]!.high);
      const l = Number(candles[i]!.low);
      if (h > topP) {
        topP = h;
        topI = i;
      }
      if (l < botP) {
        botP = l;
        botI = i;
      }
    }
  }

  if (!(topP > botP) || !Number.isFinite(topP) || !Number.isFinite(botP)) return null;

  const pad = Math.min(
    Math.max((topP - botP) * 0.05, Math.abs(topP) * 0.0006),
    (topP - botP) * 0.12
  );
  const topPad = topP + pad;
  const botPad = Math.max(botP - pad, botP * 0.998);

  return {
    left: { time: Number(candles[i0]!.time), price: (topPad + botPad) / 2 },
    right: { time: Number(candles[i1]!.time), price: (topPad + botPad) / 2 },
    top: { time: Number(candles[topI]!.time), price: topPad },
    bottom: { time: Number(candles[botI]!.time), price: botPad },
  };
}

function nearestBarTime(candles: Candle[], price: number, preferFromIdx: number): number {
  const n = candles.length;
  if (n < 1) return 0;
  let bestI = Math.max(0, Math.min(n - 1, preferFromIdx));
  let bestD = Infinity;
  const start = Math.max(0, preferFromIdx - 40);
  for (let i = start; i < n; i++) {
    const c = candles[i]!;
    const d = Math.min(
      Math.abs(Number(c.high) - price),
      Math.abs(Number(c.low) - price),
      Math.abs(Number(c.close) - price)
    );
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return Number(candles[bestI]!.time);
}

function buildLandmarks(
  candles: Candle[],
  pattern: PatternVisionResult,
  anchors: MergedDeskPatternSilhouettePack['anchors'],
  kind: MergedDeskSilhouetteKind,
  plan: MergedDeskActiveTradePlan | null | undefined
): MergedDeskLandmarkPoint[] {
  const out: MergedDeskLandmarkPoint[] = [
    { id: 'leftAnchor', time: anchors.left.time, price: anchors.left.price },
    { id: 'rightAnchor', time: anchors.right.time, price: anchors.right.price },
    { id: 'top', time: anchors.top.time, price: anchors.top.price },
    { id: 'bottom', time: anchors.bottom.time, price: anchors.bottom.price },
    {
      id: 'centerAnchor',
      time: anchors.left.time,
      price: (anchors.top.price + anchors.bottom.price) / 2,
    },
  ];

  const lows = pattern.pivotPoints.filter((p) => p.type === 'low').sort((a, b) => a.index - b.index);
  const highs = pattern.pivotPoints
    .filter((p) => p.type === 'high')
    .sort((a, b) => a.index - b.index);

  const bar = (idx: number, fallbackPrice: number) => {
    const i = Math.max(0, Math.min(candles.length - 1, idx));
    const c = candles[i]!;
    return { time: Number(c.time), price: fallbackPrice };
  };

  if (kind === 'butterfly' || kind === 'eagle') {
    if (lows[0]) out.push({ id: 'pivot1', ...bar(lows[0].index, lows[0].price) });
    if (lows[1]) out.push({ id: 'pivot2', ...bar(lows[1].index, lows[1].price) });
    else if (lows[0]) out.push({ id: 'pivot2', time: anchors.right.time, price: lows[0].price });
    if (highs.length) {
      const mid = highs[Math.floor(highs.length / 2)]!;
      out.push({ id: 'centerAnchor', ...bar(mid.index, mid.price) });
    }
    out.push({ id: 'breakoutAnchor', time: anchors.right.time, price: anchors.top.price });
  }

  if (kind === 'heart' || kind === 'person') {
    if (highs[0]) out.push({ id: 'pivot1', ...bar(highs[0].index, highs[0].price) });
    if (highs[1]) out.push({ id: 'pivot2', ...bar(highs[1].index, highs[1].price) });
    if (highs[2]) out.push({ id: 'pivot3', ...bar(highs[2].index, highs[2].price) });
    out.push({ id: 'breakdownAnchor', time: anchors.right.time, price: anchors.bottom.price });
  }

  if (kind === 'elephant') {
    if (highs[0]) out.push({ id: 'pivot1', ...bar(highs[0].index, highs[0].price) });
    out.push({ id: 'breakdownAnchor', time: anchors.right.time, price: anchors.bottom.price });
  }

  if (plan && plan.direction !== 'NEUTRAL' && plan.entry > 0) {
    out.push({
      id: 'entryAnchor',
      time: nearestBarTime(candles, plan.entry, Math.floor(candles.length * 0.55)),
      price: plan.entry,
    });
    if (plan.stopLoss > 0) {
      out.push({
        id: 'stopAnchor',
        time: nearestBarTime(candles, plan.stopLoss, Math.floor(candles.length * 0.55)),
        price: plan.stopLoss,
      });
    }
    if (plan.tp1 > 0) {
      out.push({
        id: 'targetAnchor',
        time: nearestBarTime(candles, plan.tp1, Math.floor(candles.length * 0.7)),
        price: plan.tp1,
      });
    }
  }

  const byId = new Map<string, MergedDeskLandmarkPoint>();
  for (const lm of out) byId.set(lm.id, lm);
  return [...byId.values()];
}

export function buildMergedDeskPatternSilhouettePack(params: {
  candles: Candle[];
  analysis?: AnalyzeResponse | null;
  activePlan?: MergedDeskActiveTradePlan | null;
  enabled?: boolean;
}): MergedDeskPatternSilhouettePack | null {
  if (params.enabled === false) return null;
  const candles = params.candles;
  if (candles.length < 24) return null;

  const confirmedSide = resolveConfirmedSide(params.activePlan, params.analysis);
  if (!confirmedSide) return null;

  const pattern = pickVisionPattern(params.analysis, candles);
  if (!pattern) return null;

  let kind = mapSilhouetteKind(pattern.type);
  if (pattern.id === 'merged-desk-elephant-trunk') kind = 'elephant';
  if (pattern.id === 'merged-desk-eagle-recovery') kind = 'eagle';
  if (pattern.id === 'merged-desk-supply-demand-flip') kind = 'supply_demand';
  if (kind === 'none' && pattern.bias === 'bearish' && pattern.confidence >= 76) kind = 'elephant';
  if (kind === 'none') kind = pattern.bias === 'bullish' ? 'butterfly' : 'heart';

  if (confirmedSide === 'LONG' && pattern.bias === 'bearish' && pattern.confidence < 82) return null;
  if (confirmedSide === 'SHORT' && pattern.bias === 'bullish' && pattern.confidence < 82) return null;

  const anchors = buildAnchors(candles, pattern);
  if (!anchors) return null;

  const tpl: VisualPatternTemplate | null = kind !== 'none' ? findVisualTemplateByKind(kind) : null;
  const incomplete =
    kind === 'elephant' &&
    !(pattern.pivotPoints.some((p) => p.type === 'low') && pattern.confidence >= 74);

  const lifecycle = resolveLifecycle(pattern, incomplete, confirmedSide);
  if (lifecycle === 'INVALID' || lifecycle === 'FAILED') return null;
  if (pattern.confidence < MIN_CONF && lifecycle === 'FORMING') return null;

  const highs = pattern.pivotPoints.filter((p) => p.type === 'high');
  let primaryHighIdx = -1;
  if (highs.length) {
    primaryHighIdx = highs.reduce(
      (best, p) => (p.price > (best?.price ?? -Infinity) ? p : best),
      highs[0]!
    ).index;
  }

  const stamps: MergedDeskPatternStamp[] = [];
  for (const p of pattern.pivotPoints.slice(0, 8)) {
    const idx = Math.max(0, Math.min(candles.length - 1, p.index));
    const c = candles[idx]!;
    const wick = p.type === 'high' ? Number(c.high) : Number(c.low);
    stamps.push({
      time: Number(c.time),
      price: Number.isFinite(wick) && wick > 0 ? wick : p.price,
      kind: stampKindFor(kind, p, pattern.bias, p.index === primaryHighIdx),
    });
  }
  if (!stamps.length) {
    stamps.push(
      {
        time: anchors.top.time,
        price: anchors.top.price,
        kind: stampKindFor(kind, { type: 'high' }, pattern.bias, true),
      },
      {
        time: anchors.bottom.time,
        price: anchors.bottom.price,
        kind: stampKindFor(kind, { type: 'low' }, pattern.bias, false),
      }
    );
  }

  if (confirmedSide === 'LONG') {
    stamps.push({ time: anchors.bottom.time, price: anchors.bottom.price, kind: 'arrow_up' });
  } else {
    stamps.push({ time: anchors.top.time, price: anchors.top.price, kind: 'arrow_down' });
  }

  const plan = params.activePlan;
  if (plan && plan.direction === confirmedSide && plan.entry > 0) {
    stamps.push({
      time: nearestBarTime(candles, plan.entry, Math.floor(candles.length * 0.55)),
      price: plan.entry,
      kind: 'entry_xhair',
    });
  }

  const landmarks = buildLandmarks(candles, pattern, anchors, kind, plan);
  const tradeLevels =
    plan && plan.direction === confirmedSide
      ? {
          entry: plan.entry > 0 ? plan.entry : null,
          sl: plan.stopLoss > 0 ? plan.stopLoss : null,
          tp1: plan.tp1 > 0 ? plan.tp1 : null,
          tp2: plan.tp2 > 0 ? plan.tp2 : null,
          tp3: plan.tp3 > 0 ? plan.tp3 : null,
        }
      : null;

  const structureTerms = tpl?.structureTerms ?? [confirmedSide, lifecycle];

  return {
    kind,
    labelKo: labelKoFor(kind, pattern.type),
    confidence: pattern.confidence,
    patternScore: Math.round(pattern.confidence),
    lifecycle,
    confirmedSide,
    structureTerms: [...structureTerms, confirmedSide, lifecycle].slice(0, 8),
    templateId: tpl?.id ?? null,
    incomplete,
    landmarks,
    anchors,
    stamps,
    patternType: pattern.type,
    tradeLevels,
  };
}

export { listVisualPatternTemplates } from '@/lib/visualPatternTemplates';
