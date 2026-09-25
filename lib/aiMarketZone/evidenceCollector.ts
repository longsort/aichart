/**
 * Zone Evidence 탐지 — 기존 엔진을 읽기 전용으로 재사용 (수정 없음).
 * 형성봉으로 구조 확정 금지 → endExclusive = n-1.
 */
import type { Candle } from '@/types';
import { detectSmcStructureOrderBlocks } from '@/lib/smcStructureOrderBlocks';
import { detectFvgCausal } from '@/lib/eagle1/causalFvg';
import { detectBPR } from '@/lib/bpr';
import { atrAt, detectStructureCausal, type Eagle1Bar } from '@/lib/eagle1/structureEngine';
import type { AmzEvidence, AmzEvidenceGroup, AmzEvidenceKind } from './types';

function toEagleBars(candles: Candle[]): Eagle1Bar[] {
  return candles.map((c) => ({
    time: Number(c.time),
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: Math.max(0, Number(c.volume) || 0),
  }));
}

function groupOf(kind: AmzEvidenceKind): AmzEvidenceGroup {
  if (kind === 'bullish_ob' || kind === 'bearish_ob') return 'OB';
  if (kind === 'fvg' || kind === 'bpr') return 'STRUCTURE';
  if (kind === 'poc' || kind === 'hvn' || kind === 'lvn' || kind === 'vah' || kind === 'val') return 'PROFILE';
  if (kind === 'eqh' || kind === 'eql' || kind === 'liquidity_pool') return 'LIQUIDITY';
  if (kind === 'swing_high' || kind === 'swing_low' || kind === 'pdh' || kind === 'pdl') return 'STRUCTURE';
  if (kind === 'avwap') return 'VOLUME';
  return 'HISTORY';
}

function pushEv(
  out: AmzEvidence[],
  kind: AmzEvidenceKind,
  lower: number,
  upper: number,
  bar: number,
  tf: string,
  strength: number,
  labelKo: string
) {
  if (!(lower < upper) || !Number.isFinite(lower) || !Number.isFinite(upper)) return;
  out.push({
    id: `${kind}-${bar}-${Math.round(lower)}-${Math.round(upper)}`,
    kind,
    group: groupOf(kind),
    lower,
    upper,
    mid: (lower + upper) / 2,
    timeframe: tf,
    createdAtBar: bar,
    strength: Math.max(0, Math.min(100, strength)),
    labelKo,
  });
}

/** Volume profile slice on closed bars only */
function profileEvidence(rows: Candle[], endExclusive: number, tf: string, atr: number): AmzEvidence[] {
  const out: AmzEvidence[] = [];
  const from = Math.max(0, endExclusive - 96);
  const slice = rows.slice(from, endExclusive);
  if (slice.length < 24 || !(atr > 0)) return out;

  let lo = Infinity;
  let hi = -Infinity;
  for (const c of slice) {
    lo = Math.min(lo, Number(c.low));
    hi = Math.max(hi, Number(c.high));
  }
  if (!(hi > lo)) return out;
  const bins = 24;
  const step = (hi - lo) / bins;
  const vol = new Array(bins).fill(0) as number[];
  for (const c of slice) {
    const mid = (Number(c.high) + Number(c.low)) / 2;
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((mid - lo) / step)));
    vol[idx]! += Math.max(0, Number(c.volume) || 0);
  }
  let pocI = 0;
  let maxV = -1;
  const total = vol.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < bins; i++) {
    if (vol[i]! > maxV) {
      maxV = vol[i]!;
      pocI = i;
    }
  }
  const pocLo = lo + pocI * step;
  const pocHi = pocLo + step;
  pushEv(out, 'poc', pocLo, pocHi, endExclusive - 1, tf, 70, 'POC');

  const mean = total / bins;
  for (let i = 0; i < bins; i++) {
    const a = lo + i * step;
    const b = a + step;
    if (vol[i]! >= mean * 1.65) pushEv(out, 'hvn', a, b, endExclusive - 1, tf, 62, 'HVN');
    else if (vol[i]! > 0 && vol[i]! <= mean * 0.35) pushEv(out, 'lvn', a, b, endExclusive - 1, tf, 48, 'LVN');
  }

  /** Value area ~70% around POC */
  let acc = vol[pocI]!;
  let L = pocI;
  let R = pocI;
  const target = total * 0.7;
  while (acc < target && (L > 0 || R < bins - 1)) {
    const left = L > 0 ? vol[L - 1]! : -1;
    const right = R < bins - 1 ? vol[R + 1]! : -1;
    if (right >= left && R < bins - 1) {
      R += 1;
      acc += vol[R]!;
    } else if (L > 0) {
      L -= 1;
      acc += vol[L]!;
    } else break;
  }
  pushEv(out, 'val', lo + L * step, lo + L * step + step, endExclusive - 1, tf, 55, 'VAL');
  pushEv(out, 'vah', lo + R * step, lo + R * step + step, endExclusive - 1, tf, 55, 'VAH');
  return out;
}

