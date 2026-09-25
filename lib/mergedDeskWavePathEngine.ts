/**
 * 파동 이동경로 엔진 — 카탈로그 매칭 + 다음 경로 투영.
 * 확정 피벗만 실선, 미확정 다음 레그는 점선(미래 우측 패드).
 * 확정 경로·승률 아님.
 */
import type { AnalyzeResponse, Candle, OverlayItem } from '@/types';
import type { MergedDeskHotZoneEntry } from '@/lib/mergedDeskHotZoneEntry';
import {
  detectZigzagPivots,
  attachTailSwingExtreme,
  refineZigzagPivotsToLegExtremes,
  ensureMajorSwingExtremes,
  collapseZigzagSameType,
  type ZigzagPivot,
} from '@/lib/candleAnalysisElliottMvp';
import {
  buildMergedDeskElliottPack,
  type MergedDeskElliottRead,
} from '@/lib/mergedDeskElliottWave';
import type { MergedDeskWyckoffRead } from '@/lib/mergedDeskWyckoffCycle';
import type { AvwapFibLeg } from '@/lib/vwap/avwapFibConfluence';
import type { AtlasPulsePriceLine } from '@/lib/monthDeskAtlasPulseDesk';
import { MERGED_DESK_RIGHT_FUTURE_BARS } from '@/lib/mergedDeskSharedChartView';
import {
  MERGED_DESK_WAVE_PATH_CATALOG,
  type WavePathBias,
  type WavePathKind,
  type WavePathTemplate,
} from '@/lib/mergedDeskWavePathCatalog';
import { normalizeChartTimeframe } from '@/lib/constants';
import { mergedDesk4hReferenceSwingChannelLookbackForTf } from '@/lib/mergedDesk4hReference';

/** 다음 이동은 한 방향(롱 또는 숏) · 빨간 2단 꺾인 점선만. 부채 3선·12사이클 금지 */
const WAVE_PATH_MAX_NEXT_LEGS = 2;

export type WavePathPoint = {
  time: number;
  price: number;
  label: string;
  /** false = 미래 투영(점선) */
  confirmed: boolean;
};

export type MergedDeskWavePathPack = {
  ok: boolean;
  templateId: string | null;
  kind: WavePathKind | null;
  bias: WavePathBias | null;
  phaseKo: string;
  waveLabel: string;
  score: number;
  pathPoints: WavePathPoint[];
  /** 주 시나리오 다음 꼭짓점 */
  nextTarget: number | null;
  /** 대안 목표 */
  altTarget: number | null;
  pressLevels: number[];
  resistLevels: number[];
  targetHi: number | null;
  targetLo: number | null;
  invalidPrice: number | null;
  expectBars: number;
  summaryKo: string;
  shortKo: string;
  overlays: OverlayItem[];
  priceLines: AtlasPulsePriceLine[];
};

function atrApprox(candles: Candle[]): number {
  const n = candles.length;
  if (n < 5) return Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
  let s = 0;
  let c = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const a = candles[i]!;
    const b = candles[i - 1]!;
    const tr = Math.max(
      a.high - a.low,
      Math.abs(a.high - b.close),
      Math.abs(a.low - b.close)
    );
    if (Number.isFinite(tr)) {
      s += tr;
      c += 1;
    }
  }
  return c > 0 ? s / c : Math.abs(Number(candles[n - 1]?.close) || 1) * 0.008;
}

function barStepSec(candles: Candle[]): number {
  const n = candles.length;
  if (n < 2) return 3600;
  const d = Math.abs(Number(candles[n - 1]!.time) - Number(candles[n - 2]!.time));
  return d > 0 && Number.isFinite(d) ? d : 3600;
}

