/**
 * SMC 데스크 오버레이 — 클라이언트 캔들만으로 EQ·단순 OB·BOS/CHOCH/MSB·거래량 비중(교육·참고).
 *
 * ## 구조 마킹 고정 규격 (`structureMarksFu` = `assets/.../structure_marks_engine_fu.dart` 동일)
 *
 * 1. **스윙 고/저**: 좌·우 `L`봉(2≤L≤4, `smcDeskSwingPivot`)보다 높은 고점 / 낮은 저점만 유효 스윙으로 등록.
 * 2. **돌파 확인(단일 기준)**: 보호된 스윙 **고가/저가**를 그 봉 **종가**가 처음 넘을 때만 돌파로 인정한다. (고가·저가만 넘고 종가는 안 넘는 경우는 돌파 아님.)
 * 3. **BOS (Break of Structure)**: 직전 `trend`가 돌파 방향과 **같은 쪽**일 때의 연속 구조 돌파 (상승 레짐에서 상단 돌파·하락 레짐에서 하단 돌파 등).
 * 4. **CHOCH (Change of Character)**: 직전 `trend`가 돌파 방향과 **반대**일 때의 첫 반전 구조 돌파.
 * 5. **MSB**: CHOCH 직후 같은 방향에서 잡히는 **첫** 연속 돌파(`pendingFlip`) — 엔진 내부 라벨. TV/인디마다 MSB 정의가 다름 — 본 앱은 Dart 엔진과 동일.
 *
 * TradingView LuxAlgo 등과 완전 일치하지 않을 수 있음. 추가 토글로 기준을 바꾸지 않는다.
 */
import type { Candle, OverlayItem } from '@/types';
import { OVERLAY_COLORS } from '@/lib/overlayColors';

export type SmcDeskPackOptions = {
  showEq: boolean;
  /** @deprecated Premium/Discount 면 비표시 — 호환용으로만 남김 */
  showPremiumDiscount?: boolean;
  showOrderBlocks: boolean;
  showStructure: boolean;
  showZoneStrength: boolean;
  /** 피벗 좌우 봉 수 (2~4 권장) */
  swingPivot: number;
};

const CAT: OverlayItem['category'] = 'smcDesk';

function lookbackBars(tf: string): number {
  const m: Record<string, number> = {
    '1m': 96,
    '3m': 96,
    '5m': 120,
    '15m': 140,
    '30m': 160,
    '1h': 180,
    '2h': 180,
    '4h': 200,
    '6h': 200,
    '12h': 200,
    '1d': 220,
    '3d': 200,
    '1w': 160,
    '1M': 120,
  };
  return m[tf] ?? 160;
}

function atrRecent(candles: Candle[], period: number): number {
  const n = candles.length;
  if (n < period + 1) return 0;
  let sum = 0;
  for (let i = n - period; i < n; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    sum += tr;
  }
  return sum / period;
}

function isSwingHigh(candles: Candle[], i: number, L: number): boolean {
  const p = candles[i].high;
  for (let k = 1; k <= L; k++) {
    if (candles[i - k].high >= p) return false;
    if (candles[i + k].high > p) return false;
  }
  return true;
}

function isSwingLow(candles: Candle[], i: number, L: number): boolean {
  const p = candles[i].low;
  for (let k = 1; k <= L; k++) {
    if (candles[i - k].low <= p) return false;
    if (candles[i + k].low < p) return false;
  }
  return true;
}

/** 스윙 피벗으로 본 구간 고저 → EQ = 중간 */
function rangeFromPivots(
  candles: Candle[],
  L: number,
  start: number,
  end: number
): { swingHigh: number; swingLow: number; tStart: number } | null {
  let hi = -Infinity;
  let lo = Infinity;
  let pivH = 0;
  let pivL = 0;
  for (let i = Math.max(L, start); i <= Math.min(end, candles.length - L - 1); i++) {
    if (isSwingHigh(candles, i, L)) {
      if (candles[i].high > hi) {
        hi = candles[i].high;
        pivH = i;
      }
    }
    if (isSwingLow(candles, i, L)) {
      if (candles[i].low < lo) {
        lo = candles[i].low;
        pivL = i;
      }
    }
  }
  if (hi <= lo || !Number.isFinite(hi) || !Number.isFinite(lo)) {
    let h2 = -Infinity;
    let l2 = Infinity;
    for (let i = start; i <= end; i++) {
      h2 = Math.max(h2, candles[i].high);
      l2 = Math.min(l2, candles[i].low);
    }
    if (h2 <= l2) return null;
    return { swingHigh: h2, swingLow: l2, tStart: candles[start].time };
  }
  const tStart = Math.min(candles[Math.min(pivH, pivL)].time, candles[Math.max(pivH, pivL)].time);
  return { swingHigh: hi, swingLow: lo, tStart };
}

