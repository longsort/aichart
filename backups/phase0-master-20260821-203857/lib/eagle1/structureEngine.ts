/**
 * Eagle1 market-structure-engine — causal events only.
 * A swing at i is knowable at i+L. BOS/CHoCH emit on the close bar, never backdated.
 */

export type Eagle1Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  takerBuyBaseVolume?: number;
};

export type SwingLabel = 'HH' | 'HL' | 'LH' | 'LL';

export type StructureEventKind = 'SWING' | 'BOS' | 'CHOCH' | 'SWEEP' | 'FAILED_BREAK';

export type RoleReversal = {
  price: number;
  from: 'resist' | 'support';
  to: 'support' | 'resist';
  known_at: number;
  status: 'active' | 'failed';
};

export type StructureState =
  | 'IDLE'
  | 'SETUP'
  | 'SWEEP'
  | 'SHIFT'
  | 'RETEST'
  | 'CONFIRMED'
  | 'INVALID';

export type Eagle1Regime =
  | 'STRONG_BULL'
  | 'BULL'
  | 'RANGE'
  | 'BEAR'
  | 'STRONG_BEAR'
  | 'ACCUMULATION'
  | 'DISTRIBUTION'
  | 'VOLATILITY_EXPANSION'
  | 'UNKNOWN';

export type StructureEvent = {
  kind: StructureEventKind;
  bias: 'bullish' | 'bearish';
  index: number;
  known_at: number;
  /** unix seconds of the known_at candle — display only, not used for causal detection */
  at?: number;
  price: number;
  level: number;
  swing?: SwingLabel;
  evidence: string[];
  opposing?: string[];
};

export type WyckoffContext = {
  label: 'AR' | 'SOW' | 'SPRING' | 'UT' | 'UTAD' | 'LPSY' | 'ACCUMULATION' | 'DISTRIBUTION' | 'NONE';
  evidence: string[];
};

export type PriceActionHint = {
  label:
    | 'engulfing_bull'
    | 'engulfing_bear'
    | 'harami_bull'
    | 'harami_bear'
    | 'pin_bull'
    | 'pin_bear'
    | 'double_top'
    | 'double_bottom'
    | 'none';
};

export type StructureSnapshot = {
  events: StructureEvent[];
  state: StructureState;
  regime: Eagle1Regime;
  regimeConfidence: 'low' | 'medium' | 'heuristic';
  lastSwingHigh: { index: number; price: number; known_at: number } | null;
  lastSwingLow: { index: number; price: number; known_at: number } | null;
  wyckoff: WyckoffContext;
  priceAction: PriceActionHint;
  equalHighs: number[];
  equalLows: number[];
  rangeHigh: number | null;
  rangeLow: number | null;
  roleReversals: RoleReversal[];
};

function isSwingHigh(c: Eagle1Bar[], i: number, L: number): boolean {
  if (i < L || i + L >= c.length) return false;
  const h = c[i]!.high;
  for (let k = i - L; k <= i + L; k++) {
    if (k === i) continue;
    const hk = c[k]!.high;
    if (hk > h) return false;
    if (hk === h && k < i) return false;
  }
  return true;
}

function isSwingLow(c: Eagle1Bar[], i: number, L: number): boolean {
  if (i < L || i + L >= c.length) return false;
  const lo = c[i]!.low;
  for (let k = i - L; k <= i + L; k++) {
    if (k === i) continue;
    const lk = c[k]!.low;
    if (lk < lo) return false;
    if (lk === lo && k < i) return false;
  }
  return true;
}

export function trueRange(prev: Eagle1Bar, cur: Eagle1Bar): number {
  return Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
}

export function atrAt(c: Eagle1Bar[], endExclusive: number, period = 14): number {
  const n = Math.min(c.length, endExclusive);
  if (n < 2) return 0;
  const start = Math.max(1, n - period);
  let sum = 0;
  let k = 0;
  for (let i = start; i < n; i++) {
    sum += trueRange(c[i - 1]!, c[i]!);
    k += 1;
  }
  return k > 0 ? sum / k : 0;
}