function len(a: ZigzagPivot, b: ZigzagPivot): number {
  return Math.abs(b.price - a.price);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function emptyPack(phaseKo = '파동경로 대기'): MergedDeskWavePathPack {
  return {
    ok: false,
    templateId: null,
    kind: null,
    bias: null,
    phaseKo,
    waveLabel: '—',
    score: 0,
    pathPoints: [],
    nextTarget: null,
    altTarget: null,
    pressLevels: [],
    resistLevels: [],
    targetHi: null,
    targetLo: null,
    invalidPrice: null,
    expectBars: 0,
    summaryKo: phaseKo,
    shortKo: '파동대기',
    overlays: [],
    priceLines: [],
  };
}

function ratioInRange(r: number, range?: [number, number]): number {
  if (!range) return 0.5;
  const [lo, hi] = range;
  if (r >= lo && r <= hi) return 1;
  const mid = (lo + hi) / 2;
  const span = Math.max(hi - lo, 1e-9);
  return clamp(1 - Math.abs(r - mid) / span, 0, 0.85);
}

type MatchHit = {
  template: WavePathTemplate;
  pivots: ZigzagPivot[];
  /** 0-based completed impulse/correction legs after start */
  completedLegs: number;
  score: number;
  phaseKo: string;
  waveLabel: string;
};

function matchImpulse(pivots: ZigzagPivot[], template: WavePathTemplate): MatchHit | null {
  if (pivots.length < template.minPivots) return null;
  const bias = template.bias;
  const window = keepExtremeAndRecent(pivots, 12);
  const majorHi = Math.max(-Infinity, ...window.filter((p) => p.isHigh).map((p) => p.price));
  const majorLo = Math.min(Infinity, ...window.filter((p) => !p.isHigh).map((p) => p.price));
  let best: MatchHit | null = null;

  for (let start = 0; start <= window.length - 3; start++) {
    const slice = window.slice(start);
    const expectHighStart = bias === 'bearish';
    let okAlt = true;
    for (let i = 0; i < Math.min(slice.length, 6); i++) {
      const expectHigh = i % 2 === 0 ? expectHighStart : !expectHighStart;
      if (slice[i]!.isHigh !== expectHigh) {
        okAlt = false;
        break;
      }
    }
    if (!okAlt) continue;

    const p0 = slice[0]!;
    const p1 = slice[1]!;
    const p2 = slice[2]!;
    const w1 = len(p0, p1);
    if (!(w1 > 0)) continue;
    const r1 = bias === 'bullish' ? p2.price > p0.price : p2.price < p0.price;
    if (!r1) continue;

    const w2 = len(p1, p2);
    const w2r = w2 / w1;
    let score = 40 + ratioInRange(w2r, template.matchHints?.w2OfW1) * 25;
    let completed = 2; // through W2 pivot
    let waveLabel = '②';
    let phaseKo = 'W2 되돌림·관찰';

    if (slice.length >= 4) {
      const p3 = slice[3]!;
      const w3 = len(p2, p3);
      const r3ok = w3 + 1e-12 >= w1 * 0.85;
      if (!r3ok && slice.length >= 6) continue;
      score += 12;
      completed = 3;
      waveLabel = '③';
      phaseKo = 'W3 진행·확장';
      if (slice.length >= 5) {
        const p4 = slice[4]!;
        const r2 = bias === 'bullish' ? p4.price > p1.price : p4.price < p1.price;
        if (!r2) continue;
        const w4 = len(p3, p4);
        score += ratioInRange(w4 / Math.max(w3, 1e-9), template.matchHints?.w4OfW3) * 15;
        completed = 4;
        waveLabel = '④';
        phaseKo = 'W4 눌림·저항 관찰';
        if (slice.length >= 6) {
          const p5 = slice[5]!;
          const w5 = len(p4, p5);
          score += ratioInRange(w5 / w1, template.matchHints?.w5OfW1) * 12;
          completed = 5;
          waveLabel = '⑤';
          phaseKo = 'W5 마무리·전환 감시';
        }
      }
    } else {
      phaseKo = w2r > 0.55 ? 'W2 깊은되돌림' : 'W2 얕은되돌림';
    }

    const includesMajor =
      bias === 'bearish'
        ? slice.some((p) => p.isHigh && p.price >= majorHi * 0.999)
        : slice.some((p) => !p.isHigh && p.price <= majorLo * 1.001);
    if (includesMajor) score += 28;
    else score -= 22;
    const hit: MatchHit = {
      template,
      pivots: slice.slice(0, Math.min(6, slice.length)),
      completedLegs: completed,
      score,
      phaseKo,
      waveLabel,
    };
    if (!best || hit.score > best.score) best = hit;
  }
  return best;
}

function matchAbc(pivots: ZigzagPivot[], template: WavePathTemplate): MatchHit | null {
  if (pivots.length < 2) return null;
  const bias = template.bias;
  const window = keepExtremeAndRecent(pivots, 8);
  let best: MatchHit | null = null;

  for (let start = 0; start <= window.length - 2; start++) {
    const slice = window.slice(start);
    const a0 = slice[0]!;
    const a1 = slice[1]!;
    /** bullish 추세 속 조정: A는 하락 / bearish 추세 속 조정: A는 상승 */
    const aDown = a1.price < a0.price;
    const pullbackOk =
      (bias === 'bullish' && aDown) || (bias === 'bearish' && !aDown);
    if (!pullbackOk) continue;

    const lenA = len(a0, a1);
    if (!(lenA > 0)) continue;
    let score = 35;
    let completed = 1;
    let waveLabel = 'A';
    let phaseKo = 'A파 진행·B 대기';

    if (slice.length >= 3) {
      const b = slice[2]!;
      const lenB = len(a1, b);
      const br = lenB / lenA;
      score += ratioInRange(br, template.matchHints?.bOfA) * 30;
      completed = 2;
      waveLabel = 'B';
      phaseKo = template.kind === 'flat' ? 'Flat B · C 대기' : 'ZigZag B · C 대기';
      if (slice.length >= 4) {
        const c = slice[3]!;
        const lenC = len(b, c);
        const cr = lenC / lenA;
        score += ratioInRange(cr, template.matchHints?.cOfA) * 25;
        completed = 3;
        waveLabel = 'C';
        phaseKo = 'C파 마무리·추세 재개 감시';
      }
    }

    score += start * 0.35;
    const includesMajor =
      bias === 'bearish'
        ? slice.some((p) => p.isHigh && p.price >= Math.max(0, ...window.filter((x) => x.isHigh).map((x) => x.price)) * 0.999)
        : true;
    if (includesMajor && bias === 'bearish') score += 12;
    const hit: MatchHit = {
      template,
      pivots: slice.slice(0, Math.min(4, slice.length)),
      completedLegs: completed,
      score,
      phaseKo,
      waveLabel,
    };
    if (!best || hit.score > best.score) best = hit;
  }
  return best;
}

function projectNextPrice(
  template: WavePathTemplate,
  pivots: ZigzagPivot[],
  _completedLegs: number,
  legIndex: number,
  /** 직전 고스트/확정 꼭짓점 — 체인 투영용 */
  fromPrice?: number
): { price: number; label: string; bars: number } | null {
  const specs = template.nextLegs;
  const spec = specs[legIndex];
  if (!spec) return null;
  const bias = template.bias;
  const last = pivots[pivots.length - 1]!;
  const anchorPx = Number.isFinite(fromPrice) ? Number(fromPrice) : last.price;
  const p0 = pivots[0]!;
  const p1 = pivots[1];
  const p2 = pivots[2];
  const p3 = pivots[3];

  let baseLen = 0;
  if (spec.base === 'w1' && p1) baseLen = len(p0, p1);
  else if (spec.base === 'w3' && p2 && p3) baseLen = len(p2, p3);
  else if (spec.base === 'A' && p1) baseLen = len(p0, p1);
  else if (p1) baseLen = len(pivots[pivots.length - 2]!, last);
  if (!(baseLen > 0)) return null;

  const move = baseLen * spec.ratioOf;
  /** impulse: odd labels ②④ are retrace against trend; ③⑤ with trend */
  let dirUp: boolean;
  if (template.kind === 'impulse') {
    if (spec.retrace) dirUp = bias === 'bearish';
    else dirUp = bias === 'bullish';
  } else {
    /** ABC in bullish trend: A down, B up, C down */
    if (spec.label === 'B') dirUp = bias === 'bullish';
    else dirUp = bias === 'bearish'; // C continues A direction
  }

  const price = dirUp ? anchorPx + move : anchorPx - move;
  const prevBars =
    pivots.length >= 2
      ? Math.max(1, Math.abs(last.idx - pivots[pivots.length - 2]!.idx))
      : 8;
  const bars = Math.max(3, Math.round(prevBars * spec.barsMult));
  return { price, label: spec.label, bars };
}

/** 고스트 꼭짓점을 우측 여백에 겹치지 않게 배치 (maxFuture에 몰리면 점선 폭 0) */
function packFutureTimes(
  startTime: number,
  step: number,
  barCounts: number[],
  maxFuture: number
): number[] {
  const n = barCounts.length;
  if (n === 0) return [];
  const minGap = Math.max(step * 2, 1);
  const budget = Math.max(minGap * n, maxFuture - startTime);
  const raw = barCounts.map((b) => Math.max(2, b) * step);
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const scale = sum > budget ? budget / sum : 1;
  const times: number[] = [];
  let t = startTime;
  for (let i = 0; i < n; i++) {
    const gap = Math.max(minGap, raw[i]! * scale);
    t = Math.min(maxFuture, t + gap);
    times.push(t);
  }
  const stacked = times.some((x, i) => i > 0 && Math.abs(x - times[i - 1]!) < minGap * 0.5);
  if (stacked || (n >= 2 && times[n - 1] === times[0])) {
    const span = Math.max(minGap * n, maxFuture - startTime);
    for (let i = 0; i < n; i++) {
      times[i] = startTime + (span * (i + 1)) / n;
    }
  }
  return times;
}

/** 파랑빨강띠 파동 방향 — 채널 기울기만으로 단정하지 않음. 엘리엇·판결·스윙·와이코프 합의. */
function voteWavePathBias(params: {
  descending?: boolean | null;
  chipConsensus?: 'long' | 'short' | 'wait' | 'mixed' | null;
  elliottBias?: WavePathBias | null;
  hintBias?: WavePathBias | null;
  wyckoff?: MergedDeskWyckoffRead | null;
  verdict?: string | null;
  stanceSide?: 'LONG' | 'SHORT' | 'WAIT' | null;
  pivots: ZigzagPivot[];
}): WavePathBias | null {
  let bull = 0;
  let bear = 0;
  const add = (b: WavePathBias | null | undefined, w: number) => {
    if (b === 'bullish') bull += w;
    else if (b === 'bearish') bear += w;
  };
  add(params.elliottBias, 3);
  const v = String(params.verdict || '').toUpperCase();
  if (v === 'LONG') add('bullish', 3);
  if (v === 'SHORT') add('bearish', 3);
  if (params.stanceSide === 'LONG') add('bullish', 2);
  if (params.stanceSide === 'SHORT') add('bearish', 2);
  if (params.chipConsensus === 'long') add('bullish', 2);
  if (params.chipConsensus === 'short') add('bearish', 2);
  const wk = params.wyckoff;
  if (wk) {
    if (wk.spring || wk.macro === 'accumulation') add('bullish', 2);
    if (wk.utad || wk.macro === 'distribution') add('bearish', 2);
  }
  const seq = params.pivots.slice(-4);
  if (seq.length >= 3) {
    const net = seq[seq.length - 1]!.price - seq[0]!.price;
    add(net >= 0 ? 'bullish' : 'bearish', 2);
  }
  if (params.descending === true) add('bearish', 1);
  if (params.descending === false) add('bullish', 1);
  add(params.hintBias, 1);
  if (bull === 0 && bear === 0) return params.elliottBias || params.hintBias || null;
  return bull >= bear ? 'bullish' : 'bearish';
}

function stitchRecentPivots(matched: ZigzagPivot[], all: ZigzagPivot[]): ZigzagPivot[] {
  if (!matched.length) return all.slice(-6);
  const lastT = matched[matched.length - 1]!.time;
  const extra = all.filter((p) => p.time > lastT + 0.5);
  if (!extra.length) return matched;
  const seq = [...matched];
  for (const p of extra) {
    const prev = seq[seq.length - 1]!;
    if (prev.isHigh === p.isHigh) {
      if ((p.isHigh && p.price >= prev.price) || (!p.isHigh && p.price <= prev.price)) {
        seq[seq.length - 1] = p;
      }
    } else {
      seq.push(p);
    }
  }
  return collapseZigzagSameType(seq).slice(-8);
}

function pushPx(out: number[], n: unknown) {
  const x = Number(n);
  if (Number.isFinite(x) && x > 0) out.push(x);
}

function collectWavePathMarketLevels(params: {
  bouncePx?: number | null;
  resistPx?: number | null;
  dumpPx?: number | null;
  tipUpper?: number | null;
  tipLower?: number | null;
  targetHi?: number | null;
  targetLo?: number | null;
  hotZones?: Array<Pick<MergedDeskHotZoneEntry, 'top' | 'bot' | 'mid'>> | null;
  analysis?: AnalyzeResponse | null;
  planLevels?: {
    entry?: number;
    stopLoss?: number;
    tp1?: number;
    tp2?: number;
    tp3?: number;
    invalidationPrice?: number;
  } | null;
  vrvpPoc?: number | null;
  vrvpVaLow?: number | null;
  vrvpVaHigh?: number | null;
  coreSupport?: number | null;
  coreResist?: number | null;
  wyckoff?: MergedDeskWyckoffRead | null;
}): number[] {
  const out: number[] = [];
  pushPx(out, params.bouncePx);
  pushPx(out, params.resistPx);
  pushPx(out, params.dumpPx);
  pushPx(out, params.tipUpper);
  pushPx(out, params.tipLower);
  pushPx(out, params.targetHi);
  pushPx(out, params.targetLo);
  pushPx(out, params.vrvpPoc);
  pushPx(out, params.vrvpVaLow);
  pushPx(out, params.vrvpVaHigh);
  pushPx(out, params.coreSupport);
  pushPx(out, params.coreResist);
  for (const z of params.hotZones ?? []) {
    pushPx(out, z.mid);
    pushPx(out, z.top);
    pushPx(out, z.bot);
  }
  const pl = params.planLevels;
  if (pl) {
    pushPx(out, pl.entry);
    pushPx(out, pl.stopLoss);
    pushPx(out, pl.tp1);
    pushPx(out, pl.tp2);
    pushPx(out, pl.tp3);
    pushPx(out, pl.invalidationPrice);
  }
  const a = params.analysis;
  if (a) {
    pushPx(out, parseFloat(String(a.entry ?? '')));
    pushPx(out, parseFloat(String(a.stopLoss ?? '')));
    for (const t of a.targets ?? []) pushPx(out, parseFloat(String(t)));
    for (const fp of a.futurePaths ?? []) {
      for (const t of fp.targets ?? []) pushPx(out, t);
    }
    for (const p of a.beamPathForecast?.points ?? []) {
      pushPx(out, p.expectedPriceLong);
      pushPx(out, p.expectedPriceShort);
    }
  }
  if (params.wyckoff) {
    pushPx(out, params.wyckoff.support);
    pushPx(out, params.wyckoff.resist);
    pushPx(out, params.wyckoff.eventPrice);
  }
  const seen = new Set<number>();
  const uniq: number[] = [];
  for (const n of out) {
    const k = Math.round(n * 100);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(n);
  }
  return uniq;
}

function pivotsInChannelWindow(
  pivots: ZigzagPivot[],
  tStart?: number | null,
  tEnd?: number | null
): ZigzagPivot[] {
  const a = Number(tStart);
  const b = Number(tEnd);
  const hasStart = Number.isFinite(a) && a > 0;
  const hasEnd = Number.isFinite(b) && b > 0;
  if (!hasStart && !hasEnd) return pivots;
  return pivots.filter((p) => {
    if (hasStart && p.time < a - 1) return false;
    if (hasEnd && p.time > b + 1) return false;
    return true;
  });
}

function pivotsFromElliottLevels(
  pivots: ZigzagPivot[],
  read: MergedDeskElliottRead | null | undefined
): ZigzagPivot[] {
  const lv = read?.levels;
  if (!lv || !pivots.length) return [];
  const prices = [lv.p0, lv.p1, lv.p2, lv.p3, lv.p4, lv.p5].filter(
    (x): x is number => Number(x) > 0 && Number.isFinite(Number(x))
  );
  const used = new Set<number>();
  const out: ZigzagPivot[] = [];
  for (const px of prices) {
    let best: ZigzagPivot | null = null;
    let bestD = Infinity;
    for (const p of pivots) {
      if (used.has(p.idx)) continue;
      const d = Math.abs(p.price - px);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) continue;
    const tol = Math.max(Math.abs(px) * 0.008, 8);
    if (bestD > tol) continue;
    used.add(best.idx);
    out.push(best);
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

function hitFromRbPivots(
  pts: ZigzagPivot[],
  bias: WavePathBias,
  elliott: MergedDeskElliottRead | null | undefined
): MatchHit | null {
  const slice0 = collapseZigzagSameType(pts);
  const aligned =
    bias === 'bearish' && slice0[0] && !slice0[0].isHigh
      ? slice0.slice(1)
      : bias === 'bullish' && slice0[0] && slice0[0].isHigh
        ? slice0.slice(1)
        : slice0;
  if (aligned.length < 3) return null;
  const slice = aligned.slice(0, 6);
  const kind = elliott?.phase === 'correction' ? 'zigzag' : 'impulse';
  const tpl =
    MERGED_DESK_WAVE_PATH_CATALOG.find((t) => t.kind === kind && t.bias === bias) ||
    MERGED_DESK_WAVE_PATH_CATALOG.find((t) => t.bias === bias) ||
    MERGED_DESK_WAVE_PATH_CATALOG[0]!;
  return {
    template: tpl,
    pivots: slice,
    completedLegs: Math.min(5, slice.length - 1),
    score: 78,
    phaseKo: elliott?.headlineKo || (bias === 'bullish' ? '띠·상승파동' : '띠·하락파동'),
    waveLabel: elliott?.wave || String(slice.length - 1),
  };
}

function pickFinitePx(cands: Array<number | null | undefined>, pred: (n: number) => boolean): number | null {
  for (const c of cands) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0 && pred(n)) return n;
  }
  return null;
}

function lastImpulseLeg(
  pivots: ZigzagPivot[],
  bias: WavePathBias
): { from: ZigzagPivot; to: ZigzagPivot } | null {
  for (let i = pivots.length - 1; i >= 1; i--) {
    const to = pivots[i]!;
    const from = pivots[i - 1]!;
    if (bias === 'bullish' && !from.isHigh && to.isHigh && to.price > from.price) {
      return { from, to };
    }
    if (bias === 'bearish' && from.isHigh && !to.isHigh && to.price < from.price) {
      return { from, to };
    }
  }
  if (pivots.length >= 2) {
    return { from: pivots[pivots.length - 2]!, to: pivots[pivots.length - 1]! };
  }
  return null;
}

/** from→to 레그 위 피보 (r=1 이면 to, r=1.618 이면 확장) */
function fibAlong(from: number, to: number, r: number): number {
  return from + (to - from) * r;
}

function snapToPivotPrice(
  pivots: ZigzagPivot[],
  px: number,
  wantHigh: boolean,
  atr: number
): number {
  let best = px;
  let bestD = Infinity;
  for (const p of pivots) {
    if (p.isHigh !== wantHigh) continue;
    const d = Math.abs(p.price - px);
    if (d < bestD) {
      bestD = d;
      best = p.price;
    }
  }
  const tol = Math.max(atr * 0.85, Math.abs(px) * 0.005);
  return bestD <= tol ? best : px;
}

/** 되돌림(p1)만 최근 봉 심지에 붙임. 확장(p2)은 미래 목표라 최근고점에 끌어내리지 않음 */
function snapRetraceToCandle(
  candles: Candle[] | undefined,
  px: number,
  side: 'low' | 'high',
  atr: number
): number {
  if (!candles?.length || !(px > 0)) return px;
  const n = candles.length;
  const from = Math.max(0, n - 56);
  let best = px;
  let bestD = Infinity;
  for (let i = from; i < n; i++) {
    const w = side === 'low' ? Number(candles[i]!.low) : Number(candles[i]!.high);
    if (!(w > 0)) continue;
    const d = Math.abs(w - px);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  const tol = Math.max(atr * 0.7, Math.abs(px) * 0.004);
  return bestD <= tol ? best : px;
}

function nearestToTheory(
  theory: number,
  cands: Array<number | null | undefined>,
  pred: (n: number) => boolean,
  atr: number
): number {
  const ok: number[] = [];
  for (const c of cands) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0 && pred(n)) ok.push(n);
  }
  if (!ok.length || !(theory > 0)) return theory > 0 ? theory : ok[0] ?? 0;
  ok.sort((a, b) => Math.abs(a - theory) - Math.abs(b - theory));
  const best = ok[0]!;
  const tol = Math.max(atr * 2.8, Math.abs(theory) * 0.018);
  return Math.abs(best - theory) <= tol ? best : theory;
}