/** `structure_marks_engine_fu.dart` 와 동일 — 종가만으로 스윙 레벨 돌파 판정 */
function structureMarksFu(
  candles: Candle[],
  L: number,
  maxMarks: number
): Array<{ index: number; price: number; tag: 'BOS' | 'CHOCH' | 'MSB'; bias: 'bullish' | 'bearish' }> {
  const n = candles.length;
  if (n < L * 2 + 5) return [];

  let lastHighIdx: number | null = null;
  let lastHigh: number | null = null;
  let lastLowIdx: number | null = null;
  let lastLow: number | null = null;
  let trend = 0;
  let pendingFlip = false;
  const marks: Array<{ index: number; price: number; tag: 'BOS' | 'CHOCH' | 'MSB'; bias: 'bullish' | 'bearish' }> = [];

  for (let i = L; i < n - L; i++) {
    if (isSwingHigh(candles, i, L)) {
      lastHighIdx = i;
      lastHigh = candles[i].high;
    }
    if (isSwingLow(candles, i, L)) {
      lastLowIdx = i;
      lastLow = candles[i].low;
    }
    const close = candles[i].close;

    if (lastHighIdx != null && lastHigh != null && i > lastHighIdx) {
      if (close > lastHigh) {
        if (trend >= 0) {
          marks.push({ index: i, price: lastHigh, tag: pendingFlip ? 'MSB' : 'BOS', bias: 'bullish' });
          trend = 1;
          pendingFlip = false;
        } else {
          marks.push({ index: i, price: lastHigh, tag: 'CHOCH', bias: 'bullish' });
          trend = 1;
          pendingFlip = true;
        }
        lastHighIdx = null;
        lastHigh = null;
      }
    }

    if (lastLowIdx != null && lastLow != null && i > lastLowIdx) {
      if (close < lastLow) {
        if (trend <= 0) {
          marks.push({ index: i, price: lastLow, tag: pendingFlip ? 'MSB' : 'BOS', bias: 'bearish' });
          trend = -1;
          pendingFlip = false;
        } else {
          marks.push({ index: i, price: lastLow, tag: 'CHOCH', bias: 'bearish' });
          trend = -1;
          pendingFlip = true;
        }
        lastLowIdx = null;
        lastLow = null;
      }
    }
  }

  marks.sort((a, b) => a.index - b.index);
  return marks.length > maxMarks ? marks.slice(-maxMarks) : marks;
}

/** 구조 돌파 이후 종가 기준 단계 — 현재 차트 TF 캔들만 사용 */
export type StructureMarkPhase = 'breakout' | 'settling' | 'confirmed' | 'failed' | 'trace';

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = String(hex).replace(/^#/, '');
  if (m.length !== 6 || !/^[0-9a-fA-F]+$/.test(m)) return null;
  return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) };
}

