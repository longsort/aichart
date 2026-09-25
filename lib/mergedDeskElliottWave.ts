/**
 * 통합·분석 — 엘리엇 충격 1–5 + 조정 ABC 근사.
 * 규칙: W2<100% W1 · W4는 W1 가격대 미진입 · W3은 1·3·5 중 최단 불가.
 * 피보 확장·W4 황금비는 관측. 확정 카운트·승률 아님.
 */
import type { Candle, OverlayItem } from '@/types';
import { detectZigzagPivots, type ZigzagPivot } from '@/lib/candleAnalysisElliottMvp';
import { buildWyckoffBlinkOverlays } from '@/lib/mergedDeskWyckoffSchematic';

export type ElliottWaveLabel = '1' | '2' | '3' | '4' | '5' | 'A' | 'B' | 'C';
export type ElliottExtension = 'w1' | 'w3' | 'w5' | 'none';
export type ElliottSchematicId = 'fig-8-1' | 'fig-8-2' | 'fig-8-3' | 'fig-8-4' | 'fig-8-5';

export type ElliottSwingLevels = {
  p0: number;
  p1: number;
  p2: number;
  p3?: number;
  p4?: number;
  p5?: number;
  a?: number;
  b?: number;
  c?: number;
};

export type MergedDeskElliottRead = {
  bias: 'bullish' | 'bearish';
  phase: 'impulse' | 'correction';
  wave: ElliottWaveLabel;
  waveEn: string;
  headlineKo: string;
  detailKo: string;
  explainKo: string[];
  rules: { r1: boolean; r2: boolean; r3: boolean };
  extension: ElliottExtension;
  schematicId: ElliottSchematicId;
  hotspotKey: string;
  confidence: number;
  eventTime: number;
  eventPrice: number;
  eventLow: boolean;
  levels?: ElliottSwingLevels;
};

export type MergedDeskElliottPack = {
  read: MergedDeskElliottRead | null;
  overlays: OverlayItem[];
};

type ImpulsePts = {
  bias: 'bullish' | 'bearish';
  pts: [ZigzagPivot, ZigzagPivot, ZigzagPivot, ZigzagPivot, ZigzagPivot, ZigzagPivot];
};

function len(a: ZigzagPivot, b: ZigzagPivot): number {
  return Math.abs(b.price - a.price);
}

function scoreImpulse(pts: ImpulsePts['pts'], bias: 'bullish' | 'bearish'): {
  ok: boolean;
  r1: boolean;
  r2: boolean;
  r3: boolean;
  w: number[];
} | null {
  const [p0, p1, p2, p3, p4, p5] = pts;
  const alt =
    !p0.isHigh && p1.isHigh && !p2.isHigh && p3.isHigh && !p4.isHigh && p5.isHigh
      ? 'bullish'
      : p0.isHigh && !p1.isHigh && p2.isHigh && !p3.isHigh && p4.isHigh && !p5.isHigh
        ? 'bearish'
        : null;
  if (alt !== bias) return null;
  const w1 = len(p0, p1);
  const w3 = len(p2, p3);
  const w5 = len(p4, p5);
  if (!(w1 > 0) || !(w3 > 0) || !(w5 > 0)) return null;
  const r1 = bias === 'bullish' ? p2.price > p0.price : p2.price < p0.price;
  const r2 = bias === 'bullish' ? p4.price > p1.price : p4.price < p1.price;
  const r3 = w3 + 1e-12 >= Math.min(w1, w5);
  return { ok: r1 && r2 && r3, r1, r2, r3, w: [w1, len(p1, p2), w3, len(p3, p4), w5] };
}

function pickExtension(w: number[], p0: ZigzagPivot, p3: ZigzagPivot): ElliottExtension {
  const w1 = w[0]!;
  const w3 = w[2]!;
  const w5 = w[4]!;
  const to3 = Math.abs(p3.price - p0.price);
  if (w3 >= w1 * 1.5 && w3 >= w5 * 1.15) return 'w3';
  if (w5 >= to3 * 1.35 && w5 >= w3 * 1.1) return 'w5';
  if (w1 >= w3 * 1.35 && w1 >= w5 * 1.2) return 'w1';
  if (w3 >= w1 && w3 >= w5) return 'w3';
  return 'none';
}

