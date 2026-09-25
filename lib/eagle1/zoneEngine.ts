/**
 * Eagle1 zone-engine — lifecycle + immutable confirmed bounds + clustering.
 * Fewer, fixed zones. No 초강력 labels from hand rules.
 */

import { detectBPR } from '@/lib/bpr';
import { detectFvgCausal } from './causalFvg';
import { atrAt, type Eagle1Bar, type StructureSnapshot } from './structureEngine';
import { inheritFrozenZones } from './zoneFreeze';
import { computeZoneReaction, type ZoneReaction } from './zoneReaction';

export type ZoneSource =
  | 'poc'
  | 'hvn'
  | 'lvn'
  | 'vah'
  | 'val'
  | 'ob'
  | 'fvg'
  | 'bpr'
  | 'breaker'
  | 'demand'
  | 'supply'
  | 'sr'
  | 'liquidity';

export type ZoneLifecycle =
  | 'PENDING'
  | 'CONFIRMED'
  | 'FRESH'
  | 'TESTED'
  | 'WEAK'
  | 'BROKEN'
  | 'INVALID'
  | 'DELETED';

export type ZoneTier = 'S' | 'A' | 'B' | 'C';

export type PocState =
  | 'BELOW'
  | 'ABOVE'
  | 'APPROACH'
  | 'BREAK_ATTEMPT'
  | 'CLOSED_ABOVE'
  | 'CLOSED_BELOW'
  | 'RETEST'
  | 'HOLD_SUCCESS'
  | 'REJECTION'
  | 'RECLAIMED'
  | 'LOST';

export type ZoneStatHint = {
  family: string;
  sampleSize: number;
  netExpectancy: number | null;
  tpBeforeSlRate?: number | null;
};

export type Eagle1Zone = {
  zone_id: string;
  source_type: ZoneSource;
  timeframe: string;
  created_at: number;
  lower: number;
  upper: number;
  midpoint: number;
  strength: number;
  strengthKind: 'heuristic' | '통계 부족';
  reason: string;
  status: ZoneLifecycle;
  test_count: number;
  last_test_at: number | null;
  bias: 'bullish' | 'bearish' | 'neutral';
  tier: ZoneTier;
  frozen: boolean;
};

export type ZoneCluster = {
  cluster_id: string;
  labelKo: string;
  lower: number;
  upper: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  components: Eagle1Zone[];
  tier: ZoneTier;
  sources: ZoneSource[];
  sampleSize: number;
  reactionLabel: string;
  detail: string;
};

export type VolumeProfileSlice = {
  poc: number | null;
  vah: number | null;
  val: number | null;
  hvn: number[];
  lvn: number[];
  pocState: PocState;
};

export type ZoneEngineResult = {
  zones: Eagle1Zone[];
  clusters: ZoneCluster[];
  recommended: ZoneCluster | null;
  displaySupport: ZoneCluster[];
  displayResist: ZoneCluster[];
  profile: VolumeProfileSlice;
  reaction: ZoneReaction;
};

const TF_SEC: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1H': 3600,
  '1h': 3600,
  '4H': 14400,
  '4h': 14400,
  '1D': 86400,
  '1d': 86400,
};

function overlapRatio(aLo: number, aHi: number, bLo: number, bHi: number): number {
  const lo = Math.max(aLo, bLo);
  const hi = Math.min(aHi, bHi);
  if (hi <= lo) return 0;
  const inter = hi - lo;
  const union = Math.max(aHi, bHi) - Math.min(aLo, bLo);
  return union > 0 ? inter / union : 0;
}

export const POC_STATE_KO: Record<PocState, string> = {
  BELOW: '아래',
  ABOVE: '위',
  APPROACH: '접근',
  BREAK_ATTEMPT: '돌파시도',
  CLOSED_ABOVE: '위마감',
  CLOSED_BELOW: '아래마감',
  RETEST: '재확인',
  HOLD_SUCCESS: '지지유지',
  REJECTION: '거절',
  RECLAIMED: '재탈환',
  LOST: '상실',
};

export function pocStateKo(state: PocState | null | undefined): string {
  if (!state) return '데이터 없음';
  return POC_STATE_KO[state] || '데이터 없음';
}