function labelSwingHigh(prev: number | null, price: number, eps: number): SwingLabel {
  if (prev == null) return 'HH';
  if (price > prev + eps) return 'HH';
  return 'LH';
}

function labelSwingLow(prev: number | null, price: number, eps: number): SwingLabel {
  if (prev == null) return 'HL';
  if (price < prev - eps) return 'LL';
  return 'HL';
}

function classifyRegime(
  highLabels: SwingLabel[],
  lowLabels: SwingLabel[],
  atrNow: number,
  atrPrev: number
): { regime: Eagle1Regime; confidence: 'low' | 'medium' | 'heuristic' } {
  if (highLabels.length < 2 || lowLabels.length < 2) {
    return { regime: 'UNKNOWN', confidence: 'low' };
  }
  const hh = highLabels.slice(-3).every((x) => x === 'HH');
  const hl = lowLabels.slice(-3).every((x) => x === 'HL');
  const lh = highLabels.slice(-3).every((x) => x === 'LH');
  const ll = lowLabels.slice(-3).every((x) => x === 'LL');
  const expanding = atrPrev > 0 && atrNow > atrPrev * 1.35;
  if (hh && hl) {
    return { regime: expanding ? 'STRONG_BULL' : 'BULL', confidence: 'heuristic' };
  }
  if (lh && ll) {
    return { regime: expanding ? 'STRONG_BEAR' : 'BEAR', confidence: 'heuristic' };
  }
  if (expanding) return { regime: 'VOLATILITY_EXPANSION', confidence: 'low' };
  return { regime: 'RANGE', confidence: 'heuristic' };
}

export const WYCKOFF_KO: Record<WyckoffContext['label'], string> = {
  AR: '횡보범위',
  SOW: '공급우세',
  SPRING: '스프링',
  UT: '상단테스트',
  UTAD: '고점분산',
  LPSY: '마지막공급',
  ACCUMULATION: '매집맥락',
  DISTRIBUTION: '분산맥락',
  NONE: '맥락 없음',
};

export function wyckoffKo(
  label: WyckoffContext['label'] | WyckoffContext | null | undefined
): string {
  if (label == null) return WYCKOFF_KO.NONE;
  const key = typeof label === 'string' ? label : label.label;
  return WYCKOFF_KO[key] ?? WYCKOFF_KO.NONE;
}

export function lastLiquidityKo(input: {
  events?: StructureEvent[] | null;
  equalHighs?: number[] | null;
  equalLows?: number[] | null;
} | null | undefined): string {
  if (!input) return '데이터 없음';
  const lastSweep = [...(input.events ?? [])].reverse().find((e) => e.kind === 'SWEEP');
  if (lastSweep?.bias === 'bullish') return '아래쪽 유동성 털기';
  if (lastSweep?.bias === 'bearish') return '위쪽 유동성 털기';
  if ((input.equalLows?.length || 0) > 0 || (input.equalHighs?.length || 0) > 0) return '유동성 대기';
  return '데이터 없음';
}

/** SSL = 아래 유동성 스윕(bullish), BSL = 위 유동성 스윕(bearish). 없으면 null. */
export function lastSweepLiquidity(events?: StructureEvent[] | null): { ssl: number | null; bsl: number | null } {
  const list = events ?? [];
  const ssl = [...list].reverse().find((e) => e.kind === 'SWEEP' && e.bias === 'bullish');
  const bsl = [...list].reverse().find((e) => e.kind === 'SWEEP' && e.bias === 'bearish');
  return { ssl: ssl?.level ?? null, bsl: bsl?.level ?? null };
}

function mostlyInsideRange(c: Eagle1Bar[], n: number, lastHigh: number, lastLow: number): boolean {
  const slice = c.slice(Math.max(0, n - 12), Math.max(0, n - 1));
  if (slice.length < 8) return false;
  const inside = slice.filter((b) => b.close <= lastHigh && b.close >= lastLow).length;
  return inside / slice.length >= 0.7;
}