function findBestImpulse(pivots: ZigzagPivot[]): ImpulsePts | null {
  if (pivots.length < 6) return null;
  let best: { hit: ImpulsePts; score: number } | null = null;
  for (let i = 0; i <= pivots.length - 6; i++) {
    const pts = pivots.slice(i, i + 6) as ImpulsePts['pts'];
    for (const bias of ['bullish', 'bearish'] as const) {
      const sc = scoreImpulse(pts, bias);
      if (!sc?.ok) continue;
      const recency = i / Math.max(1, pivots.length - 6);
      const score = (sc.w[2]! / Math.max(sc.w[0]!, sc.w[4]!, 1e-9)) * 10 + recency * 4;
      if (!best || score > best.score) best = { hit: { bias, pts }, score };
    }
  }
  return best?.hit ?? null;
}

type PartialImpulse = {
  bias: 'bullish' | 'bearish';
  pts: ZigzagPivot[];
  r1: boolean;
  r2: boolean;
  r3: boolean;
  w: number[];
};

function scorePartial(pts: ZigzagPivot[], bias: 'bullish' | 'bearish'): PartialImpulse | null {
  if (pts.length < 3) return null;
  const highStart = bias === 'bullish' ? false : true;
  for (let i = 0; i < pts.length; i++) {
    const expectHigh = i % 2 === 1 ? !highStart : highStart;
    if (pts[i]!.isHigh !== expectHigh) return null;
  }
  const p0 = pts[0]!;
  const p1 = pts[1]!;
  const p2 = pts[2]!;
  const r1 = bias === 'bullish' ? p2.price > p0.price : p2.price < p0.price;
  if (!r1) return null;
  const w1 = len(p0, p1);
  const w2 = len(p1, p2);
  const w: number[] = [w1, w2];
  let r2 = true;
  let r3 = true;
  if (pts.length >= 4) {
    const p3 = pts[3]!;
    w.push(len(p2, p3));
    r3 = w[2]! + 1e-12 >= w1 * 0.85;
  }
  if (pts.length >= 5) {
    const p4 = pts[4]!;
    w.push(len(pts[3]!, p4));
    r2 = bias === 'bullish' ? p4.price > p1.price : p4.price < p1.price;
    if (!r2) return null;
  }
  if (pts.length >= 6) {
    w.push(len(pts[4]!, pts[5]!));
    r3 = w[2]! + 1e-12 >= Math.min(w1, w[4]!);
    if (!r3) return null;
  }
  return { bias, pts, r1, r2, r3, w };
}

function findBestPartial(pivots: ZigzagPivot[]): PartialImpulse | null {
  if (pivots.length < 3) return null;
  const window = pivots.slice(-14);
  let best: { hit: PartialImpulse; score: number } | null = null;
  for (let n = Math.min(6, window.length); n >= 3; n--) {
    for (let i = 0; i <= window.length - n; i++) {
      const pts = window.slice(i, i + n);
      for (const bias of ['bullish', 'bearish'] as const) {
        const hit = scorePartial(pts, bias);
        if (!hit) continue;
        const endsAtLast = i + n === window.length;
        const score = n * 6 + (endsAtLast ? 10 : 0) + (hit.w[2] ? hit.w[2] / Math.max(hit.w[0]!, 1e-9) : 0);
        if (!best || score > best.score) best = { hit, score };
      }
    }
  }
  return best?.hit ?? null;
}

function pickSchematic(args: {
  phase: 'impulse' | 'correction';
  wave: ElliottWaveLabel;
  ext: ElliottExtension;
  nested: boolean;
}): ElliottSchematicId {
  if (args.phase === 'correction') return 'fig-8-1';
  if (args.wave === '2') return 'fig-8-5';
  if (args.wave === '4') return 'fig-8-5';
  if (args.wave === '5' || args.wave === '1') {
    if (args.ext === 'w5') return 'fig-8-4';
    if (args.ext !== 'none') return 'fig-8-3';
  }
  if (args.ext !== 'none') return 'fig-8-3';
  if (args.nested) return 'fig-8-2';
  return 'fig-8-1';
}