export function classifyPocState(params: {
  bars: Eagle1Bar[];
  poc: number;
  atr: number;
}): PocState {
  const { bars, poc, atr } = params;
  if (!bars.length || !(poc > 0)) return 'APPROACH';
  const last = bars[bars.length - 1]!;
  const prev = bars.length >= 2 ? bars[bars.length - 2]! : last;
  const near = atr > 0 && Math.abs(last.close - poc) <= atr * 0.35;
  const wick = last.high >= poc && last.low <= poc;
  const prevAbove = prev.close > poc;
  const prevBelow = prev.close < poc;
  const nowAbove = last.close > poc;
  const nowBelow = last.close < poc;
  let priorAbove = 0;
  let priorBelow = 0;
  const from = Math.max(0, bars.length - 9);
  for (let i = from; i < bars.length - 1; i++) {
    if (bars[i]!.close > poc) priorAbove += 1;
    else priorBelow += 1;
  }
  const wasAbove = priorAbove > priorBelow;
  const wasBelow = priorBelow > priorAbove;

  if (wick && nowAbove && prevBelow) return wasBelow ? 'RECLAIMED' : 'CLOSED_ABOVE';
  if (wick && nowBelow && prevAbove) return wasAbove ? 'LOST' : 'CLOSED_BELOW';
  if (wick && nowAbove && prevAbove) {
    if (near) return 'RETEST';
    if (atr > 0 && last.close - poc >= atr * 0.15) return 'HOLD_SUCCESS';
    return 'CLOSED_ABOVE';
  }
  if (wick && nowBelow && prevBelow) {
    if (near) return 'RETEST';
    return 'CLOSED_BELOW';
  }
  if (wick && ((wasAbove && nowAbove) || (wasBelow && nowBelow))) return 'BREAK_ATTEMPT';
  if (!wick && near && prev.high >= poc && prev.low <= poc && prev.close > poc && nowAbove) return 'HOLD_SUCCESS';
  if (wick && ((wasAbove && nowAbove && last.close < prev.close) || (wasBelow && nowBelow && last.close > prev.close))) {
    return 'REJECTION';
  }
  if (near) return 'APPROACH';
  return nowAbove ? 'ABOVE' : 'BELOW';
}

export function volumeProfile(candles: Eagle1Bar[], endExclusive: number, bins = 48): VolumeProfileSlice {
  const n = Math.min(candles.length, endExclusive);
  const start = Math.max(0, n - 80);
  const slice = candles.slice(start, n);
  if (slice.length < 8) {
    return { poc: null, vah: null, val: null, hvn: [], lvn: [], pocState: 'APPROACH' };
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of slice) {
    lo = Math.min(lo, b.low);
    hi = Math.max(hi, b.high);
  }
  if (!(hi > lo)) {
    return { poc: null, vah: null, val: null, hvn: [], lvn: [], pocState: 'APPROACH' };
  }
  const vol = new Array(bins).fill(0) as number[];
  const step = (hi - lo) / bins;
  for (const b of slice) {
    const raw = b.volume && b.volume > 0 ? b.volume : 1;
    const i0 = Math.min(bins - 1, Math.max(0, Math.floor((b.low - lo) / step)));
    const i1 = Math.min(bins - 1, Math.max(0, Math.floor((b.high - lo) / step)));
    const span = Math.max(1, i1 - i0 + 1);
    const share = raw / span;
    for (let i = i0; i <= i1; i++) vol[i]! += share;
  }
  let pocBin = 0;
  let maxV = -1;
  for (let i = 0; i < bins; i++) {
    if (vol[i]! > maxV) {
      maxV = vol[i]!;
      pocBin = i;
    }
  }
  const total = vol.reduce((a, b) => a + b, 0);
  let acc = vol[pocBin]!;
  let left = pocBin;
  let right = pocBin;
  const target = total * 0.7;
  while (acc < target && (left > 0 || right < bins - 1)) {
    const nextL = left > 0 ? vol[left - 1]! : -1;
    const nextR = right < bins - 1 ? vol[right + 1]! : -1;
    if (nextL >= nextR) {
      left -= 1;
      acc += Math.max(0, nextL);
    } else {
      right += 1;
      acc += Math.max(0, nextR);
    }
  }
  const mid = (i: number) => lo + (i + 0.5) * step;
  const poc = mid(pocBin);
  const val = mid(left);
  const vah = mid(right);
  const mean = total / bins;
  const hvn: number[] = [];
  const lvn: number[] = [];
  for (let i = 0; i < bins; i++) {
    if (vol[i]! >= mean * 1.6) hvn.push(mid(i));
    if (vol[i]! > 0 && vol[i]! <= mean * 0.35) lvn.push(mid(i));
  }
  const atr = atrAt(candles, n) || poc * 0.002;
  const pocState = classifyPocState({ bars: slice, poc, atr });
  return { poc, vah, val, hvn: hvn.slice(0, 4), lvn: lvn.slice(0, 4), pocState };
}