function fibLegLevels(
  legs: AvwapFibLeg[] | null | undefined,
  rising: boolean
): { ret382: number | null; ret618: number | null; ext1618: number | null } {
  const list = legs ?? [];
  const leg = list.find((l) => l.risingLeg === rising) ?? list[list.length - 1] ?? null;
  if (!leg) return { ret382: null, ret618: null, ext1618: null };
  const span = Number(leg.fibHigh) - Number(leg.fibLow);
  if (!(span > 0)) return { ret382: null, ret618: null, ext1618: null };
  if (rising) {
    return {
      ret382: Number(leg.fibHigh) - span * 0.382,
      ret618: Number(leg.fibHigh) - span * 0.618,
      ext1618: Number(leg.fibLow) + span * 1.618,
    };
  }
  return {
    ret382: Number(leg.fibLow) + span * 0.382,
    ret618: Number(leg.fibLow) + span * 0.618,
    ext1618: Number(leg.fibHigh) - span * 1.618,
  };
}

/** 템플릿 약해도 최근 지그재그 피벗을 확정 실선 0–1–2…로 씀 */
function pivotsFromMajorExtreme(
  pivots: ZigzagPivot[],
  bias: WavePathBias | null
): ZigzagPivot[] {
  if (pivots.length < 3 || !bias) return pivots;
  if (bias === 'bearish') {
    let hi = -1;
    let hiPx = -Infinity;
    for (let i = 0; i < pivots.length; i++) {
      const p = pivots[i]!;
      if (p.isHigh && p.price > hiPx) {
        hiPx = p.price;
        hi = i;
      }
    }
    if (hi < 0) return pivots;
    const sliced = pivots.slice(hi);
    return sliced.length >= 3 ? sliced : pivots;
  }
  let lo = -1;
  let loPx = Infinity;
  for (let i = 0; i < pivots.length; i++) {
    const p = pivots[i]!;
    if (!p.isHigh && p.price < loPx) {
      loPx = p.price;
      lo = i;
    }
  }
  if (lo < 0) return pivots;
  const sliced = pivots.slice(lo);
  return sliced.length >= 3 ? sliced : pivots;
}

function keepExtremeAndRecent(pivots: ZigzagPivot[], cap = 10): ZigzagPivot[] {
  const seq = collapseZigzagSameType(pivots);
  if (seq.length <= cap) return seq;
  const head = seq[0]!;
  const tail = seq.slice(-(cap - 1));
  if (tail.some((p) => p.time === head.time && p.price === head.price)) {
    return collapseZigzagSameType(tail);
  }
  return collapseZigzagSameType([head, ...tail.filter((p) => p.time > head.time)]);
}

function wavePathCandleWindow(candles: Candle[], tf?: string | null): Candle[] {
  const n = mergedDesk4hReferenceSwingChannelLookbackForTf(tf || undefined);
  if (candles.length <= n) return candles;
  return candles.slice(-n);
}