function wyckoffContext(
  c: Eagle1Bar[],
  n: number,
  lastHigh: number | null,
  lastLow: number | null,
  events: StructureEvent[],
  highLabels: SwingLabel[],
  regime: Eagle1Regime
): WyckoffContext {
  if (n < 12 || lastHigh == null || lastLow == null || lastHigh <= lastLow) {
    return { label: 'NONE', evidence: [] };
  }
  const last = c[n - 1];
  if (!last) return { label: 'NONE', evidence: [] };
  const recentSweep = events.filter((e) => e.kind === 'SWEEP' && e.known_at >= n - 8);
  const olderSweep = events.filter((e) => e.kind === 'SWEEP' && e.known_at >= n - 20 && e.known_at < n - 8);
  const spring = recentSweep.find((e) => e.bias === 'bullish');
  const utad = recentSweep.find((e) => e.bias === 'bearish');
  if (spring) {
    return { label: 'SPRING', evidence: ['아래쪽 유동성 털기 후 범위 안 종가 — 와이코프 맥락(단독 매매 금지)'] };
  }
  if (utad) {
    return { label: 'UTAD', evidence: ['위쪽 유동성 털기 후 범위 안 종가 — 와이코프 맥락(단독 매매 금지)'] };
  }
  const lastHighLabel = highLabels[highLabels.length - 1];
  const olderUtad = olderSweep.find((e) => e.bias === 'bearish');
  if (lastHighLabel === 'LH' && olderUtad) {
    return { label: 'LPSY', evidence: ['고점분산 이후 낮아진 고점 — 마지막공급 추정(단독 매매 금지)'] };
  }
  const inRange = regime === 'RANGE' || mostlyInsideRange(c, n, lastHigh, lastLow);
  if (inRange && last.close < lastLow) {
    return { label: 'SOW', evidence: ['범위 저점 종가 이탈 — 공급우세 추정(단독 매매 금지)'] };
  }
  const recentFail = [...events].reverse().find((e) => e.kind === 'FAILED_BREAK' && e.known_at >= n - 8);
  if (recentFail?.bias === 'bearish' || (inRange && last.high > lastHigh && last.close <= lastHigh && last.close >= lastLow)) {
    return { label: 'UT', evidence: ['고점 위 윅 후 범위 안 종가 — 상단테스트 추정(단독 매매 금지)'] };
  }
  const rangePct = (lastHigh - lastLow) / lastLow;
  if (inRange && rangePct < 0.04) return { label: 'AR', evidence: ['좁은 횡보범위 — 와이코프 맥락(단독 매매 금지)'] };
  return { label: 'NONE', evidence: [] };
}

function priceActionHint(
  c: Eagle1Bar[],
  n: number,
  equalHighs: number[],
  equalLows: number[]
): PriceActionHint {
  if (n < 2) return { label: 'none' };
  const a = c[n - 2]!;
  const b = c[n - 1]!;
  const body = Math.abs(b.close - b.open);
  const prevBody = Math.abs(a.close - a.open);
  const upWick = b.high - Math.max(b.open, b.close);
  const dnWick = Math.min(b.open, b.close) - b.low;
  if (b.close > b.open && a.close < a.open && b.close >= a.open && b.open <= a.close) {
    return { label: 'engulfing_bull' };
  }
  if (b.close < b.open && a.close > a.open && b.close <= a.open && b.open >= a.close) {
    return { label: 'engulfing_bear' };
  }
  const bHi = Math.max(b.open, b.close);
  const bLo = Math.min(b.open, b.close);
  const aHi = Math.max(a.open, a.close);
  const aLo = Math.min(a.open, a.close);
  if (prevBody > body * 1.4 && bHi <= aHi && bLo >= aLo) {
    return { label: a.close < a.open ? 'harami_bull' : 'harami_bear' };
  }
  if (dnWick > body * 2 && upWick < body) return { label: 'pin_bull' };
  if (upWick > body * 2 && dnWick < body) return { label: 'pin_bear' };
  if (equalHighs.length && upWick > body) return { label: 'double_top' };
  if (equalLows.length && dnWick > body) return { label: 'double_bottom' };
  return { label: 'none' };
}