function freezeZone(z: Eagle1Zone): Eagle1Zone {
  if (z.status === 'PENDING' || z.status === 'DELETED') return z;
  return { ...z, frozen: true };
}

function barAge(z: Eagle1Zone, lastTime: number, timeframe: string): number {
  const step = TF_SEC[timeframe] || 3600;
  if (!(step > 0) || !(lastTime > z.created_at)) return 0;
  return (lastTime - z.created_at) / step;
}

function oppositeBos(structure: StructureSnapshot | undefined, bias: Eagle1Zone['bias']): boolean {
  if (!structure || bias === 'neutral') return false;
  const ev = [...structure.events].reverse().find((e) => e.kind === 'CHOCH' || e.kind === 'BOS');
  if (!ev) return false;
  return (bias === 'bullish' && ev.bias === 'bearish') || (bias === 'bearish' && ev.bias === 'bullish');
}

export function applyZoneLifecycle(
  z: Eagle1Zone,
  candles: Eagle1Bar[],
  n: number,
  structure?: StructureSnapshot
): Eagle1Zone {
  const last = candles[n - 1];
  if (!last) return z;
  if (z.status === 'DELETED') return z;
  let next: Eagle1Zone = { ...z };
  const through =
    next.bias === 'bullish'
      ? last.close < next.lower
      : next.bias === 'bearish'
        ? last.close > next.upper
        : last.close < next.lower || last.close > next.upper;
  const filled =
    next.source_type === 'fvg' &&
    ((next.bias === 'bullish' && last.low <= next.lower) || (next.bias === 'bearish' && last.high >= next.upper));
  const mitigatedOb =
    next.source_type === 'ob' &&
    ((next.bias === 'bullish' && last.close < next.lower) || (next.bias === 'bearish' && last.close > next.upper));
  const touches = last.low <= next.upper && last.high >= next.lower;
  const age = barAge(next, last.time, next.timeframe);

  if (next.status === 'PENDING') {
    const confirmClose =
      next.bias === 'bullish'
        ? last.close >= next.lower && last.close <= next.upper * 1.01
        : next.bias === 'bearish'
          ? last.close <= next.upper && last.close >= next.lower * 0.99
          : touches;
    if (confirmClose) next = freezeZone({ ...next, status: 'CONFIRMED' });
    return next;
  }

  if (next.status === 'BROKEN') {
    if (through || oppositeBos(structure, next.bias)) {
      return freezeZone({ ...next, status: 'INVALID', reason: `${next.reason} · 무효` });
    }
    return freezeZone(next);
  }
  if (next.status === 'INVALID') {
    if (age > 40) return { ...next, status: 'DELETED', frozen: false };
    return freezeZone(next);
  }

  if (filled || mitigatedOb || through) {
    return freezeZone({ ...next, status: 'BROKEN' });
  }
  if (oppositeBos(structure, next.bias) && through) {
    return freezeZone({ ...next, status: 'INVALID', reason: `${next.reason} · 반대 구조돌파` });
  }
  if (touches) {
    const tests = next.test_count + 1;
    next = freezeZone({
      ...next,
      test_count: tests,
      last_test_at: last.time,
      status: tests >= 3 ? 'WEAK' : next.status === 'CONFIRMED' || next.status === 'FRESH' ? 'TESTED' : next.status,
    });
    return next;
  }
  if (age > 160 && next.test_count === 0) {
    return freezeZone({ ...next, status: 'INVALID', reason: `${next.reason} · 반응 없이 오래됨` });
  }
  if (age > 80 && next.test_count === 0 && (next.status === 'FRESH' || next.status === 'CONFIRMED')) {
    return freezeZone({ ...next, status: 'WEAK' });
  }
  if (next.status === 'CONFIRMED') return freezeZone({ ...next, status: 'FRESH' });
  return freezeZone(next);
}

function statFor(source: ZoneSource, hints?: ZoneStatHint[]): ZoneStatHint | null {
  if (!hints?.length) return null;
  const family =
    source === 'poc' ? 'poc_hold' : source === 'ob' ? 'ob_retest' : source === 'fvg' || source === 'bpr' ? 'fvg_retest' : source === 'breaker' ? 'ob_retest' : null;
  if (!family) return null;
  return hints.find((h) => h.family === family) ?? null;
}