function spineFromZigzag(
  pivots: ZigzagPivot[],
  hintBias: WavePathBias | null
): MatchHit | null {
  if (pivots.length < 3) return null;
  let window = keepExtremeAndRecent(pivots, 8);
  for (let i = 1; i < window.length; i++) {
    if (window[i]!.isHigh === window[i - 1]!.isHigh) {
      window = window.slice(i);
      i = 0;
    }
  }
  if (window.length < 3) return null;
  const startHigh = window[0]!.isHigh;
  const net = window[window.length - 1]!.price - window[0]!.price;
  let bias: WavePathBias;
  if (hintBias) bias = hintBias;
  else if (!startHigh && net >= 0) bias = 'bullish';
  else if (startHigh && net <= 0) bias = 'bearish';
  else bias = net >= 0 ? 'bullish' : 'bearish';
  const expectHighStart = bias === 'bearish';
  if (window[0]!.isHigh !== expectHighStart) {
    window = window.slice(1);
    if (window.length < 3 || window[0]!.isHigh !== expectHighStart) return null;
  }
  const tpl =
    MERGED_DESK_WAVE_PATH_CATALOG.find((t) => t.kind === 'impulse' && t.bias === bias) ||
    MERGED_DESK_WAVE_PATH_CATALOG[0]!;
  const slice = window.slice(0, Math.min(6, window.length));
  const completed = Math.min(5, slice.length - 1);
  const labels = ['0', '1', '2', '3', '4', '5'];
  return {
    template: tpl,
    pivots: slice,
    completedLegs: completed,
    score: 42,
    phaseKo: '지그재그 파동경로',
    waveLabel: labels[completed] || '—',
  };
}

/**
 * 엘리엇 2단 꺾임 — 캔들 스윙 레그 + 피보 0.382→1.618 + 와이코프 스프링/UTAD 합류.
 * 롱: 되돌림(하) → 재개(상). 숏: 되돌림(상) → 재개(하).
 * 확정 경로·승률 아님.
 */
function buildTwoStageRedKink(params: {
  pivots: ZigzagPivot[];
  bias: WavePathBias;
  tLive: number;
  close: number;
  step: number;
  scaleBars: (n: number) => number;
  maxFuture: number;
  atr: number;
  candles?: Candle[];
  dumpPx?: number | null;
  bouncePx?: number | null;
  resistPx?: number | null;
  tipUpper?: number | null;
  tipLower?: number | null;
  targetHi?: number | null;
  targetLo?: number | null;
  expectBars?: number | null;
  wyckoff?: MergedDeskWyckoffRead | null;
  fibLegs?: AvwapFibLeg[] | null;
  marketLevels?: number[] | null;
}): WavePathPoint[] {
  const { bias, tLive, close, step, scaleBars, maxFuture, atr } = params;
  const pts = params.pivots;
  const last = pts[pts.length - 1];
  const lastIsHigh = last ? last.isHigh : bias === 'bearish';
  const origin = last?.price ?? close;
  const tOrigin = last && last.time > 0 ? last.time : tLive;
  const bull = bias === 'bullish';
  const leg = lastImpulseLeg(pts, bias);
  const fromPx = leg?.from.price ?? origin;
  const toPx = leg?.to.price ?? origin;
  let span = Math.abs(toPx - fromPx);
  const tipHi = Number(params.tipUpper);
  const tipLo = Number(params.tipLower);
  const bandW = Number.isFinite(tipHi) && Number.isFinite(tipLo) && tipHi > tipLo ? tipHi - tipLo : 0;
  if (!(span > 0)) span = Math.max(atr * 1.2, Math.abs(origin) * 0.006);
  if (bandW > 0) span = Math.max(span, bandW * 0.42);

  const ret382 = fibAlong(toPx, fromPx, 0.382);
  const ret500 = fibAlong(toPx, fromPx, 0.5);
  const ret618 = fibAlong(toPx, fromPx, 0.618);
  const ext127 = fibAlong(fromPx, toPx, 1.272);
  const ext161 = fibAlong(fromPx, toPx, 1.618);
  const fibLv = fibLegLevels(params.fibLegs, bull);
  const wk = params.wyckoff;
  const mkt = params.marketLevels ?? [];

  /** 다음 꼭짓점은 고↔저 교차. 마지막 봉 종가에서 꺾지 않음 */
  let p1: number;
  let p2: number;
  if (lastIsHigh) {
    /** 고 → 저 → 고 */
    if (bull) {
      const springPx =
        wk?.spring || wk?.event === 'Spring' || wk?.event === 'LPS' || wk?.macro === 'accumulation'
          ? wk.eventPrice || wk.support
          : wk?.support;
      const theory1 = ret382 < origin ? ret382 : origin - span * 0.382;
      p1 = nearestToTheory(
        theory1,
        [springPx, params.bouncePx, tipLo, fibLv.ret382, fibLv.ret618, ret500, ret618, fromPx, ...mkt],
        (n) => n < origin,
        atr
      );
      p1 = snapToPivotPrice(pts, p1, false, atr);
      p1 = snapRetraceToCandle(params.candles, p1, 'low', atr);
      if (!(p1 < origin)) p1 = origin - span * 0.382;
      const theory2 = ext161 > origin ? ext161 : origin + span * 1.618;
      p2 = nearestToTheory(
        theory2,
        [params.resistPx, params.targetHi, tipHi, ext127, fibLv.ext1618, wk?.resist, ...mkt],
        (n) => n > p1,
        atr
      );
      p2 = snapToPivotPrice(pts, p2, true, atr);
      if (!(p2 > p1)) p2 = p1 + span * 1.618;
    } else {
      const theory1 = origin - span * 1.618;
      p1 = nearestToTheory(
        theory1,
        [params.dumpPx, params.targetLo, tipLo, fibLv.ext1618, wk?.support, ...mkt],
        (n) => n < origin,
        atr
      );
      p1 = snapToPivotPrice(pts, p1, false, atr);
      if (!(p1 < origin)) p1 = origin - span * 1.618;
      const bounceHi = p1 + Math.abs(origin - p1) * 0.382;
      p2 = nearestToTheory(
        bounceHi,
        [params.resistPx, tipHi, fibLv.ret382, wk?.resist, ...mkt],
        (n) => n > p1,
        atr
      );
      p2 = snapToPivotPrice(pts, p2, true, atr);
      if (!(p2 > p1)) p2 = p1 + Math.abs(origin - p1) * 0.382;
    }
  } else if (bull) {
    /** 저 → 고 → 더 높은 저 */
    const theory1 = origin + span * 1.618;
    p1 = nearestToTheory(
      theory1,
      [params.resistPx, params.targetHi, tipHi, ext127, fibLv.ext1618, wk?.resist, ...mkt],
      (n) => n > origin,
      atr
    );
    p1 = snapToPivotPrice(pts, p1, true, atr);
    if (!(p1 > origin)) p1 = origin + span * 1.618;
    const hl = origin + Math.abs(p1 - origin) * 0.382;
    p2 = nearestToTheory(
      hl,
      [params.bouncePx, tipLo, fibLv.ret382, wk?.support, ...mkt],
      (n) => n < p1,
      atr
    );
    p2 = snapToPivotPrice(pts, p2, false, atr);
    if (!(p2 < p1)) p2 = origin + Math.abs(p1 - origin) * 0.382;
    if (p2 <= origin) p2 = origin + Math.abs(p1 - origin) * 0.382;
  } else {
    /** 저 → 고(되돌림) → 더 낮은 저 */
    const utadPx =
      wk?.utad || wk?.event === 'UTAD' || wk?.event === 'UT' || wk?.macro === 'distribution'
        ? wk.eventPrice || wk.resist
        : wk?.resist;
    const theory1 = ret382 > origin ? ret382 : origin + span * 0.382;
    p1 = nearestToTheory(
      theory1,
      [utadPx, params.resistPx, tipHi, fibLv.ret382, fibLv.ret618, ret500, fromPx, ...mkt],
      (n) => n > origin,
      atr
    );
    p1 = snapToPivotPrice(pts, p1, true, atr);
    p1 = snapRetraceToCandle(params.candles, p1, 'high', atr);
    if (!(p1 > origin)) p1 = origin + span * 0.382;
    const theory2 = origin - span * 1.618;
    p2 = nearestToTheory(
      theory2,
      [params.dumpPx, params.targetLo, tipLo, ext127, fibLv.ext1618, wk?.support, ...mkt],
      (n) => n < p1,
      atr
    );
    p2 = snapToPivotPrice(pts, p2, false, atr);
    if (!(p2 < p1)) p2 = p1 - span * 1.618;
  }

  const legBars = leg ? Math.max(4, Math.abs(leg.to.idx - leg.from.idx)) : 10;
  const expect = Math.max(8, Math.round(Number(params.expectBars) || legBars));
  const bars = [
    scaleBars(Math.max(3, Math.round(legBars * 0.382))),
    scaleBars(Math.max(5, Math.round(Math.max(expect * 0.55, legBars * 1.0)))),
  ];
  let times = packFutureTimes(tOrigin, step, bars, maxFuture);
  if (times[0] != null && times[0] < tLive) {
    times = packFutureTimes(tLive, step, bars, maxFuture);
  }
  return [
    {
      time: times[0] ?? Math.max(tLive, tOrigin) + step * bars[0]!,
      price: p1,
      label: lastIsHigh ? 'L' : 'H',
      confirmed: false,
    },
    {
      time: times[1] ?? Math.max(tLive, tOrigin) + step * (bars[0]! + bars[1]!),
      price: p2,
      label: lastIsHigh ? 'H' : 'L',
      confirmed: false,
    },
  ];
}
function buildGhostChain(params: {
  template: WavePathTemplate;
  pivots: ZigzagPivot[];
  completedLegs: number;
  tLive: number;
  step: number;
  scaleBars: (n: number) => number;
  maxFuture: number;
  dumpPx?: number | null;
  bouncePx?: number | null;
  resistPx?: number | null;
  close: number;
}): WavePathPoint[] {
  const { template, pivots, completedLegs, tLive, step, scaleBars, maxFuture } = params;
  const pending: Array<{ price: number; label: string; bars: number }> = [];
  let cursorPx = pivots[pivots.length - 1]!.price;
  const bull = template.bias === 'bullish';

  const queueGhost = (price: number, label: string, bars: number) => {
    cursorPx = price;
    pending.push({
      price,
      label: label.includes('?') ? label : `${label}?`,
      bars: scaleBars(bars),
    });
  };

  if (template.kind === 'impulse') {
    /** completedLegs: 2=W2확정 → next는 ③④⑤ + ABC */
    for (let li = 0; li < template.nextLegs.length; li++) {
      const waveNum = li + 2; // nextLegs[0]=W2
      if (waveNum <= completedLegs) continue;
      const proj = projectNextPrice(template, pivots, completedLegs, li, cursorPx);
      if (!proj) continue;
      let px = proj.price;
      if (pending.length === 0) {
        if (bull && params.resistPx != null && Number(params.resistPx) > params.close) {
          px = (px + Number(params.resistPx)) / 2;
        } else if (!bull && params.bouncePx != null && Number(params.bouncePx) < params.close) {
          px = (px + Number(params.bouncePx)) / 2;
        }
      }
      queueGhost(px, String(waveNum), proj.bars);
    }
    /** 임펄스 완료 후 또는 고스트 5까지 갔으면 ABC 고스트 */
    const needAbc =
      completedLegs >= 5 || pending.some((p) => p.label.startsWith('5'));
    if (needAbc) {
      const p0 = pivots[0]!;
      const p1 = pivots[1]!;
      const w1 = len(p0, p1);
      let aPx = bull ? cursorPx - w1 * 0.5 : cursorPx + w1 * 0.5;
      if (params.dumpPx != null && Number(params.dumpPx) > 0) aPx = Number(params.dumpPx);
      else if (bull && params.bouncePx != null && Number(params.bouncePx) > 0 && Number(params.bouncePx) < params.close) {
        aPx = Number(params.bouncePx);
      }
      const barsA = Math.max(4, Math.round(w1 > 0 ? 8 : 6));
      queueGhost(aPx, 'A', barsA);
      const bPx = bull ? cursorPx + w1 * 0.382 : cursorPx - w1 * 0.382;
      queueGhost(bPx, 'B', Math.max(3, Math.round(barsA * 0.7)));
      const cPx = bull ? cursorPx - w1 * 0.618 : cursorPx + w1 * 0.618;
      queueGhost(cPx, 'C', Math.max(3, Math.round(barsA * 0.9)));
    }
  } else {
  /** zigzag / flat */
  for (let li = 0; li < template.nextLegs.length; li++) {
    if (li + 1 <= completedLegs) continue;
    const proj = projectNextPrice(template, pivots, completedLegs, li, cursorPx);
    if (!proj) continue;
      queueGhost(proj.price, proj.label.replace(/[②③④⑤]/g, '') || proj.label, proj.bars);
    }
  }

  const nextLegs = pending.slice(0, WAVE_PATH_MAX_NEXT_LEGS);
  const times = packFutureTimes(
    tLive,
    step,
    nextLegs.map((p) => p.bars),
    maxFuture
  );
  return nextLegs.map((p, i) => ({
    time: times[i] ?? tLive + step * (i + 2),
    price: p.price,
    label: p.label,
    confirmed: false,
  }));
}