function advanceState(prev: StructureState, ev: StructureEvent): StructureState {
  if (ev.kind === 'SWEEP') {
    if (prev === 'IDLE' || prev === 'SETUP' || prev === 'INVALID') return 'SWEEP';
    return prev;
  }
  if (ev.kind === 'CHOCH') {
    if (prev === 'SWEEP' || prev === 'SETUP' || prev === 'IDLE') return 'SHIFT';
    return prev;
  }
  if (ev.kind === 'BOS') {
    if (prev === 'SHIFT' || prev === 'RETEST') return 'CONFIRMED';
    if (prev === 'IDLE' || prev === 'SETUP') return 'SETUP';
    return prev;
  }
  if (ev.kind === 'FAILED_BREAK') return 'INVALID';
  return prev;
}

/**
 * Detect structure on prefix [0, endExclusive).
 * Events never use candles at or after endExclusive.
 */
export function detectStructureCausal(
  candles: Eagle1Bar[],
  endExclusive?: number,
  swingLeft = 3
): StructureSnapshot {
  const n = Math.max(0, Math.min(candles.length, endExclusive ?? candles.length));
  const L = Math.max(1, Math.min(8, Math.floor(swingLeft)));
  const c = candles;
  const events: StructureEvent[] = [];
  const confirmedHighs: { index: number; price: number; known_at: number }[] = [];
  const confirmedLows: { index: number; price: number; known_at: number }[] = [];
  const highLabels: SwingLabel[] = [];
  const lowLabels: SwingLabel[] = [];
  let trend = 0;
  let state: StructureState = 'IDLE';
  const eps = atrAt(c, n) * 0.05;

  for (let i = L; i + L < n; i++) {
    const known_at = i + L;
    if (isSwingHigh(c, i, L)) {
      const prev = confirmedHighs.length ? confirmedHighs[confirmedHighs.length - 1]!.price : null;
      const swing = labelSwingHigh(prev, c[i]!.high, eps || c[i]!.high * 0.0001);
      confirmedHighs.push({ index: i, price: c[i]!.high, known_at });
      highLabels.push(swing);
      events.push({
        kind: 'SWING',
        bias: 'bearish',
        index: i,
        known_at,
        price: c[i]!.high,
        level: c[i]!.high,
        swing,
        evidence: [`스윙고점 확정(좌우 ${L}봉)`],
      });
    }
    if (isSwingLow(c, i, L)) {
      const prev = confirmedLows.length ? confirmedLows[confirmedLows.length - 1]!.price : null;
      const swing = labelSwingLow(prev, c[i]!.low, eps || c[i]!.low * 0.0001);
      confirmedLows.push({ index: i, price: c[i]!.low, known_at });
      lowLabels.push(swing);
      events.push({
        kind: 'SWING',
        bias: 'bullish',
        index: i,
        known_at,
        price: c[i]!.low,
        level: c[i]!.low,
        swing,
        evidence: [`스윙저점 확정(좌우 ${L}봉)`],
      });
    }
  }

  let hiPtr = 0;
  let loPtr = 0;
  let lastUsedHigh: { index: number; price: number; known_at: number } | null = null;
  let lastUsedLow: { index: number; price: number; known_at: number } | null = null;
  let lastBreak: { bias: 'bullish' | 'bearish'; level: number; known_at: number } | null = null;
  const roleReversals: RoleReversal[] = [];

  for (let t = 0; t < n; t++) {
    while (hiPtr < confirmedHighs.length && confirmedHighs[hiPtr]!.known_at <= t) {
      lastUsedHigh = confirmedHighs[hiPtr]!;
      hiPtr += 1;
    }
    while (loPtr < confirmedLows.length && confirmedLows[loPtr]!.known_at <= t) {
      lastUsedLow = confirmedLows[loPtr]!;
      loPtr += 1;
    }
    const bar = c[t]!;
    const failPad = Math.max(atrAt(c, t + 1) * 0.15, Math.abs(bar.close) * 0.0004);
    if (lastBreak && t > lastBreak.known_at) {
      const failBullBreak = lastBreak.bias === 'bullish' && bar.close < lastBreak.level - failPad;
      const failBearBreak = lastBreak.bias === 'bearish' && bar.close > lastBreak.level + failPad;
      if (failBullBreak || failBearBreak) {
        const ev: StructureEvent = {
          kind: 'FAILED_BREAK',
          bias: failBullBreak ? 'bearish' : 'bullish',
          index: t,
          known_at: t,
          price: bar.close,
          level: lastBreak.level,
          evidence: [
            failBullBreak
              ? '가짜돌파 — 돌파 레벨 종가 재이탈(확정 이벤트는 유지)'
              : '가짜이탈 — 이탈 레벨 종가 재탈환(확정 이벤트는 유지)',
          ],
        };
        events.push(ev);
        state = advanceState(state, ev);
        const lastRole = roleReversals[roleReversals.length - 1];
        if (lastRole && lastRole.price === lastBreak.level && lastRole.status === 'active') {
          lastRole.status = 'failed';
        }
        lastBreak = null;
        trend = 0;
      }
    }
    if (lastUsedHigh && t > lastUsedHigh.known_at && t > lastUsedHigh.index) {
      const lvl = lastUsedHigh.price;
      if (bar.close > lvl) {
        const kind: StructureEventKind = trend < 0 ? 'CHOCH' : 'BOS';
        const ev: StructureEvent = {
          kind,
          bias: 'bullish',
          index: t,
          known_at: t,
          price: bar.close,
          level: lvl,
          evidence: [
            kind === 'CHOCH' ? '하락 구조 고점 종가 돌파 · 추세전환(MSS)' : '상승 구조 고점 종가 돌파',
          ],
        };
        events.push(ev);
        state = advanceState(state, ev);
        trend = 1;
        lastBreak = { bias: 'bullish', level: lvl, known_at: t };
        roleReversals.push({ price: lvl, from: 'resist', to: 'support', known_at: t, status: 'active' });
        lastUsedHigh = null;
      } else if (bar.high > lvl && bar.close < lvl) {
        const ev: StructureEvent = {
          kind: 'SWEEP',
          bias: 'bearish',
          index: t,
          known_at: t,
          price: bar.high,
          level: lvl,
          evidence: ['고점 위 윅 후 레벨 아래 종가 — 유동성털기'],
        };
        events.push(ev);
        state = advanceState(state, ev);
      }
    }
    if (lastUsedLow && t > lastUsedLow.known_at && t > lastUsedLow.index) {
      const lvl = lastUsedLow.price;
      if (bar.close < lvl) {
        const kind: StructureEventKind = trend > 0 ? 'CHOCH' : 'BOS';
        const ev: StructureEvent = {
          kind,
          bias: 'bearish',
          index: t,
          known_at: t,
          price: bar.close,
          level: lvl,
          evidence: [
            kind === 'CHOCH' ? '상승 구조 저점 종가 이탈 · 추세전환(MSS)' : '하락 구조 저점 종가 이탈',
          ],
        };
        events.push(ev);
        state = advanceState(state, ev);
        trend = -1;
        lastBreak = { bias: 'bearish', level: lvl, known_at: t };
        roleReversals.push({ price: lvl, from: 'support', to: 'resist', known_at: t, status: 'active' });
        lastUsedLow = null;
      } else if (bar.low < lvl && bar.close > lvl) {
        const ev: StructureEvent = {
          kind: 'SWEEP',
          bias: 'bullish',
          index: t,
          known_at: t,
          price: bar.low,
          level: lvl,
          evidence: ['저점 아래 윅 후 레벨 위 종가 — 유동성털기'],
        };
        events.push(ev);
        state = advanceState(state, ev);
      }
    }
  }

  events.sort((a, b) => a.known_at - b.known_at || a.index - b.index);

  const lastChoCH = [...events].reverse().find((e) => e.kind === 'CHOCH');
  if (lastChoCH && state === 'SHIFT') {
    const last = c[n - 1];
    if (last) {
      const retest =
        lastChoCH.bias === 'bullish'
          ? last.low <= lastChoCH.level * 1.002 && last.close >= lastChoCH.level
          : last.high >= lastChoCH.level * 0.998 && last.close <= lastChoCH.level;
      if (retest) state = 'RETEST';
    }
  }

  const lastHigh = confirmedHighs.length ? confirmedHighs[confirmedHighs.length - 1]! : null;
  const lastLow = confirmedLows.length ? confirmedLows[confirmedLows.length - 1]! : null;
  const atrNow = atrAt(c, n);
  const atrPrev = atrAt(c, Math.max(0, n - 14));
  const { regime, confidence } = classifyRegime(highLabels, lowLabels, atrNow, atrPrev);

  let wyckoff = wyckoffContext(c, n, lastHigh?.price ?? null, lastLow?.price ?? null, events, highLabels, regime);
  if (wyckoff.label === 'SPRING' && regime === 'RANGE') {
    wyckoff = { label: 'ACCUMULATION', evidence: [...wyckoff.evidence, '범위+스프링 → 매집 맥락'] };
  }
  if ((wyckoff.label === 'UTAD' || wyckoff.label === 'LPSY') && regime === 'RANGE') {
    wyckoff = { label: 'DISTRIBUTION', evidence: [...wyckoff.evidence, '범위+고점분산 → 분산 맥락'] };
  }

  const eqTol = (atrNow || 1) * 0.15;
  const equalHighs: number[] = [];
  const equalLows: number[] = [];
  for (let i = 1; i < confirmedHighs.length; i++) {
    if (Math.abs(confirmedHighs[i]!.price - confirmedHighs[i - 1]!.price) <= eqTol) {
      equalHighs.push(confirmedHighs[i]!.price);
    }
  }
  for (let i = 1; i < confirmedLows.length; i++) {
    if (Math.abs(confirmedLows[i]!.price - confirmedLows[i - 1]!.price) <= eqTol) {
      equalLows.push(confirmedLows[i]!.price);
    }
  }

  if (state === 'IDLE' && (equalHighs.length || equalLows.length)) state = 'SETUP';

  return {
    events,
    state,
    regime,
    regimeConfidence: confidence,
    lastSwingHigh: lastHigh,
    lastSwingLow: lastLow,
    wyckoff,
    priceAction: priceActionHint(c, n, equalHighs, equalLows),
    equalHighs,
    equalLows,
    rangeHigh: lastHigh?.price ?? null,
    rangeLow: lastLow?.price ?? null,
    roleReversals: roleReversals.slice(-8),
  };
}