function withEvidence(z: Omit<Eagle1Zone, 'strengthKind' | 'tier'> & { tier?: ZoneTier }, hints?: ZoneStatHint[]): Eagle1Zone {
  const st = statFor(z.source_type, hints);
  const n = st?.sampleSize ?? 0;
  const evOk = n >= 30;
  const evPos = evOk && st?.netExpectancy != null && st.netExpectancy > 0;
  let tier: ZoneTier = z.tier ?? 'B';
  if (evPos && (z.source_type === 'poc' || z.source_type === 'ob' || z.source_type === 'fvg')) tier = tier === 'C' ? 'B' : 'S';
  else if (!evOk && tier === 'S' && z.source_type !== 'poc') tier = 'A';
  const reason = evOk ? `${z.reason} · 표본 ${n}` : `${z.reason} · 휴리스틱`;
  return {
    ...z,
    tier,
    reason,
    strengthKind: evOk ? 'heuristic' : '통계 부족',
  };
}

function baseZone(partial: Eagle1Zone, candles: Eagle1Bar[], n: number, structure: StructureSnapshot): Eagle1Zone {
  return applyZoneLifecycle(partial, candles, n, structure);
}

export function detectZonesCausal(params: {
  candles: Eagle1Bar[];
  timeframe: string;
  structure: StructureSnapshot;
  endExclusive?: number;
  prevFrozen?: Eagle1Zone[];
  stats?: ZoneStatHint[];
}): ZoneEngineResult {
  const { candles, timeframe, structure } = params;
  const n = Math.max(0, Math.min(candles.length, params.endExclusive ?? candles.length));
  const profile = volumeProfile(candles, n);
  const zones: Eagle1Zone[] = [];
  const t0 = candles[Math.max(0, n - 1)]?.time ?? 0;
  const atr = atrAt(candles, n) || (profile.poc ?? 1) * 0.002;
  const hints = params.stats;

  const push = (z: Eagle1Zone) => {
    zones.push(baseZone(withEvidence(z, hints), candles, n, structure));
  };

  if (profile.poc != null) {
    const half = atr * 0.25;
    push({
      zone_id: 'poc:profile',
      source_type: 'poc',
      timeframe,
      created_at: t0,
      lower: profile.poc - half,
      upper: profile.poc + half,
      midpoint: profile.poc,
      strength: 0.62,
      strengthKind: 'heuristic',
      reason: `최다거래가격(POC) ${profile.pocState}`,
      status: 'CONFIRMED',
      test_count: 0,
      last_test_at: null,
      bias: 'neutral',
      tier: 'S',
      frozen: true,
    });
  }
  if (profile.vah != null && profile.val != null) {
    const band = atr * 0.12;
    push({
      zone_id: 'vah:profile',
      source_type: 'vah',
      timeframe,
      created_at: t0,
      lower: profile.vah - band,
      upper: profile.vah + band,
      midpoint: profile.vah,
      strength: 0.4,
      strengthKind: 'heuristic',
      reason: 'VAH 거래량 상단',
      status: 'CONFIRMED',
      test_count: 0,
      last_test_at: null,
      bias: 'bearish',
      tier: 'B',
      frozen: true,
    });
    push({
      zone_id: 'val:profile',
      source_type: 'val',
      timeframe,
      created_at: t0,
      lower: profile.val - band,
      upper: profile.val + band,
      midpoint: profile.val,
      strength: 0.4,
      strengthKind: 'heuristic',
      reason: 'VAL 거래량 하단',
      status: 'CONFIRMED',
      test_count: 0,
      last_test_at: null,
      bias: 'bullish',
      tier: 'B',
      frozen: true,
    });
  }
  for (let i = 0; i < Math.min(2, profile.hvn.length); i++) {
    const p = profile.hvn[i]!;
    const band = atr * 0.14;
    push({
      zone_id: `hvn:${i}`,
      source_type: 'hvn',
      timeframe,
      created_at: t0,
      lower: p - band,
      upper: p + band,
      midpoint: p,
      strength: 0.36,
      strengthKind: 'heuristic',
      reason: '고거래량 가격대',
      status: 'CONFIRMED',
      test_count: 0,
      last_test_at: null,
      bias: 'neutral',
      tier: 'B',
      frozen: true,
    });
  }
  if (profile.lvn[0] != null) {
    const p = profile.lvn[0]!;
    const band = atr * 0.12;
    push({
      zone_id: 'lvn:0',
      source_type: 'lvn',
      timeframe,
      created_at: t0,
      lower: p - band,
      upper: p + band,
      midpoint: p,
      strength: 0.28,
      strengthKind: 'heuristic',
      reason: '저거래량 가격대',
      status: 'CONFIRMED',
      test_count: 0,
      last_test_at: null,
      bias: 'neutral',
      tier: 'B',
      frozen: true,
    });
  }

  const fvgs = detectFvgCausal(
    candles.slice(0, n).map((c) => ({ high: c.high, low: c.low })),
    n
  );
  for (const f of fvgs.slice(-6)) {
    const pending = !f.valid;
    push({
      zone_id: `fvg:${f.index}:${f.bias}`,
      source_type: 'fvg',
      timeframe,
      created_at: candles[f.index]?.time ?? t0,
      lower: f.low,
      upper: f.high,
      midpoint: (f.low + f.high) / 2,
      strength: f.valid ? 0.5 : 0.2,
      strengthKind: 'heuristic',
      reason: f.valid ? '가격빈틈(미완화)' : '가격빈틈(완화됨)',
      status: f.valid ? 'CONFIRMED' : 'INVALID',
      test_count: pending ? 1 : 0,
      last_test_at: null,
      bias: f.bias,
      tier: f.valid ? 'A' : 'C',
      frozen: f.valid,
    });
  }
  const bprs = detectBPR(
    fvgs.map((f) => ({
      low: f.low,
      high: f.high,
      index: f.index,
      valid: f.valid,
      bias: f.bias,
    })),
    atr,
    2
  );
  for (const b of bprs) {
    push({
      zone_id: `bpr:${b.index}`,
      source_type: 'bpr',
      timeframe,
      created_at: candles[b.index]?.time ?? t0,
      lower: b.bottom,
      upper: b.top,
      midpoint: b.midpoint,
      strength: 0.44,
      strengthKind: 'heuristic',
      reason: '균형가격구간(BPR)',
      status: 'CONFIRMED',
      test_count: 0,
      last_test_at: null,
      bias: 'neutral',
      tier: 'A',
      frozen: true,
    });
  }

  const lastBos = [...structure.events].reverse().find((e) => e.kind === 'BOS' || e.kind === 'CHOCH');
  if (lastBos && lastBos.known_at < n) {
    const i = lastBos.index;
    const from = Math.max(0, i - 6);
    let ob: Eagle1Bar | null = null;
    let obIdx = -1;
    for (let k = i - 1; k >= from; k--) {
      const b = candles[k]!;
      const bullish = b.close >= b.open;
      if (lastBos.bias === 'bullish' && !bullish) {
        ob = b;
        obIdx = k;
        break;
      }
      if (lastBos.bias === 'bearish' && bullish) {
        ob = b;
        obIdx = k;
        break;
      }
    }
    if (ob && obIdx >= 0) {
      const lower = Math.min(ob.open, ob.close, ob.low);
      const upper = Math.max(ob.open, ob.close, ob.high);
      const last = candles[n - 1]!;
      const flipped =
        (lastBos.bias === 'bullish' && last.close < lower) || (lastBos.bias === 'bearish' && last.close > upper);
      if (flipped) {
        push({
          zone_id: `breaker:${obIdx}:${lastBos.bias}`,
          source_type: 'breaker',
          timeframe,
          created_at: ob.time,
          lower,
          upper,
          midpoint: (upper + lower) / 2,
          strength: 0.46,
          strengthKind: 'heuristic',
          reason: '돌파전환구간(구 주문구간)',
          status: 'CONFIRMED',
          test_count: 0,
          last_test_at: null,
          bias: lastBos.bias === 'bullish' ? 'bearish' : 'bullish',
          tier: 'A',
          frozen: true,
        });
      } else {
        push({
          zone_id: `ob:${obIdx}:${lastBos.bias}`,
          source_type: 'ob',
          timeframe,
          created_at: ob.time,
          lower,
          upper,
          midpoint: (ob.high + ob.low) / 2,
          strength: 0.48,
          strengthKind: 'heuristic',
          reason: lastBos.bias === 'bullish' ? '기관 주문구간(매수)' : '기관 주문구간(매도)',
          status: 'CONFIRMED',
          test_count: 0,
          last_test_at: null,
          bias: lastBos.bias,
          tier: 'A',
          frozen: true,
        });
      }
    }
  }

  if (structure.lastSwingLow) {
    const p = structure.lastSwingLow.price;
    const pad = atr * 0.2;
    push({
      zone_id: `demand:${structure.lastSwingLow.index}`,
      source_type: 'demand',
      timeframe,
      created_at: candles[structure.lastSwingLow.index]?.time ?? t0,
      lower: p - pad,
      upper: p + pad,
      midpoint: p,
      strength: 0.4,
      strengthKind: 'heuristic',
      reason: '매수수요(스윙저점)',
      status: 'CONFIRMED',
      test_count: 0,
      last_test_at: null,
      bias: 'bullish',
      tier: 'B',
      frozen: true,
    });
  }
  if (structure.lastSwingHigh) {
    const p = structure.lastSwingHigh.price;
    const pad = atr * 0.2;
    push({
      zone_id: `supply:${structure.lastSwingHigh.index}`,
      source_type: 'supply',
      timeframe,
      created_at: candles[structure.lastSwingHigh.index]?.time ?? t0,
      lower: p - pad,
      upper: p + pad,
      midpoint: p,
      strength: 0.4,
      strengthKind: 'heuristic',
      reason: '매도공급(스윙고점)',
      status: 'CONFIRMED',
      test_count: 0,
      last_test_at: null,
      bias: 'bearish',
      tier: 'B',
      frozen: true,
    });
  }

  const eqh = structure.equalHighs.slice(-1);
  const eql = structure.equalLows.slice(-1);
  for (let i = 0; i < eqh.length; i++) {
    const p = eqh[i]!;
    push({
      zone_id: `liq:eqh:${i}:${p.toFixed(1)}`,
      source_type: 'liquidity',
      timeframe,
      created_at: t0,
      lower: p - atr * 0.08,
      upper: p + atr * 0.08,
      midpoint: p,
      strength: 0.32,
      strengthKind: 'heuristic',
      reason: '위쪽 유동성',
      status: 'CONFIRMED',
      test_count: 0,
      last_test_at: null,
      bias: 'bearish',
      tier: 'B',
      frozen: true,
    });
  }
  for (let i = 0; i < eql.length; i++) {
    const p = eql[i]!;
    push({
      zone_id: `liq:eql:${i}:${p.toFixed(1)}`,
      source_type: 'liquidity',
      timeframe,
      created_at: t0,
      lower: p - atr * 0.08,
      upper: p + atr * 0.08,
      midpoint: p,
      strength: 0.32,
      strengthKind: 'heuristic',
      reason: '아래쪽 유동성',
      status: 'CONFIRMED',
      test_count: 0,
      last_test_at: null,
      bias: 'bullish',
      tier: 'B',
      frozen: true,
    });
  }

  const frozen0 = zones.map((z) => (z.status === 'PENDING' ? z : freezeZone(z)));
  const inherited = inheritFrozenZones({
    fresh: frozen0,
    prev: params.prevFrozen,
    candles,
    endExclusive: n,
  }).filter((z) => z.status !== 'DELETED');
  const frozen = capLiquidityZones(inherited);
  const livePoc = frozen.find((z) => z.source_type === 'poc' && zoneVisibleInDefaultUi(z));
  const liveVah = frozen.find((z) => z.source_type === 'vah' && zoneVisibleInDefaultUi(z));
  const liveVal = frozen.find((z) => z.source_type === 'val' && zoneVisibleInDefaultUi(z));
  const slice = candles.slice(Math.max(0, n - 80), n);
  const synced: VolumeProfileSlice = {
    ...profile,
    poc: livePoc?.midpoint ?? profile.poc,
    vah: liveVah?.midpoint ?? profile.vah,
    val: liveVal?.midpoint ?? profile.val,
    pocState:
      livePoc != null
        ? classifyPocState({ bars: slice, poc: livePoc.midpoint, atr: atr || livePoc.midpoint * 0.002 })
        : profile.pocState,
  };
  const clusters = clusterZones(frozen, hints);
  const lastPx = candles[n - 1]?.close ?? 0;
  const { support, resist } = capSupportResist(clusters);
  const recommended = pickRecommendedCluster(support, resist, lastPx, structure);
  const reaction = computeZoneReaction({
    candles,
    endExclusive: n,
    recommended,
    poc: synced.poc,
    pocState: synced.pocState,
  });
  return {
    zones: frozen,
    clusters,
    recommended,
    displaySupport: support,
    displayResist: resist,
    profile: synced,
    reaction,
  };
}