function swingEvidence(rows: Candle[], endExclusive: number, tf: string, atr: number): AmzEvidence[] {
  const out: AmzEvidence[] = [];
  const wing = 3;
  for (let i = wing; i < endExclusive - wing; i++) {
    let isHi = true;
    let isLo = true;
    const hi = Number(rows[i]!.high);
    const lo = Number(rows[i]!.low);
    for (let j = i - wing; j <= i + wing; j++) {
      if (j === i) continue;
      if (Number(rows[j]!.high) >= hi) isHi = false;
      if (Number(rows[j]!.low) <= lo) isLo = false;
    }
    const half = atr * 0.15;
    if (isHi) pushEv(out, 'swing_high', hi - half, hi + half, i, tf, 58, '스윙고');
    if (isLo) pushEv(out, 'swing_low', lo - half, lo + half, i, tf, 58, '스윙저');
  }
  return out.slice(-12);
}

export function collectAmzEvidence(params: {
  candles: Candle[];
  timeframe: string;
  /** VWAP 공유 컨텍스트 레벨 — 기존 AVWAP/세션과 연동 */
  vwapLevels?: Array<{ price: number; labelKo: string; strength?: number }> | null;
}): AmzEvidence[] {
  const rows = params.candles;
  const n = rows.length;
  if (n < 40) return [];
  const endExclusive = n - 1; // 형성봉 제외
  const closed = rows.slice(0, endExclusive);
  const tf = params.timeframe;
  const bars = toEagleBars(closed);
  const atr = atrAt(bars, endExclusive, 14) || Number(closed[closed.length - 1]?.close) * 0.004;
  const out: AmzEvidence[] = [];

  // OB — 기존 SMC 구조 OB (재사용)
  try {
    const { validObs } = detectSmcStructureOrderBlocks(closed);
    for (const ob of validObs.slice(-12)) {
      if (ob.bias === 'bullish') {
        pushEv(out, 'bullish_ob', ob.low, ob.high, ob.index, tf, 72, '상승OB');
      } else {
        pushEv(out, 'bearish_ob', ob.low, ob.high, ob.index, tf, 72, '하락OB');
      }
    }
  } catch {
    /* ignore */
  }

  // FVG / BPR — Eagle1 causal (재사용)
  try {
    const fvgs = detectFvgCausal(bars, endExclusive).filter((f) => f.valid);
    for (const f of fvgs.slice(-8)) {
      pushEv(out, 'fvg', f.low, f.high, f.index, tf, 60, f.bias === 'bullish' ? '상승FVG' : '하락FVG');
    }
    const bprs = detectBPR(fvgs, atr, 3);
    for (const b of bprs.slice(-4)) {
      pushEv(out, 'bpr', b.bottom, b.top, b.index, tf, 64, 'BPR');
    }
  } catch {
    /* ignore */
  }

  // Structure sweeps → liquidity tags
  try {
    const snap = detectStructureCausal(bars, 3);
    const events = snap?.events ?? [];
    for (const ev of events.slice(-10)) {
      const kind = String(ev.kind || '');
      const px = Number(ev.price);
      if (!Number.isFinite(px)) continue;
      const half = atr * 0.12;
      if (kind === 'SWEEP') {
        pushEv(out, 'liquidity_pool', px - half, px + half, Number(ev.index), tf, 50, '유동성스윕');
      }
    }
  } catch {
    /* ignore */
  }

  out.push(...profileEvidence(rows, endExclusive, tf, atr));
  out.push(...swingEvidence(rows, endExclusive, tf, atr));

  /** VWAP 연동 evidence — 타입이 있던 avwap을 실제로 push */
  if (params.vwapLevels?.length) {
    const bar = Math.max(0, endExclusive - 1);
    for (const lv of params.vwapLevels.slice(0, 8)) {
      const p = Number(lv.price);
      if (!(p > 0)) continue;
      const half = atr * 0.08;
      pushEv(
        out,
        'avwap',
        p - half,
        p + half,
        bar,
        tf,
        Math.max(40, Math.min(78, Number(lv.strength) || 58)),
        lv.labelKo || 'VWAP'
      );
    }
  }

  // Deduplicate near-identical
  const kept: AmzEvidence[] = [];
  for (const e of out.sort((a, b) => b.strength - a.strength)) {
    const near = kept.some(
      (k) =>
        k.kind === e.kind &&
        Math.abs(k.mid - e.mid) < atr * 0.25 &&
        Math.abs(k.upper - k.lower - (e.upper - e.lower)) < atr * 0.5
    );
    if (!near) kept.push(e);
  }
  return kept.slice(0, 48);
}