function developingWave(
  candles: Candle[],
  last: ZigzagPivot,
  nextIsHigh: boolean
): { price: number; time: number; low: boolean } {
  const c = candles[candles.length - 1]!;
  return {
    price: nextIsHigh ? c.high : c.low,
    time: Number(c.time),
    low: !nextIsHigh,
  };
}

function fibNote(label: string, ratio: number, lo: number, hi: number): string {
  const pct = (ratio * 100).toFixed(0);
  const ok = ratio >= lo && ratio <= hi;
  return `${label}≈${pct}% (${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}% 구간 ${ok ? '근접' : '벗어남'})`;
}

export function detectMergedDeskElliott(candles: Candle[]): MergedDeskElliottRead | null {
  if (candles.length < 30) return null;
  const pivots = detectZigzagPivots(candles, 4, 4);
  if (pivots.length < 4) return null;
  const close = candles[candles.length - 1]!;
  const impulse = findBestImpulse(pivots.slice(-14));
  const partial = !impulse ? findBestPartial(pivots) : null;
  const lastP = pivots[pivots.length - 1]!;

  if (impulse) {
    const [p0, p1, p2, p3, p4, p5] = impulse.pts;
    const sc = scoreImpulse(impulse.pts, impulse.bias)!;
    const ext = pickExtension(sc.w, p0, p3);
    const after = pivots.filter((p) => p.idx > p5.idx);
    const bull = impulse.bias === 'bullish';

    let wave: ElliottWaveLabel = '5';
    let phase: 'impulse' | 'correction' = 'impulse';
    let eventTime = p5.time;
    let eventPrice = p5.price;
    let eventLow = !p5.isHigh;

    if (after.length === 0) {
      const moved = bull ? close.close < p5.price * 0.998 : close.close > p5.price * 1.002;
      if (moved) {
        phase = 'correction';
        wave = 'A';
        const d = developingWave(candles, p5, !bull);
        eventTime = d.time;
        eventPrice = d.price;
        eventLow = d.low;
      } else {
        wave = '5';
      }
    } else if (after.length === 1) {
      phase = 'correction';
      wave = 'A';
      eventTime = after[0]!.time;
      eventPrice = after[0]!.price;
      eventLow = !after[0]!.isHigh;
      const d = developingWave(candles, after[0]!, after[0]!.isHigh);
      if (Math.abs(close.close - after[0]!.price) > Math.abs(close.close - p5.price) * 0.15) {
        wave = 'B';
        eventTime = d.time;
        eventPrice = d.price;
        eventLow = d.low;
      }
    } else if (after.length >= 2) {
      phase = 'correction';
      wave = after.length >= 3 ? 'C' : 'B';
      const p = after[Math.min(after.length, 3) - 1]!;
      eventTime = p.time;
      eventPrice = p.price;
      eventLow = !p.isHigh;
    }

    const total = Math.abs(p5.price - p0.price);
    const to4 = Math.abs(p4.price - p0.price);
    const w4Ratio = total > 0 ? to4 / total : 0;
    const w2r = sc.w[0]! > 0 ? sc.w[1]! / sc.w[0]! : 0;
    const w4r3 = sc.w[2]! > 0 ? sc.w[3]! / sc.w[2]! : 0;
    const schematicId = pickSchematic({
      phase,
      wave,
      ext,
      nested: pivots.length >= 12,
    });
    const hotspotKey = wave;
    const waveEn = phase === 'impulse' ? `Wave ${wave}` : `Wave ${wave} (corrective)`;
    const dirKo = bull ? '상승' : '하락';
    const extKo = ext === 'w3' ? '3파확장' : ext === 'w5' ? '5파확장' : ext === 'w1' ? '1파확장' : '비확장';
    const explainKo = [
      `도식 비교: 지금 자리 ≈ ${waveEn}. 차트·도식 원이 같은 자리(근사).`,
      `충격 규칙1 W2<100% W1: ${sc.r1 ? '충족' : '위반 가능'}`,
      `규칙2 W4는 W1 가격대 미진입: ${sc.r2 ? '충족' : '위반 가능'}`,
      `규칙3 W3은 1·3·5 중 최단 아님: ${sc.r3 ? '충족' : '위반 가능'}`,
      `확장 관측: ${extKo}. W4/전체≈${(w4Ratio * 100).toFixed(0)}% (비확장 ~62%, 5파확장 ~38% 경향).`,
      fibNote('W2/W1', w2r, 0.382, 0.618),
      fibNote('W4/W3', w4r3, 0.236, 0.382),
      '2·4는 단순/복합·깊/얕이 교대하는 경향. 카운트는 추정 · 확정 아님.',
    ];
    const levels: ElliottSwingLevels = {
      p0: p0.price,
      p1: p1.price,
      p2: p2.price,
      p3: p3.price,
      p4: p4.price,
      p5: p5.price,
    };
    if (after.length >= 1) levels.a = after[0]!.price;
    if (after.length >= 2) levels.b = after[1]!.price;
    if (after.length >= 3) levels.c = after[2]!.price;
    else if (phase === 'correction' && wave === 'C') levels.c = eventPrice;

    return {
      bias: impulse.bias,
      phase,
      wave,
      waveEn,
      headlineKo: `엘리엇 ${dirKo} ${phase === 'impulse' ? '충격' : '조정'} · ${waveEn}`,
      detailKo: `${waveEn} 근사 · ${extKo}. 규칙 ${[sc.r1, sc.r2, sc.r3].filter(Boolean).length}/3. 확정 아님.`,
      explainKo,
      rules: { r1: sc.r1, r2: sc.r2, r3: sc.r3 },
      extension: ext,
      schematicId,
      hotspotKey,
      confidence: Math.min(82, 52 + (sc.r1 && sc.r2 && sc.r3 ? 18 : 6) + (ext === 'w3' ? 4 : 0)),
      eventTime,
      eventPrice,
      eventLow,
      levels,
    };
  }

  if (partial && partial.pts.length >= 3) {
    const n = partial.pts.length;
    const bull = partial.bias === 'bullish';
    const last = partial.pts[n - 1]!;
    const wave: ElliottWaveLabel = n === 3 ? '3' : n === 4 ? '4' : n === 5 ? '5' : '5';
    const d = developingWave(candles, last, n % 2 === 1 ? bull : !bull);
    const ext =
      partial.w.length >= 5
        ? pickExtension(partial.w, partial.pts[0]!, partial.pts[3]!)
        : partial.w.length >= 3 && partial.w[2]! >= (partial.w[0] ?? 0) * 1.5
          ? 'w3'
          : 'none';
    const schematicId = pickSchematic({
      phase: 'impulse',
      wave,
      ext,
      nested: pivots.length >= 12,
    });
    const w2r = partial.w[0]! > 0 ? (partial.w[1] ?? 0) / partial.w[0]! : 0;
    const waveEn = `Wave ${wave} (forming)`;
    const dirKo = bull ? '상승' : '하락';
    const extKo = ext === 'w3' ? '3파확장' : ext === 'w5' ? '5파확장' : ext === 'w1' ? '1파확장' : '비확장';
    const lv = partial.pts;
    return {
      bias: partial.bias,
      phase: 'impulse',
      wave,
      waveEn,
      headlineKo: `엘리엇 ${dirKo} 충격 · ${waveEn}`,
      detailKo: `${waveEn} 근사 · ${extKo}. 미완성 카운트. 확정 아님.`,
      explainKo: [
        `도식 비교: 지금 자리 ≈ ${waveEn}. 피벗 ${n}개 · 5파 미완.`,
        `규칙1 W2<100% W1: ${partial.r1 ? '충족' : '위반 가능'}`,
        `규칙2 W4 미진입: ${n >= 5 ? (partial.r2 ? '충족' : '위반 가능') : 'W4 전 · 대기'}`,
        `규칙3 W3 최단 아님: ${n >= 4 ? (partial.r3 ? '잠정 충족' : '위반 가능') : 'W3 진행'}`,
        fibNote('W2/W1', w2r, 0.382, 0.618),
        '카운트는 추정 · 확정 아님.',
      ],
      rules: { r1: partial.r1, r2: partial.r2, r3: partial.r3 },
      extension: ext,
      schematicId,
      hotspotKey: wave,
      confidence: Math.min(74, 46 + n * 4),
      eventTime: d.time,
      eventPrice: d.price,
      eventLow: d.low,
      levels: {
        p0: lv[0]!.price,
        p1: lv[1]!.price,
        p2: lv[2]!.price,
        p3: lv[3]?.price,
        p4: lv[4]?.price,
        p5: lv[5]?.price,
      },
    };
  }

  const seq = pivots.slice(-4);
  if (seq.length >= 3 && seq[0]!.isHigh !== seq[1]!.isHigh && seq[1]!.isHigh !== seq[2]!.isHigh) {
    const a = seq[seq.length - 3]!;
    const b = seq[seq.length - 2]!;
    const c = seq[seq.length - 1]!;
    const wave: ElliottWaveLabel = seq.length >= 4 ? 'C' : 'B';
    const p = wave === 'C' ? c : b;
    return {
      bias: a.isHigh ? 'bearish' : 'bullish',
      phase: 'correction',
      wave,
      waveEn: `Wave ${wave} (corrective)`,
      headlineKo: `엘리엇 조정 ABC · Wave ${wave}`,
      detailKo: '3스윙 조정 근사. 충격 5파 미확정. 확정 아님.',
      explainKo: [
        '조정파동은 보통 3파(ABC). 진폭은 직전 충격의 38.2% 또는 61.8%인 경우가 많음.',
        '지금은 충격 5파 규칙 세트를 아직 충족하지 못해 ABC 후보로만 표시.',
        '확정 카운트 아님.',
      ],
      rules: { r1: false, r2: false, r3: false },
      extension: 'none',
      schematicId: 'fig-8-1',
      hotspotKey: wave,
      confidence: 48,
      eventTime: p.time,
      eventPrice: p.price,
      eventLow: !p.isHigh,
      levels: {
        p0: a.price,
        p1: b.price,
        p2: c.price,
        a: a.price,
        b: b.price,
        c: wave === 'C' ? c.price : undefined,
      },
    };
  }

  const d = developingWave(candles, lastP, !lastP.isHigh);
  return {
    bias: lastP.isHigh ? 'bearish' : 'bullish',
    phase: 'impulse',
    wave: '1',
    waveEn: 'Wave 1 (forming)',
    headlineKo: '엘리엇 충격 Wave 1 형성 후보',
    detailKo: '스윙 부족 · 1파 시작 근사. 확정 아님.',
    explainKo: [
      '충격파는 5, 조정은 3. 지금은 규칙 검증용 피벗이 부족.',
      '확정 아님.',
    ],
    rules: { r1: false, r2: false, r3: false },
    extension: 'none',
    schematicId: 'fig-8-1',
    hotspotKey: '1',
    confidence: 42,
    eventTime: d.time,
    eventPrice: d.price,
    eventLow: d.low,
  };
}

export function buildMergedDeskElliottPack(candles: Candle[]): MergedDeskElliottPack {
  const read = detectMergedDeskElliott(candles);
  if (!read) return { read: null, overlays: [] };
  const lastT = Number(candles[candles.length - 1]!.time);
  const hi = Math.max(...candles.slice(-8).map((c) => c.high));
  const lo = Math.min(...candles.slice(-8).map((c) => c.low));
  const overlays = buildWyckoffBlinkOverlays([
    {
      id: 'merged-desk-elliott-blink-low',
      side: 'low',
      time: read.eventLow ? read.eventTime : lastT,
      price: read.eventLow ? read.eventPrice : lo,
      label: read.eventLow ? read.waveEn : '하방',
      primary: read.eventLow,
    },
    {
      id: 'merged-desk-elliott-blink-high',
      side: 'high',
      time: read.eventLow ? lastT : read.eventTime,
      price: read.eventLow ? hi : read.eventPrice,
      label: read.eventLow ? '상방' : read.waveEn,
      primary: !read.eventLow,
    },
  ]);
  return { read, overlays };
}