function clusterScore(c: ZoneCluster): number {
  const t = c.tier === 'S' ? 4 : c.tier === 'A' ? 3 : c.tier === 'B' ? 2 : 1;
  const poc = c.sources.includes('poc') ? 6 : 0;
  const mix = c.components.length >= 2 ? 4 : 0;
  return t * 10 + c.components.length + poc + mix;
}

function capSupportResist(clusters: ZoneCluster[]): { support: ZoneCluster[]; resist: ZoneCluster[] } {
  const support = clusters
    .filter((c) => c.bias === 'bullish' || (c.bias === 'neutral' && c.sources.includes('poc')))
    .sort((a, b) => clusterScore(b) - clusterScore(a))
    .slice(0, 2);
  const resist = clusters
    .filter((c) => c.bias === 'bearish')
    .sort((a, b) => clusterScore(b) - clusterScore(a))
    .slice(0, 2);
  return { support, resist };
}

function clusterAlive(c: ZoneCluster): boolean {
  return c.components.some((z) => z.status !== 'WEAK' && z.status !== 'BROKEN' && z.status !== 'INVALID');
}

export function pickRecommendedCluster(
  support: ZoneCluster[],
  resist: ZoneCluster[],
  price: number,
  structure: StructureSnapshot
): ZoneCluster | null {
  const preferLong = structure.regime === 'BULL' || structure.regime === 'STRONG_BULL' || structure.state === 'SHIFT';
  const raw = preferLong && support.length ? support : resist.length ? resist : support;
  const pool = raw.filter(clusterAlive);
  const use = pool.length ? pool : raw;
  if (!use.length || !(price > 0)) return use[0] ?? null;
  return [...use].sort((a, b) => {
    const da = Math.min(Math.abs(price - a.lower), Math.abs(price - a.upper), price >= a.lower && price <= a.upper ? 0 : 1e9);
    const db = Math.min(Math.abs(price - b.lower), Math.abs(price - b.upper), price >= b.lower && price <= b.upper ? 0 : 1e9);
    const ts = (c: ZoneCluster) => (c.tier === 'S' ? 0 : c.tier === 'A' ? 1 : 2);
    return ts(a) - ts(b) || da - db || clusterScore(b) - clusterScore(a);
  })[0] ?? null;
}