/** EIE trailing invalidation — 가설 깨지는 한 줄 */
function trailingInvalidPrice(
  hit: MatchHit,
  atr: number
): number | null {
  const pts = hit.pivots;
  if (pts.length < 1) return null;
  const bull = hit.template.bias === 'bullish';
  const p0 = pts[0]!.price;
  const p2 = pts[2]?.price;
  const p4 = pts[4]?.price;
  let lvl = p0;
  /** EIE trailing: W5면 p4, W3~W4면 p2, 그 전은 p0 */
  if (hit.completedLegs >= 5 && p4 != null) lvl = p4;
  else if (hit.completedLegs >= 3 && p2 != null) lvl = p2;
  const pad = atr * 0.12;
  return bull ? lvl - pad : lvl + pad;
}

function wavePathTfBarsMult(tf?: string | null): number {
  const n = normalizeChartTimeframe(String(tf || '15m'));
  if (n === '1M') return 1.85;
  if (n === '1w') return 1.55;
  if (n === '1d') return 1.3;
  if (n === '4h') return 1.12;
  return 1;
}

function avgBody(candles: Candle[]): number {
  const n = candles.length;
  if (n < 3) return atrApprox(candles) * 0.35;
  let s = 0;
  let c = 0;
  for (let i = Math.max(0, n - 20); i < n; i++) {
    const k = candles[i]!;
    const b = Math.abs(Number(k.close) - Number(k.open));
    if (Number.isFinite(b)) {
      s += b;
      c += 1;
    }
  }
  return c > 0 ? s / c : atrApprox(candles) * 0.35;
}

/**
 * 손그림형 두꺼운 흰 이동경로 — 중심선 + 범위 폭(봉몸통 ~0.4) 복도.
 */
function pushThickWaveRibbon(
  overlays: OverlayItem[],
  samples: Array<{ time: number; price: number }>,
  opts: {
    idPrefix: string;
    halfWidth: number;
    label?: string;
    tooltip: string;
    upward: boolean;
  }
) {
  const hw = Math.max(opts.halfWidth, 1e-6);
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]!;
    const b = samples[i + 1]!;
    if (!(a.time > 0) || !(b.time > 0)) continue;
    if (Math.abs(b.time - a.time) < 1 && Math.abs(b.price - a.price) < 1e-9) continue;
    const down = b.price < a.price;
    overlays.push({
      id: `${opts.idPrefix}-band-${i}`,
      kind: 'channelBand',
      label: '',
      zoneFaceBase: undefined,
      zoneFaceSignal: undefined,
      x1: 0.2,
      y1: 0.5,
      x2: 0.4,
      y2: 0.5,
      time1: a.time,
      time2: b.time,
      price1: Math.max(a.price, b.price) + hw,
      price2: Math.min(a.price, b.price) - hw,
      confidence: 88,
      color: 'rgba(248,250,252,0.42)',
      category: 'chartPrimeTrendChannels',
      zoneFillPreserve: true,
      channelBand: {
        time1: a.time,
        time2: b.time,
        priceHigh1: a.price + hw,
        priceHigh2: b.price + hw,
        priceLow1: a.price - hw,
        priceLow2: b.price - hw,
      },
      overlayZoneExtraClass:
        'merged-desk-wave-path merged-desk-wave-path-ribbon merged-desk-wave-path-curve merged-desk-wave-path-keep',
      labelTooltip: opts.tooltip,
      noProject: true,
      structureBias: opts.upward ? 'bullish' : 'bearish',
      lineLabelColor: '#f8fafc',
      labelBackgroundColor: 'rgba(15,23,42,0.9)',
      labelTextColor: '#f8fafc',
    });
    overlays.push({
      id: `${opts.idPrefix}-core-${i}`,
      kind: 'trendLine',
      label: '',
      x1: 0.2,
      y1: 0.5,
      x2: 0.4,
      y2: 0.5,
      time1: a.time,
      time2: b.time,
      price1: a.price,
      price2: b.price,
      confidence: 90,
      color: 'rgba(255,255,255,0.96)',
      lineStrokeWidth: 5.5,
      category: 'mergedDeskWavePath',
      overlayZoneExtraClass:
        'merged-desk-wave-path merged-desk-wave-path-core merged-desk-wave-path-curve merged-desk-wave-path-keep',
      labelTooltip: opts.tooltip,
      noProject: true,
      structureBias: down ? 'bearish' : 'bullish',
      lineLabelColor: '#ffffff',
    });
  }
}

function pushCurveTrendSegments(
  overlays: OverlayItem[],
  samples: Array<{ time: number; price: number }>,
  opts: {
    idPrefix: string;
    dashed: boolean;
    color: string;
    label?: string;
    tooltip: string;
    upward: boolean;
    halfWidth?: number;
  }
) {
  /** 다음(미래) 경로 = 손그림형 두꺼운 흰 리본 */
  if (opts.dashed && opts.halfWidth != null && opts.halfWidth > 0) {
    pushThickWaveRibbon(overlays, samples, {
      idPrefix: opts.idPrefix,
      halfWidth: opts.halfWidth,
      label: opts.label,
      tooltip: opts.tooltip,
      upward: opts.upward,
    });
    return;
  }
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]!;
    const b = samples[i + 1]!;
    if (!(a.time > 0) || !(b.time > 0)) continue;
    if (Math.abs(b.time - a.time) < 1 && Math.abs(b.price - a.price) < 1e-9) continue;
    overlays.push({
      id: `${opts.idPrefix}-${i}`,
      kind: 'trendLine',
      label: i === 0 ? '' : '',
      zoneFaceBase: undefined,
      zoneFaceSignal: undefined,
      x1: 0.2,
      y1: 0.5,
      x2: 0.4,
      y2: 0.5,
      time1: a.time,
      time2: b.time,
      price1: a.price,
      price2: b.price,
      confidence: opts.dashed ? 74 : 84,
      color: opts.color,
      lineStrokeWidth: opts.dashed ? 2.1 : 2.3,
      lineDash: opts.dashed ? '5 4' : undefined,
      category: 'mergedDeskWavePath',
      overlayZoneExtraClass: opts.dashed
        ? 'merged-desk-wave-path merged-desk-wave-path-dash merged-desk-wave-path-curve'
        : 'merged-desk-wave-path merged-desk-wave-path-solid merged-desk-wave-path-curve',
      labelTooltip: opts.tooltip,
      noProject: true,
      structureBias: opts.upward ? 'bullish' : 'bearish',
      lineLabelColor: '#f8fafc',
      labelBackgroundColor: 'rgba(15,23,42,0.88)',
      labelTextColor: '#f8fafc',
    });
  }
}