function rgbaFromHex(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

/**
 * 돌파 봉 이후 데이터로만 판정 (같은 TF 차트 캔들).
 * - failed: 돌파 이후 어떤 봉이든 종가가 레벨 반대편(무효화)
 * - breakout: 돌파가 막 끝난 봉(마지막 봉)
 * - settling: 돌파+1봉까지만 유효 종가 유지
 * - confirmed: 돌파 포함 3봉 이상 유효 종가 유지
 */
/** 돌파 봉 캔들 색 시그널용 — `structureMarksFu` 태그 + 현재까지 단계 */
export type StructureCandleHighlight = {
  tag: 'BOS' | 'CHOCH' | 'MSB';
  bias: 'bullish' | 'bearish';
  phase: StructureMarkPhase;
};

function phaseRankStructure(p: StructureMarkPhase): number {
  switch (p) {
    case 'failed':
      return 0;
    case 'trace':
      return 1;
    case 'breakout':
      return 2;
    case 'settling':
      return 3;
    case 'confirmed':
      return 4;
    default:
      return 0;
  }
}

/**
 * 돌파 발생 봉 time → 단계별 하이라이트 (차트 캔들 색). SMC 데스크 구조선과 동일 규칙.
 * 동일 봉에 여러 마크가 겹치면 단계가 더 진한 쪽을 남김.
 */
export function collectStructureMarkCandleHighlights(
  candles: Candle[],
  swingPivotRaw: number,
  maxMarks = 14,
  /** 돌파·안착 직후 몇 봉까지 연한 trace 하이라이트(0이면 생략) */
  traceBarsAfterBreakout = 0
): Map<number, StructureCandleHighlight> {
  const out = new Map<number, StructureCandleHighlight>();
  const n = candles.length;
  if (n < 8) return out;
  const L = Math.max(2, Math.min(4, Math.floor(swingPivotRaw ?? 2)));
  const marks = structureMarksFu(candles, L, maxMarks);
  for (const mk of marks) {
    const phase = resolveStructureMarkPhase(mk, candles, n);
    const t = Number(candles[mk.index]?.time);
    if (!Number.isFinite(t)) continue;
    const cell: StructureCandleHighlight = { tag: mk.tag, bias: mk.bias, phase };
    const prev = out.get(t);
    if (!prev || phaseRankStructure(phase) >= phaseRankStructure(prev.phase)) {
      out.set(t, cell);
    }
  }

  const tb = Math.max(0, Math.min(8, Math.floor(traceBarsAfterBreakout)));
  if (tb > 0) {
    for (const mk of marks) {
      const phase = resolveStructureMarkPhase(mk, candles, n);
      if (phase !== 'breakout' && phase !== 'settling') continue;
      for (let j = 1; j <= tb; j++) {
        const idx = mk.index + j;
        if (idx >= n) break;
        const tt = Number(candles[idx]?.time);
        if (!Number.isFinite(tt)) continue;
        const traceCell: StructureCandleHighlight = { tag: mk.tag, bias: mk.bias, phase: 'trace' };
        const prev = out.get(tt);
        if (!prev || phaseRankStructure('trace') >= phaseRankStructure(prev.phase)) {
          out.set(tt, traceCell);
        }
      }
    }
  }

  return out;
}

/** 돌파 봉·이후 봉 모두 **종가**로 레벨 유지 여부 판단 (마킹 규격과 동일) */
export function resolveStructureMarkPhase(
  mk: { index: number; price: number; bias: 'bullish' | 'bearish' },
  candles: Candle[],
  n: number
): StructureMarkPhase {
  const level = mk.price;
  const idx = mk.index;
  if (idx < 0 || idx >= n) return 'breakout';
  const bull = mk.bias === 'bullish';
  const closeOk = (cl: number) => (bull ? cl > level : cl < level);

  if (!closeOk(candles[idx].close)) return 'failed';

  for (let k = idx + 1; k < n; k++) {
    if (!closeOk(candles[k].close)) return 'failed';
  }

  const barsHeld = n - idx;
  if (barsHeld <= 1) return 'breakout';
  if (barsHeld === 2) return 'settling';
  return 'confirmed';
}

function structurePhaseStyle(phase: StructureMarkPhase, baseHex: string): {
  lineRgba: string;
  labelHex: string;
  lineDash?: string;
  labelSuffix: string;
  tooltipExtra: string;
} {
  const FAILED_LINE = '#9CA3AF';
  switch (phase) {
    case 'failed':
      return {
        lineRgba: 'rgba(156,163,175,0.42)',
        labelHex: FAILED_LINE,
        lineDash: '4 5',
        labelSuffix: ' ✕',
        tooltipExtra: ' — 이후 종가가 레벨 안쪽으로 되돌아 무효',
      };
    case 'trace':
      return {
        lineRgba: rgbaFromHex(baseHex, 0.2),
        labelHex: rgbaFromHex(baseHex, 0.5),
        lineDash: '2 7',
        labelSuffix: ' ·',
        tooltipExtra: ' — 돌파 직후 추적(연한 톤)',
      };
    case 'breakout':
      return {
        lineRgba: rgbaFromHex(baseHex, 0.48),
        labelHex: rgbaFromHex(baseHex, 0.82),
        lineDash: '3 6',
        labelSuffix: '',
        tooltipExtra: ' — 종가로 스윙 레벨 돌파가 확정된 봉',
      };
    case 'settling':
      return {
        lineRgba: rgbaFromHex(baseHex, 0.62),
        labelHex: rgbaFromHex(baseHex, 0.92),
        lineDash: '6 4',
        labelSuffix: ' ~',
        tooltipExtra: ' — 안착 진행(돌파 후 1봉 유지)',
      };
    case 'confirmed':
      return {
        lineRgba: rgbaFromHex(baseHex, 0.88),
        labelHex: baseHex,
        lineDash: undefined,
        labelSuffix: ' ✓',
        tooltipExtra: ' — 마감 기준 레벨 유지(3봉 이상)',
      };
  }
}

function collectOrderBlocks(
  candles: Candle[],
  startIdx: number,
  atrVal: number,
  maxPairs: number
): Array<{ leftIdx: number; top: number; bot: number; bull: boolean }> {
  const n = candles.length;
  const out: Array<{ leftIdx: number; top: number; bot: number; bull: boolean }> = [];
  if (atrVal <= 0 || n < startIdx + 5) return out;
  const mult = 1.15;
  const seen = new Set<string>();

  for (let i = n - 4; i >= startIdx + 1; i--) {
    if (out.length >= maxPairs * 2) break;
    const c = candles[i];
    const next = candles[i + 1];
    const bear = c.close < c.open;
    const bull = c.close > c.open;
    const top = Math.max(c.open, c.close);
    const bot = Math.min(c.open, c.close);

    if (bear && next.close > c.high && next.close - Math.min(c.open, c.close) >= atrVal * mult) {
      const key = `b${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ leftIdx: i, top, bot, bull: true });
      }
    }
    if (bull && next.close < c.low && Math.max(c.open, c.close) - next.close >= atrVal * mult) {
      const key = `s${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ leftIdx: i, top, bot, bull: false });
      }
    }
  }
  return out.slice(0, maxPairs * 2);
}