function sourceKo(s: ZoneSource): string {
  if (s === 'poc') return 'POC';
  if (s === 'ob') return '주문구간';
  if (s === 'fvg') return '가격빈틈';
  if (s === 'bpr') return '균형';
  if (s === 'breaker') return '돌파전환';
  if (s === 'demand') return '매수수요';
  if (s === 'supply') return '매도공급';
  if (s === 'hvn') return '고거래';
  if (s === 'lvn') return '저거래';
  if (s === 'vah') return '거래량상단';
  if (s === 'val') return '거래량하단';
  if (s === 'liquidity') return '유동성';
  return s;
}

function capLiquidityZones(zones: Eagle1Zone[]): Eagle1Zone[] {
  const rest = zones.filter((z) => z.source_type !== 'liquidity');
  const liq = zones.filter((z) => z.source_type === 'liquidity' && z.status !== 'DELETED');
  const bsl = liq.filter((z) => z.bias === 'bearish').slice(-1);
  const ssl = liq.filter((z) => z.bias === 'bullish').slice(-1);
  return [...rest, ...bsl, ...ssl];
}

const CLUSTER_SOURCES = new Set<ZoneSource>(['ob', 'fvg', 'bpr', 'breaker', 'demand', 'supply', 'sr']);
const CLUSTER_ATTACH = new Set<ZoneSource>(['poc']);