export function serializeStructureEvents(events: StructureEvent[]): string {
  return JSON.stringify(
    events.map((e) => ({
      kind: e.kind,
      bias: e.bias,
      index: e.index,
      known_at: e.known_at,
      level: round6(e.level),
      swing: e.swing ?? null,
    }))
  );
}

export function lastStructureEventKo(events: StructureEvent[] | null | undefined): string {
  if (!events?.length) return '데이터 없음';
  const ev = [...events].reverse().find((e) => e.kind !== 'SWING');
  if (!ev) return '데이터 없음';
  const arrow = ev.bias === 'bullish' ? '↑' : '↓';
  if (ev.kind === 'BOS') return `구조돌파 ${arrow}`;
  if (ev.kind === 'CHOCH') return `추세전환 ${arrow}`;
  if (ev.kind === 'SWEEP') return `유동성털기 ${arrow}`;
  if (ev.kind === 'FAILED_BREAK') return ev.bias === 'bearish' ? '가짜돌파' : '가짜이탈';
  return '데이터 없음';
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Prefix replay: events known by t must match live(t) vs full-history filtered. */
export function structureReplayParity(candles: Eagle1Bar[], checkpoints: number[], swingLeft = 3): string[] {
  const fails: string[] = [];
  const full = detectStructureCausal(candles, candles.length, swingLeft);
  for (const t of checkpoints) {
    const live = detectStructureCausal(candles, t, swingLeft);
    const later = full.events.filter((e) => e.known_at < t);
    const a = serializeStructureEvents(live.events);
    const b = serializeStructureEvents(later);
    if (a !== b) fails.push(`prefix mismatch t=${t}`);
  }
  return fails;
}