function buildOverlaysAndLines(params: {
  candles: Candle[];
  hit: MatchHit;
  confirmed: WavePathPoint[];
  projected: WavePathPoint[];
  nextTarget: number | null;
  altTarget: number | null;
  invalidPrice: number | null;
  pressLevels: number[];
  resistLevels: number[];
  targetHi: number | null;
  targetLo: number | null;
  summaryKo: string;
  shortKo: string;
  expectBars: number;
  liveAnchor: WavePathPoint;
}): { overlays: OverlayItem[]; priceLines: AtlasPulsePriceLine[] } {
  const overlays: OverlayItem[] = [];
  const priceLines: AtlasPulsePriceLine[] = [];
  const bull = params.hit.template.bias === 'bullish';
  /** 확정=방향색 실선 · 다음=빨간 2단 꺾인 점선(한 방향) */
  const solidColor = bull ? 'rgba(27,94,32,0.95)' : 'rgba(211,47,47,0.95)';
  const ghostColor = 'rgba(239,68,68,0.95)';
  const oteFill = 'rgba(255,235,59,0.22)';
  const oteBorder = 'rgba(255,193,7,0.92)';

  const pushSeg = (
    a: { time: number; price: number },
    b: { time: number; price: number },
    opts: { id: string; dashed: boolean; color: string; width: number; tip?: string }
  ) => {
    if (!(a.time > 0) || !(b.time > 0)) return;
    if (Math.abs(b.time - a.time) < 1 && Math.abs(b.price - a.price) < 1e-9) return;
    overlays.push({
      id: opts.id,
      kind: 'trendLine',
      label: '',
      zoneFaceBase: undefined,
      zoneFaceSignal: undefined,
      x1: 0.2,
      y1: 0.5,
      x2: 0.4,
      y2: 0.5,
      time1: a.time,
      time2: b.time,
      price1: a.price,
      price2: b.price,
      confidence: opts.dashed ? 72 : 90,
      color: opts.color,
      lineStrokeWidth: opts.width,
      lineDash: opts.dashed ? '8 5' : undefined,
      /** ChartPrime 토글/피벗스냅과 분리 — 경로선 전용 */
      category: 'mergedDeskWavePath',
      overlayZoneExtraClass: opts.dashed
        ? 'merged-desk-wave-path merged-desk-wave-path-dash merged-desk-wave-path-ghost merged-desk-wave-path-kink merged-desk-wave-path-keep'
        : 'merged-desk-wave-path merged-desk-wave-path-solid merged-desk-wave-path-keep',
      labelTooltip: opts.tip || params.summaryKo,
      noProject: true,
      structureBias: bull ? 'bullish' : 'bearish',
      lineLabelColor: '#f8fafc',
    });
  };

  /** ① 확정 실선 경로 0-1-2-… — 라벨 없이 선만 */
  for (let i = 0; i < params.confirmed.length - 1; i++) {
    const a = params.confirmed[i]!;
    const b = params.confirmed[i + 1]!;
    pushSeg(a, b, {
      id: `merged-desk-wave-path-solid-${i}`,
      dashed: false,
      color: solidColor,
      width: 3.1,
      tip: `${params.hit.template.labelKo} · 확정 ${a.label}→${b.label}`,
    });
  }

  /**
   * ② 다음 경로 — 마지막 구조 고/저에서 다음 저/고로 꺾임.
   * 마지막 캔들 종가는 꼭짓점이 아님.
   */
  const structEnd =
    params.confirmed.length > 0
      ? params.confirmed[params.confirmed.length - 1]!
      : null;
  const ghostNodes = [
    structEnd
      ? { time: structEnd.time, price: structEnd.price }
      : { time: params.liveAnchor.time, price: params.liveAnchor.price },
    ...params.projected.map((p) => ({ time: p.time, price: p.price })),
  ];
  for (let i = 0; i < ghostNodes.length - 1; i++) {
    pushSeg(ghostNodes[i]!, ghostNodes[i + 1]!, {
      id: `merged-desk-wave-path-ghost-${i}`,
      dashed: true,
      color: ghostColor,
      width: 2.8,
      tip: `${params.summaryKo}\n구조 고저 꺾임 · 확정 아님`,
    });
  }

  const close = Number(params.candles[params.candles.length - 1]?.close) || 0;
  const atr = atrApprox(params.candles);
  const step = barStepSec(params.candles);
  const hugAround = (t: number, padBars: number): { t1: number; t2: number } => {
    const candles = params.candles;
    const n = candles.length;
    const tLast = Number(candles[n - 1]?.time) || t;
    if (t > tLast) {
      const tMax = tLast + step * MERGED_DESK_RIGHT_FUTURE_BARS;
      const tMid = Math.min(Math.max(t, tLast + step), tMax);
      const half = step * Math.max(1, padBars);
      return {
        t1: Math.max(tLast + step * 0.35, tMid - half),
        t2: Math.min(tMax, tMid + half),
      };
    }
    let idx = 0;
    for (let i = 0; i < n; i++) {
      if (Number(candles[i]!.time) <= t) idx = i;
    }
    const i1 = Math.max(0, idx - padBars);
    const i2 = Math.min(n - 1, idx + padBars);
    return { t1: Number(candles[i1]!.time), t2: Number(candles[i2]!.time) };
  };
  const pushEieZone = (opts: {
    id: string;
    mid: number;
    t: number;
    entry: boolean;
    pad: number;
  }) => {
    if (!(opts.mid > 0) || !Number.isFinite(opts.mid)) return;
    const band = Math.max(atr * 0.28, Math.abs(opts.mid) * 0.0012);
    const hug = hugAround(opts.t, opts.pad);
    overlays.push({
      id: opts.id,
      kind: 'zone',
      label: '',
      zoneFaceBase: undefined,
      zoneFaceSignal: undefined,
      x1: 0.4,
      y1: 0.4,
      x2: 0.7,
      y2: 0.6,
      time1: hug.t1,
      time2: hug.t2,
      price1: opts.mid + band,
      price2: opts.mid - band,
      confidence: 76,
      color: oteFill,
      category: 'mergedDeskWavePath',
      overlayZoneExtraClass:
        'merged-desk-wave-path merged-desk-wave-path-ote merged-desk-wave-path-keep',
      labelTooltip: `${opts.entry ? 'ENTRY' : 'TARGET'} ZONE · 파동 구간 · 확정 아님`,
      noProject: true,
      zoneSpanOnly: true,
      zoneFillPreserve: true,
      structureBias: bull ? 'bullish' : 'bearish',
      lineLabelColor: oteBorder,
    });
  };
  const w2 = params.confirmed[2];
  const w3 = params.confirmed[3];
  if (w2) pushEieZone({ id: 'merged-desk-wave-path-entry-w2', mid: w2.price, t: w2.time, entry: true, pad: 2 });
  if (w3) pushEieZone({ id: 'merged-desk-wave-path-target-w3', mid: w3.price, t: w3.time, entry: false, pad: 2 });
  const nextPx = params.nextTarget;
  const nextPt = params.projected[0];
  if (nextPx != null && nextPx > 0 && nextPt) {
    const isEntry = (bull && nextPx < close) || (!bull && nextPx > close);
    pushEieZone({
      id: 'merged-desk-wave-path-ote-box',
      mid: nextPx,
      t: nextPt.time,
      entry: isEntry,
      pad: 2,
    });
  }

  if (params.nextTarget != null && params.nextTarget > 0) {
    priceLines.push({
      price: params.nextTarget,
      title: '다음',
      color: 'rgba(239,68,68,0.92)',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }

  if (params.altTarget != null && params.altTarget !== params.nextTarget) {
    priceLines.push({
      price: params.altTarget,
      title: '대안',
      color: 'rgba(148,163,184,0.7)',
      lineWidth: 1,
      lineStyle: 'dotted',
      axisLabel: true,
    });
  }

  if (params.invalidPrice != null) {
    priceLines.push({
      price: params.invalidPrice,
      title: '무효',
      color: 'rgba(211,47,47,0.95)',
      lineWidth: 1,
      lineStyle: 'dashed',
      axisLabel: true,
    });
  }

  return { overlays, priceLines };
}

/**
 * 실시간 파동 경로 팩.
 * 파랑빨강띠가 분석한 파동 구조(기울기·문닫힘·반등/저항)에 실선·점선을 맞춤.
 * 확정 경로·승률 아님.
 */
export function buildMergedDeskWavePathPack(params: {
  candles: Candle[];
  enabled?: boolean;
  timeframe?: string | null;
  elliottBiasHint?: WavePathBias | null;
  /** 파랑빨강띠 채널 하락 기울기 */
  descending?: boolean | null;
  tStart?: number | null;
  tEnd?: number | null;
  tipUpper?: number | null;
  tipLower?: number | null;
  targetHi?: number | null;
  targetLo?: number | null;
  expectBars?: number | null;
  elliottRead?: MergedDeskElliottRead | null;
  chipConsensus?: 'long' | 'short' | 'wait' | 'mixed' | null;
  /** 도식·칩 합류 — 눌림/저항/폭락 */
  bouncePx?: number | null;
  resistPx?: number | null;
  dumpPx?: number | null;
  schoolSummaryKo?: string | null;
  wyckoffRead?: MergedDeskWyckoffRead | null;
  fibLegs?: AvwapFibLeg[] | null;
  analysis?: AnalyzeResponse | null;
  hotZones?: MergedDeskHotZoneEntry[] | null;
  stanceSide?: 'LONG' | 'SHORT' | 'WAIT' | null;
  planLevels?: {
    entry?: number;
    stopLoss?: number;
    tp1?: number;
    tp2?: number;
    tp3?: number;
    invalidationPrice?: number;
  } | null;
  vrvpPoc?: number | null;
  vrvpVaLow?: number | null;
  vrvpVaHigh?: number | null;
  coreSupport?: number | null;
  coreResist?: number | null;
}): MergedDeskWavePathPack {
  if (params.enabled === false) return emptyPack('파동경로 OFF');
  const rawCandles = params.candles ?? [];
  if (rawCandles.length < 24) return emptyPack('봉 부족');
  const candles = wavePathCandleWindow(rawCandles, params.timeframe);
  if (candles.length < 24) return emptyPack('봉 부족');

  const tfMult = wavePathTfBarsMult(params.timeframe);
  const pivotsAll = collapseZigzagSameType(
    attachTailSwingExtreme(
      candles,
      ensureMajorSwingExtremes(
        candles,
        refineZigzagPivotsToLegExtremes(candles, detectZigzagPivots(candles, 2, 2))
      ),
      2
    )
  );
  if (pivotsAll.length < 3) return emptyPack('피벗 부족');

  const elliottRead = params.elliottRead ?? buildMergedDeskElliottPack(candles).read;
  const rbBias = voteWavePathBias({
    descending: params.descending,
    chipConsensus: params.chipConsensus,
    elliottBias: elliottRead?.bias === 'bullish' || elliottRead?.bias === 'bearish' ? elliottRead.bias : null,
    hintBias: params.elliottBiasHint,
    wyckoff: params.wyckoffRead,
    verdict: params.analysis?.verdict != null ? String(params.analysis.verdict) : null,
    stanceSide: params.stanceSide,
    pivots: pivotsAll,
  });
  const hintBias: WavePathBias | null = rbBias;
  const windowed = pivotsInChannelWindow(pivotsAll, params.tStart, params.tEnd);
  /** 채널 창이 1번 고점을 잘라내면 전체 정밀 피벗을 씀 */
  let pivots = windowed.length >= 3 ? windowed : pivotsAll;
  const fromExtreme = pivotsFromMajorExtreme(pivotsAll, hintBias);
  if (fromExtreme.length >= 3 && hintBias) pivots = fromExtreme;
  else if (fromExtreme.length >= 3) {
    const winMaxH = Math.max(0, ...pivots.filter((p) => p.isHigh).map((p) => p.price));
    const extMaxH = Math.max(0, ...fromExtreme.filter((p) => p.isHigh).map((p) => p.price));
    if (extMaxH > winMaxH * 1.002) pivots = fromExtreme;
    else if (fromExtreme.length >= pivots.length) pivots = fromExtreme;
  }
  pivots = keepExtremeAndRecent(pivots, 10);
  const marketLevels = collectWavePathMarketLevels({
    bouncePx: params.bouncePx,
    resistPx: params.resistPx,
    dumpPx: params.dumpPx,
    tipUpper: params.tipUpper,
    tipLower: params.tipLower,
    targetHi: params.targetHi,
    targetLo: params.targetLo,
    hotZones: params.hotZones,
    analysis: params.analysis,
    planLevels: params.planLevels,
    vrvpPoc: params.vrvpPoc,
    vrvpVaLow: params.vrvpVaLow,
    vrvpVaHigh: params.vrvpVaHigh,
    coreSupport: params.coreSupport,
    coreResist: params.coreResist,
    wyckoff: params.wyckoffRead,
  });

  let best: MatchHit | null = null;
  const extremeHit = hintBias ? hitFromRbPivots(pivots, hintBias, elliottRead) : null;
  if (extremeHit) {
    best = {
      ...extremeHit,
      score: 90,
      phaseKo: elliottRead?.headlineKo || '구조 고저·정밀스윙',
    };
  }
  const ewPts = pivotsFromElliottLevels(pivots, elliottRead);
  const ewAgrees = !hintBias || !elliottRead?.bias || elliottRead.bias === hintBias;
  const majorHigh = Math.max(0, ...pivots.filter((p) => p.isHigh).map((p) => p.price));
  const ewHasMajor =
    majorHigh <= 0 ||
    ewPts.some((p) => p.isHigh && p.price >= majorHigh * 0.992);
  if (ewAgrees && ewPts.length >= 3 && ewHasMajor) {
    const ewHit = hitFromRbPivots(ewPts, hintBias || (elliottRead?.bias === 'bearish' ? 'bearish' : 'bullish'), elliottRead);
    if (ewHit && (!best || ewHit.score + 8 >= best.score)) best = { ...ewHit, score: Math.max(ewHit.score, 82) };
  }
  if (!best || best.score < 32) {
  for (const t of MERGED_DESK_WAVE_PATH_CATALOG) {
      if (hintBias && t.bias !== hintBias) continue;
    const hit =
      t.kind === 'impulse' ? matchImpulse(pivots, t) : matchAbc(pivots, t);
    if (!hit) continue;
    let sc = hit.score;
      if (hintBias && hit.template.bias === hintBias) sc += 18;
      if (elliottRead?.phase === 'impulse' && t.kind === 'impulse') sc += 6;
      if (elliottRead?.phase === 'correction' && t.kind !== 'impulse') sc += 6;
    if (params.bouncePx != null || params.resistPx != null) sc += 4;
      if (params.descending != null) sc += 8;
    const ranked = { ...hit, score: sc };
    if (!best || ranked.score > best.score) best = ranked;
    }
  }
  if (!best || best.score < 32) {
    const spine = spineFromZigzag(pivots, hintBias);
    if (spine) best = { ...spine, score: spine.score + (hintBias ? 12 : 0) };
  }
  if (!best || best.score < 32) {
    const hasSchool =
      (params.bouncePx != null && Number(params.bouncePx) > 0) ||
      (params.resistPx != null && Number(params.resistPx) > 0) ||
      (params.dumpPx != null && Number(params.dumpPx) > 0) ||
      params.wyckoffRead != null ||
      (params.fibLegs != null && params.fibLegs.length > 0);
    if (!hasSchool) return emptyPack('매칭 약함 · 관망');
    /** 템플릿 약해도 한 방향 빨간 2단 꺾임만 (R/B/D 부채 금지) */
    const step = barStepSec(candles);
    const atr = atrApprox(candles);
    const tLive = Number(candles[candles.length - 1]!.time) || 0;
    const close = Number(candles[candles.length - 1]!.close) || 0;
    const liveAnchor: WavePathPoint = {
      time: tLive,
      price: close,
      label: 'NOW',
      confirmed: true,
    };
    const scaleBars = (bars: number) => Math.max(3, Math.round(bars * tfMult));
    const kinkBias: WavePathBias =
      hintBias ||
      (Number(params.dumpPx) > 0 && Number(params.dumpPx) < close
        ? 'bearish'
        : Number(params.resistPx) > close
          ? 'bullish'
          : 'bearish');
    const targets = buildTwoStageRedKink({
      pivots,
      bias: kinkBias,
      tLive,
      close,
      step,
      scaleBars,
      maxFuture: tLive + step * MERGED_DESK_RIGHT_FUTURE_BARS,
      atr,
      candles,
      dumpPx: params.dumpPx,
      bouncePx: params.bouncePx,
      resistPx: params.resistPx,
      tipUpper: params.tipUpper,
      tipLower: params.tipLower,
      targetHi: params.targetHi,
      targetLo: params.targetLo,
    expectBars: params.expectBars,
    wyckoff: params.wyckoffRead,
    fibLegs: params.fibLegs,
    marketLevels,
  });
    if (!targets.length) return emptyPack('매칭 약함 · 관망');
    const bull = kinkBias === 'bullish';
    const shortKo = `도식경로 · ${normalizeChartTimeframe(String(params.timeframe || '')) || 'TF'}`;
    const summaryKo = [
      shortKo,
      params.schoolSummaryKo ? `도식 ${params.schoolSummaryKo}` : '',
      '굴곡경로·마지막봉출발·조건부전망',
    ]
      .filter(Boolean)
      .join(' · ');
    const fakeTpl =
      MERGED_DESK_WAVE_PATH_CATALOG.find((t) => t.bias === (bull ? 'bullish' : 'bearish')) ||
      MERGED_DESK_WAVE_PATH_CATALOG[0]!;
    const lastPv = pivots[pivots.length - 1]!;
    const structPt: WavePathPoint = {
      time: lastPv.time,
      price: lastPv.price,
      label: lastPv.isHigh ? 'H' : 'L',
      confirmed: true,
    };
    const fakeHit: MatchHit = {
      template: fakeTpl,
      pivots: keepExtremeAndRecent(pivots, 8),
      completedLegs: 0,
      score: 36,
      phaseKo: '도식·피보 합류경로',
      waveLabel: '도식',
    };
    const { overlays, priceLines } = buildOverlaysAndLines({
      candles,
      hit: fakeHit,
      confirmed: [structPt],
      projected: targets.slice(0, WAVE_PATH_MAX_NEXT_LEGS),
      nextTarget: targets[0]?.price ?? null,
      altTarget: targets[1]?.price ?? null,
      invalidPrice: bull ? close - atr * 1.2 : close + atr * 1.2,
      pressLevels: targets.filter((t) => t.price < close).map((t) => t.price).slice(0, 3),
      resistLevels: targets.filter((t) => t.price >= close).map((t) => t.price).slice(0, 3),
      targetHi: Math.max(...targets.map((t) => t.price)),
      targetLo: Math.min(...targets.map((t) => t.price)),
      summaryKo,
      shortKo,
      expectBars: Math.min(MERGED_DESK_RIGHT_FUTURE_BARS, scaleBars(10)),
      liveAnchor,
    });
    return {
      ok: true,
      templateId: 'schematic-fallback',
      kind: fakeHit.template.kind,
      bias: fakeHit.template.bias,
      phaseKo: fakeHit.phaseKo,
      waveLabel: fakeHit.waveLabel,
      score: 36,
      pathPoints: [structPt, ...targets.slice(0, 2)],
      nextTarget: targets[0]?.price ?? null,
      altTarget: targets[1]?.price ?? null,
      pressLevels: targets.filter((t) => t.price < close).map((t) => t.price).slice(0, 3),
      resistLevels: targets.filter((t) => t.price >= close).map((t) => t.price).slice(0, 3),
      targetHi: Math.max(...targets.map((t) => t.price)),
      targetLo: Math.min(...targets.map((t) => t.price)),
      invalidPrice: bull ? close - atr * 1.2 : close + atr * 1.2,
      expectBars: Math.min(MERGED_DESK_RIGHT_FUTURE_BARS, scaleBars(10)),
      summaryKo,
      shortKo,
      overlays,
      priceLines,
    };
  }

  best = {
    ...best,
    pivots: stitchRecentPivots(best.pivots, pivotsAll),
  };

  const step = barStepSec(candles);
  const atr = atrApprox(candles);
  const tLive = Number(candles[candles.length - 1]!.time) || 0;
  const close = Number(candles[candles.length - 1]!.close) || 0;
  const liveAnchor: WavePathPoint = {
    time: tLive,
    price: close,
    label: 'NOW',
    confirmed: true,
  };

  const confirmed: WavePathPoint[] = best.pivots.map((p, i) => {
    /** EIE형 숫자/문자 라벨 (소프트마크 ~는 비율 이탈 시) */
    const labelsImpulse = ['0', '1', '2', '3', '4', '5'];
    const labelsAbc = ['0', 'A', 'B', 'C'];
    const labels = best!.template.kind === 'impulse' ? labelsImpulse : labelsAbc;
    let lab = labels[i] || `${i}`;
    if (best!.template.kind === 'impulse' && i === 2 && best!.pivots.length >= 3) {
      const w1 = Math.abs(best!.pivots[1]!.price - best!.pivots[0]!.price);
      const w2 = Math.abs(best!.pivots[2]!.price - best!.pivots[1]!.price);
      const r = w1 > 0 ? w2 / w1 : 0;
      const hint = best!.template.matchHints?.w2OfW1;
      if (hint && (r < hint[0] || r > hint[1])) lab = '2-';
    }
    if (best!.template.kind === 'impulse' && i === 4 && best!.pivots.length >= 5) {
      const w3 = Math.abs(best!.pivots[3]!.price - best!.pivots[2]!.price);
      const w4 = Math.abs(best!.pivots[4]!.price - best!.pivots[3]!.price);
      const r = w3 > 0 ? w4 / w3 : 0;
      const hint = best!.template.matchHints?.w4OfW3;
      if (hint && (r < hint[0] || r > hint[1])) lab = '4-';
    }
    return {
      time: p.time,
      price: p.price,
      label: lab,
      confirmed: true,
    };
  });

  const scaleBars = (bars: number) => Math.max(3, Math.round(bars * tfMult));
  const maxFuture = tLive + step * MERGED_DESK_RIGHT_FUTURE_BARS;
  const pathBias: WavePathBias = hintBias || best.template.bias;
  const kinkArgs = {
    candles,
    dumpPx: params.dumpPx,
    bouncePx: params.bouncePx,
    resistPx: params.resistPx,
    tipUpper: params.tipUpper,
    tipLower: params.tipLower,
    targetHi: params.targetHi,
    targetLo: params.targetLo,
    expectBars: params.expectBars,
    wyckoff: params.wyckoffRead,
    fibLegs: params.fibLegs,
    marketLevels,
  };

  /** 다음 이동: 캔들 스윙·피보·와이코프·존·플랜 합류 · 빨간 2단 꺾임 */
  const kinkPivots = best.pivots.length >= 2 ? best.pivots : pivots;
  let projected = buildTwoStageRedKink({
    pivots: kinkPivots,
    bias: pathBias,
    tLive,
    close,
    step,
    scaleBars,
    maxFuture,
    atr,
    ...kinkArgs,
  }).slice(0, WAVE_PATH_MAX_NEXT_LEGS);

  let expectBars = projected.length
    ? Math.round((projected[projected.length - 1]!.time - tLive) / Math.max(step, 1))
    : 0;

  if (!projected.length) {
    projected = buildTwoStageRedKink({
      pivots: kinkPivots.length ? kinkPivots : best.pivots,
      bias: pathBias,
      tLive,
      close,
      step,
      scaleBars,
      maxFuture,
      atr,
      ...kinkArgs,
    }).slice(0, WAVE_PATH_MAX_NEXT_LEGS);
    expectBars = projected.length
      ? Math.round((projected[projected.length - 1]!.time - tLive) / Math.max(step, 1))
      : scaleBars(16);
  }
  expectBars = Math.min(
    MERGED_DESK_RIGHT_FUTURE_BARS,
    Math.max(expectBars, projected.length * 4)
  );

  const nextTarget = projected[0]?.price ?? null;
  const altTarget = projected[1]?.price ?? null;
  const bull = pathBias === 'bullish';

  const pressLevels: number[] = [];
  const resistLevels: number[] = [];
  for (const p of best.pivots) {
    if (p.price < close) pressLevels.push(p.price);
    else resistLevels.push(p.price);
  }
  if (params.bouncePx != null && Number(params.bouncePx) > 0) {
    pressLevels.push(Number(params.bouncePx));
  }
  if (params.resistPx != null && Number(params.resistPx) > 0) {
    resistLevels.push(Number(params.resistPx));
  }
  if (params.dumpPx != null && Number(params.dumpPx) > 0) {
    pressLevels.push(Number(params.dumpPx));
  }
  if (nextTarget != null) {
    if (nextTarget >= close) resistLevels.push(nextTarget);
    else pressLevels.push(nextTarget);
  }

  const targetHi =
    nextTarget != null && altTarget != null
      ? Math.max(nextTarget, altTarget)
      : nextTarget != null && nextTarget >= close
        ? nextTarget
        : resistLevels[0] ?? null;
  const targetLo =
    nextTarget != null && altTarget != null
      ? Math.min(nextTarget, altTarget)
      : nextTarget != null && nextTarget < close
        ? nextTarget
        : pressLevels[0] ?? null;

  const structInv = trailingInvalidPrice(best, atr);
  const planInv = Number(params.planLevels?.invalidationPrice);
  const swingInv = bull
    ? Math.min(
        ...best.pivots.filter((p) => !p.isHigh).map((p) => p.price),
        Number.POSITIVE_INFINITY
      )
    : Math.max(
        ...best.pivots.filter((p) => p.isHigh).map((p) => p.price),
        0
      );
  const invalidPrice =
    (Number.isFinite(planInv) && planInv > 0 ? planInv : null) ??
    structInv ??
    (Number.isFinite(swingInv) && swingInv > 0 && swingInv < Infinity ? swingInv : null) ??
    (bull ? close - atr * 1.2 : close + atr * 1.2);

  const tfKo = normalizeChartTimeframe(String(params.timeframe || ''));
  const shortKo = `${best.template.labelKo} · ${best.waveLabel}${tfKo ? ` · ${tfKo}` : ''}`;
  const summaryKo = [
    shortKo,
    best.phaseKo,
    params.schoolSummaryKo ? `도식 ${params.schoolSummaryKo}` : '',
    nextTarget != null ? `다음 ${projected[0]?.label || ''} ${Math.round(nextTarget)}` : '',
    targetHi != null ? `상방 ${Math.round(targetHi)}` : '',
    targetLo != null ? `하방 ${Math.round(targetLo)}` : '',
    `≈${expectBars}봉`,
    '띠파동·캔들스윙·존·플랜·시중경로·피보·와이코프·조건부전망',
  ]
    .filter(Boolean)
    .join(' · ');

  const hitDraw: MatchHit =
    best.template.bias === pathBias
      ? best
      : { ...best, template: { ...best.template, bias: pathBias } };

  const { overlays, priceLines } = buildOverlaysAndLines({
    candles,
    hit: hitDraw,
    confirmed,
    projected,
    nextTarget,
    altTarget,
    invalidPrice,
    pressLevels: pressLevels.sort((a, b) => b - a).slice(0, 3),
    resistLevels: resistLevels.sort((a, b) => a - b).slice(0, 3),
    targetHi,
    targetLo,
    summaryKo,
    shortKo,
    expectBars,
    liveAnchor,
  });

  return {
    ok: true,
    templateId: best.template.id,
    kind: best.template.kind,
    bias: pathBias,
    phaseKo: best.phaseKo,
    waveLabel: best.waveLabel,
    score: Math.round(best.score),
    pathPoints: [...confirmed.filter((p) => p.label !== 'NOW' && p.time > 0), ...projected],
    nextTarget,
    altTarget,
    pressLevels: pressLevels.slice(0, 3),
    resistLevels: resistLevels.slice(0, 3),
    targetHi,
    targetLo,
    invalidPrice,
    expectBars,
    summaryKo,
    shortKo,
    overlays,
    priceLines,
  };
}