function familyOfSource(s: ZoneSource): string | null {
  if (s === 'poc') return 'poc_hold';
  if (s === 'ob' || s === 'breaker') return 'ob_retest';
  if (s === 'fvg' || s === 'bpr') return 'fvg_retest';
  return null;
}

export function clusterReactionLabel(sampleSize: number, holdRate: number | null | undefined): string {
  if (sampleSize < 30) return '통계 부족';
  if (holdRate == null || !Number.isFinite(holdRate)) return '데이터 없음';
  return `${(holdRate * 100).toFixed(1)}%`;
}

function reactionFromHints(sources: ZoneSource[], hints?: ZoneStatHint[]): { sampleSize: number; reactionLabel: string } {
  const families = new Set(sources.map(familyOfSource).filter((x): x is string => !!x));
  const matched = (hints ?? []).filter((h) => families.has(h.family));
  const sampleSize = matched.reduce((m, h) => Math.max(m, h.sampleSize), 0);
  const hold = matched.find((h) => h.tpBeforeSlRate != null)?.tpBeforeSlRate ?? null;
  return { sampleSize, reactionLabel: clusterReactionLabel(sampleSize, hold) };
}

function clusterTierOf(group: Eagle1Zone[], sources: ZoneSource[]): ZoneTier {
  const weak = group.every((z) => z.status === 'WEAK');
  if (weak) return 'B';
  const hasPoc = sources.includes('poc');
  const hasSetup = sources.includes('ob') || sources.includes('fvg') || sources.includes('breaker');
  if (hasPoc && hasSetup) return 'S';
  if (group.some((g) => g.tier === 'S') && group.length >= 2) return 'S';
  if (hasSetup && group.length >= 2) return 'A';
  if (group.some((g) => g.tier === 'S')) return 'A';
  if (group.some((g) => g.tier === 'A')) return 'A';
  return group.some((g) => g.tier === 'B') ? 'B' : 'C';
}