function volumeBiasInRange(candles: Candle[], eq: number, from: number, to: number): { premPct: number; discPct: number; neutralPct: number } {
  let vAbove = 0;
  let vBelow = 0;
  let vMid = 0;
  let sum = 0;
  for (let i = from; i <= to; i++) {
    const c = candles[i];
    const v = Math.max(0, c.volume || 0);
    sum += v;
    if (c.close > eq) vAbove += v;
    else if (c.close < eq) vBelow += v;
    else vMid += v;
  }
  if (sum <= 0) return { premPct: 50, discPct: 50, neutralPct: 0 };
  const half = vMid / 2;
  const prem = ((vAbove + half) / sum) * 100;
  const disc = ((vBelow + half) / sum) * 100;
  return {
    premPct: Math.round(prem),
    discPct: Math.round(disc),
    neutralPct: Math.max(0, 100 - Math.round(prem) - Math.round(disc)),
  };
}

export function buildSmcDeskOverlayPack(
  candles: Candle[],
  timeframe: string,
  opts: SmcDeskPackOptions
): OverlayItem[] {
  const {
    showEq,
    showOrderBlocks,
    showStructure,
    showZoneStrength,
    swingPivot: swingPivotRaw,
  } = opts;
  if (!showEq && !showOrderBlocks && !showStructure && !showZoneStrength) return [];

  const L = Math.max(2, Math.min(4, Math.floor(swingPivotRaw ?? 2)));
  const n = candles.length;
  if (n < L * 2 + 10) return [];

  const lb = Math.min(lookbackBars(timeframe), n - L - 2);
  const start = Math.max(L, n - lb);
  const last = n - 1;
  const tEnd = candles[last].time;

  const range = rangeFromPivots(candles, L, start, last - 1);
  if (!range) return [];

  let { swingHigh, swingLow } = range;
  if (swingHigh <= swingLow) {
    swingHigh = Math.max(...candles.slice(start, last + 1).map(c => c.high));
    swingLow = Math.min(...candles.slice(start, last + 1).map(c => c.low));
  }
  const eq = (swingHigh + swingLow) / 2;
  const tStart = range.tStart;

  const out: OverlayItem[] = [];
  const atrVal = atrRecent(candles, Math.min(50, n - 1));

  if (showEq) {
    out.push({
      id: 'smc-desk-eq-line',
      kind: 'equilibrium',
      label: 'EQ',
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0,
      time1: tStart,
      time2: tEnd,
      price1: eq,
      price2: eq,
      confidence: 55,
      color: 'rgba(148,163,184,0.75)',
      lineLabelColor: '#94a3b8',
      lineDash: '8 6',
      lineStrokeWidth: 1,
      category: CAT,
      noProject: true,
      labelTooltip: 'Equilibrium (스윙 고저 중간)',
    });
  }

  /** Premium/Discount 면 — 제거됨(요청: EQ 위·아래 반분 면만 불필요). `showPremiumDiscount` 옵션은 호환용으로 남김. */

  if (showZoneStrength) {
    const { premPct, discPct } = volumeBiasInRange(candles, eq, start, last);
    out.push({
      id: 'smc-desk-strength-premium',
      kind: 'label',
      label: `위 ${premPct}%`,
      x1: 0,
      y1: 0,
      time1: tEnd,
      price1: (swingHigh + eq) / 2,
      confidence: 50,
      color: 'rgba(248,113,113,0.95)',
      lineLabelColor: '#fecaca',
      labelBackgroundColor: 'rgba(127,29,29,0.35)',
      labelTextColor: '#fecaca',
      category: CAT,
      labelTooltip: `EQ 위쪽 종가 봉 거래량 비중(참고)`,
    });
    out.push({
      id: 'smc-desk-strength-discount',
      kind: 'label',
      label: `아래 ${discPct}%`,
      x1: 0,
      y1: 0,
      time1: tEnd,
      price1: (eq + swingLow) / 2,
      confidence: 50,
      color: 'rgba(74,222,128,0.95)',
      lineLabelColor: '#bbf7d0',
      labelBackgroundColor: 'rgba(20,83,45,0.35)',
      labelTextColor: '#bbf7d0',
      category: CAT,
      labelTooltip: `EQ 아래쪽 종가 봉 거래량 비중(참고)`,
    });
  }

  if (showOrderBlocks && atrVal > 0) {
    const obs = collectOrderBlocks(candles, start, atrVal, 3);
    let oid = 0;
    for (const b of obs) {
      const t0 = candles[b.leftIdx].time;
      const isBull = b.bull;
      const fill = isBull ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)';
      const border = isBull ? 'rgba(74,222,128,0.5)' : 'rgba(248,113,113,0.5)';
      const lbl = isBull ? 'Bull-OB' : 'Bear-OB';
      out.push({
        id: `smc-desk-ob-${oid++}`,
        kind: 'ob',
        label: lbl,
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 1,
        time1: t0,
        time2: tEnd,
        price1: b.top,
        price2: b.bot,
        confidence: 52,
        color: fill,
        lineLabelColor: border,
        category: CAT,
        labelTooltip: '임펄스 직전 반대 방향 봉 구간(단순화)',
      });
    }
  }

  if (showStructure) {
    const marks = structureMarksFu(candles, L, 14);
    for (let m = 0; m < marks.length; m++) {
      const mk = marks[m];
      const isChoch = mk.tag === 'CHOCH';
      const kind: OverlayItem['kind'] = isChoch ? 'choch' : 'bos';
      const bull = mk.bias === 'bullish';
      const baseHex = isChoch
        ? bull
          ? OVERLAY_COLORS.chochBullish
          : OVERLAY_COLORS.chochBearish
        : bull
          ? OVERLAY_COLORS.bosBullish
          : OVERLAY_COLORS.bosBearish;
      const phase = resolveStructureMarkPhase(mk, candles, n);
      const st = structurePhaseStyle(phase, baseHex);
      const i2 = Math.min(n - 1, mk.index + 8);
      const baseLbl = mk.tag === 'MSB' ? 'MSB' : mk.tag === 'CHOCH' ? 'CHOCH' : 'BOS';
      const lbl = `${baseLbl}${st.labelSuffix}`;
      const tfNote = `[${timeframe}] `;
      out.push({
        id: `smc-desk-${kind}-${m}-${mk.index}`,
        kind,
        label: lbl,
        x1: 0,
        y1: 0,
        x2: 1,
        y2: 0,
        time1: candles[mk.index].time,
        time2: candles[i2].time,
        price1: mk.price,
        price2: mk.price,
        confidence: 58,
        color: st.lineRgba,
        lineLabelColor: st.labelHex,
        lineDash: st.lineDash,
        category: CAT,
        structureBias: mk.bias,
        labelTooltip: `${tfNote}구조 ${mk.tag}${st.tooltipExtra}`,
      });
    }
  }

  return out;
}