function coreLabel(bias: ZoneCluster['bias'], sources: ZoneSource[], count: number): string {
  if (count >= 2 || sources.includes('poc')) {
    if (bias === 'bearish') return '핵심 매도구간';
    if (bias === 'bullish') return '핵심 매수구간';
    return '핵심 구간';
  }
  return sourceKo(sources[0] ?? 'sr');
}

function buildCluster(group: Eagle1Zone[], hints?: ZoneStatHint[]): ZoneCluster {
  const lower = Math.min(...group.map((g) => g.lower));
  const upper = Math.max(...group.map((g) => g.upper));
  const bull = group.filter((g) => g.bias === 'bullish').length;
  const bear = group.filter((g) => g.bias === 'bearish').length;
  const bias: ZoneCluster['bias'] = bull > bear ? 'bullish' : bear > bull ? 'bearish' : 'neutral';
  const sources = [...new Set(group.map((g) => g.source_type))];
  const { sampleSize, reactionLabel } = reactionFromHints(sources, hints);
  const core = coreLabel(bias, sources, group.length);
  const mix = sources.map(sourceKo).slice(0, 4).join('+');
  return {
    cluster_id: `cl:${group.map((g) => g.zone_id).join('+')}`,
    labelKo: `${core} · ${reactionLabel}`,
    lower,
    upper,
    bias,
    components: group,
    tier: clusterTierOf(group, sources),
    sources,
    sampleSize,
    reactionLabel,
    detail: mix,
  };
}

function sameDirectionalBias(a: Eagle1Zone, b: Eagle1Zone): boolean {
  if (a.bias === 'neutral' || b.bias === 'neutral') return a.bias === b.bias;
  return a.bias === b.bias;
}

export function clusterZones(zones: Eagle1Zone[], hints?: ZoneStatHint[]): ZoneCluster[] {
  const live = zones.filter(
    (z) =>
      z.status !== 'INVALID' &&
      z.status !== 'DELETED' &&
      z.status !== 'BROKEN' &&
      z.source_type !== 'liquidity' &&
      z.source_type !== 'hvn' &&
      z.source_type !== 'lvn' &&
      z.source_type !== 'vah' &&
      z.source_type !== 'val'
  );
  const directional = live.filter((z) => CLUSTER_SOURCES.has(z.source_type));
  const parent = directional.map((_, i) => i);
  const find = (i: number): number => {
    let x = i;
    while (parent[x] !== x) x = parent[x]!;
    parent[i] = x;
    return x;
  };
  const union = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pb] = pa;
  };
  for (let i = 0; i < directional.length; i++) {
    for (let j = i + 1; j < directional.length; j++) {
      const a = directional[i]!;
      const b = directional[j]!;
      if (!sameDirectionalBias(a, b)) continue;
      if (overlapRatio(a.lower, a.upper, b.lower, b.upper) >= 0.35) union(i, j);
    }
  }
  const buckets = new Map<number, Eagle1Zone[]>();
  directional.forEach((z, i) => {
    const root = find(i);
    const list = buckets.get(root) ?? [];
    list.push(z);
    buckets.set(root, list);
  });
  const groups = [...buckets.values()];
  const usedPoc = new Set<string>();
  for (const poc of live.filter((z) => CLUSTER_ATTACH.has(z.source_type))) {
    let best: Eagle1Zone[] | null = null;
    let bestN = -1;
    for (const g of groups) {
      const hit = g.some((z) => overlapRatio(z.lower, z.upper, poc.lower, poc.upper) >= 0.28);
      if (!hit) continue;
      if (g.length > bestN) {
        best = g;
        bestN = g.length;
      }
    }
    if (best && !usedPoc.has(poc.zone_id)) {
      best.push(poc);
      usedPoc.add(poc.zone_id);
    } else if (!usedPoc.has(poc.zone_id)) {
      groups.push([poc]);
      usedPoc.add(poc.zone_id);
    }
  }
  return groups.map((g) => buildCluster(g, hints)).sort((a, b) => clusterScore(b) - clusterScore(a));
}

export function confirmedBoundsImmutable(before: Eagle1Zone, after: Eagle1Zone): boolean {
  if (before.status === 'PENDING' || !before.frozen) return true;
  return before.lower === after.lower && before.upper === after.upper && before.zone_id === after.zone_id;
}

export function zoneVisibleInDefaultUi(z: Eagle1Zone): boolean {
  return z.status !== 'BROKEN' && z.status !== 'INVALID' && z.status !== 'DELETED' && z.tier !== 'C';
}
