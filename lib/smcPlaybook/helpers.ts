import type { AnalyzeResponse, Candle } from '@/types';
import { FIB_HI, FIB_LO } from '@/lib/smcPlaybook/constants';
import type { EngineSlice } from '@/lib/smcPlaybook/types';

export function atrApprox(candles: Candle[], len = 14): number {
  const n = candles.length;
  if (n < 2) return 0;
  const p = Math.min(len, n - 1);
  let s = 0;
  for (let i = n - p; i < n; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    s += tr;
  }
  return s / p;
}

export function impulseRangeShort(
  candles: Candle[],
  bosIx: number,
  swIx: number,
  chIx: number
): { high: number; low: number } | null {
  const n = candles.length;
  if (n < 8 || chIx < 0 || chIx >= n) return null;
  const i0 = Math.max(0, Math.min(bosIx, swIx));
  const i1 = Math.max(bosIx, swIx, chIx);
  let H = -Infinity;
  for (let i = i0; i <= i1; i++) {
    H = Math.max(H, candles[i].high);
  }
  const iLoEnd = Math.min(n - 1, chIx + 14);
  let L = Infinity;
  for (let i = chIx; i <= iLoEnd; i++) {
    L = Math.min(L, candles[i].low);
  }
  if (!Number.isFinite(H) || !Number.isFinite(L) || H <= L) return null;
  return { high: H, low: L };
}

export function impulseRangeLong(
  candles: Candle[],
  bosIx: number,
  swIx: number,
  chIx: number
): { high: number; low: number } | null {
  const n = candles.length;
  if (n < 8 || chIx < 0 || chIx >= n) return null;
  const iHiEnd = Math.min(n - 1, chIx + 14);
  let H = -Infinity;
  for (let i = chIx; i <= iHiEnd; i++) {
    H = Math.max(H, candles[i].high);
  }
  const i0 = Math.max(0, Math.min(bosIx, swIx));
  const i1 = Math.max(bosIx, swIx, chIx);
  let L = Infinity;
  for (let i = i0; i <= i1; i++) {
    L = Math.min(L, candles[i].low);
  }
  if (!Number.isFinite(H) || !Number.isFinite(L) || H <= L) return null;
  return { high: H, low: L };
}

export function oteZoneShort(imp: { high: number; low: number }): { low: number; high: number } {
  const R = imp.high - imp.low;
  const lo = imp.low + FIB_LO * R;
  const hi = imp.low + FIB_HI * R;
  return lo <= hi ? { low: lo, high: hi } : { low: hi, high: lo };
}

export function oteZoneLong(imp: { high: number; low: number }): { low: number; high: number } {
  const R = imp.high - imp.low;
  const lo = imp.high - FIB_HI * R;
  const hi = imp.high - FIB_LO * R;
  return lo <= hi ? { low: lo, high: hi } : { low: hi, high: lo };
}

export function pickInducementEqhBetween(
  eqh: Array<{ a: number; b: number; price: number }> | undefined,
  loIx: number,
  hiIx: number
): { price: number; sideNote: string } | null {
  if (!eqh?.length) return null;
  let best: { price: number; dist: number } | null = null;
  for (const e of eqh) {
    const mn = Math.min(e.a, e.b);
    const mx = Math.max(e.a, e.b);
    if (mn >= loIx && mx <= hiIx) {
      const mid = (mn + mx) / 2;
      const dist = Math.abs(mid - (loIx + hiIx) / 2);
      if (!best || dist < best.dist) best = { price: e.price, dist };
    }
  }
  return best ? { price: best.price, sideNote: 'EQH·인듀스먼트' } : null;
}

export function pickInducementEqlBetween(
  eql: Array<{ a: number; b: number; price: number }> | undefined,
  loIx: number,
  hiIx: number
): { price: number; sideNote: string } | null {
  if (!eql?.length) return null;
  let best: { price: number; dist: number } | null = null;
  for (const e of eql) {
    const mn = Math.min(e.a, e.b);
    const mx = Math.max(e.a, e.b);
    if (mn >= loIx && mx <= hiIx) {
      const mid = (mn + mx) / 2;
      const dist = Math.abs(mid - (loIx + hiIx) / 2);
      if (!best || dist < best.dist) best = { price: e.price, dist };
    }
  }
  return best ? { price: best.price, sideNote: 'EQL·인듀스먼트' } : null;
}

export function pickIfvgShort(
  fvgs: EngineSlice['fvg'],
  swIx: number,
  chIx: number
): { low: number; high: number } | null {
  const list = fvgs ?? [];
  const cands = list.filter(
    (f) => f.bias === 'bullish' && !f.valid && f.index >= swIx - 2 && f.index <= chIx + 4 && f.high > f.low
  );
  const f = cands.sort((a, b) => b.index - a.index)[0];
  return f ? { low: f.low, high: f.high } : null;
}

export function pickIfvgLong(
  fvgs: EngineSlice['fvg'],
  swIx: number,
  chIx: number
): { low: number; high: number } | null {
  const list = fvgs ?? [];
  const cands = list.filter(
    (f) => f.bias === 'bearish' && !f.valid && f.index >= swIx - 2 && f.index <= chIx + 4 && f.high > f.low
  );
  const f = cands.sort((a, b) => b.index - a.index)[0];
  return f ? { low: f.low, high: f.high } : null;
}

export function htfPoiBandShort(analysis: AnalyzeResponse, atr: number): { low: number; high: number } | null {
  const nro = analysis.nearestResistanceOb;
  const pad = Math.max(atr * 0.12, nro && nro.high > nro.low ? (nro.high - nro.low) * 0.35 : atr * 0.2);
  if (nro && nro.high > nro.low) {
    return { low: nro.low - pad * 0.15, high: nro.high + pad * 0.25 };
  }
  const rp = analysis.resistanceLevel?.price;
  if (typeof rp === 'number' && Number.isFinite(rp) && atr > 0) {
    return { low: rp - atr * 0.22, high: rp + atr * 0.18 };
  }
  return null;
}

export function htfPoiBandLong(analysis: AnalyzeResponse, atr: number): { low: number; high: number } | null {
  const nso = analysis.nearestSupportOb;
  const pad = Math.max(atr * 0.12, nso && nso.high > nso.low ? (nso.high - nso.low) * 0.35 : atr * 0.2);
  if (nso && nso.high > nso.low) {
    return { low: nso.low - pad * 0.25, high: nso.high + pad * 0.15 };
  }
  const sp = analysis.supportLevel?.price;
  if (typeof sp === 'number' && Number.isFinite(sp) && atr > 0) {
    return { low: sp - atr * 0.18, high: sp + atr * 0.22 };
  }
  return null;
}

export function narrowLtfPoi(z: { low: number; high: number } | null): { low: number; high: number } | null {
  if (!z || z.high <= z.low) return null;
  const m = (z.low + z.high) / 2;
  const h = (z.high - z.low) * 0.275;
  return { low: m - h, high: m + h };
}

export function pickLqShort(eql: EngineSlice['eql'], chIx: number): number | null {
  const list = eql ?? [];
  const below = list.filter((e) => Math.max(e.a, e.b) <= chIx + 20);
  const p = below.sort((a, b) => Math.max(b.a, b.b) - Math.max(a.a, a.b))[0];
  return p ? p.price : null;
}

export function pickLqLong(eqh: EngineSlice['eqh'], chIx: number): number | null {
  const list = eqh ?? [];
  const above = list.filter((e) => Math.min(e.a, e.b) >= chIx - 20);
  const p = above.sort((a, b) => Math.min(a.a, a.b) - Math.min(b.a, b.b))[0];
  return p ? p.price : null;
}

export function numTargets(analysis: AnalyzeResponse): number[] {
  const out: number[] = [];
  for (const t of analysis.targets ?? []) {
    const n = typeof t === 'number' ? t : parseFloat(String(t));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export function pickShortZone(
  analysis: AnalyzeResponse,
  eng: EngineSlice,
  ch: { index: number }
): { low: number; high: number } | null {
  const nro = analysis.nearestResistanceOb;
  if (nro && nro.high > nro.low) return { low: nro.low, high: nro.high };
  const obs = eng.obs ?? [];
  const bear = obs
    .filter((o) => o.bias === 'bearish' && o.index <= ch.index)
    .sort((a, b) => b.index - a.index)[0];
  if (bear && bear.high > bear.low) return { low: bear.low, high: bear.high };
  const fvgs = (eng.fvg ?? []).filter((f) => f.bias === 'bearish' && f.valid && f.index <= ch.index);
  const f = fvgs.sort((a, b) => b.index - a.index)[0];
  if (f && f.high > f.low) return { low: f.low, high: f.high };
  return null;
}

export function pickLongZone(
  analysis: AnalyzeResponse,
  eng: EngineSlice,
  ch: { index: number }
): { low: number; high: number } | null {
  const nso = analysis.nearestSupportOb;
  if (nso && nso.high > nso.low) return { low: nso.low, high: nso.high };
  const obs = eng.obs ?? [];
  const bull = obs
    .filter((o) => o.bias === 'bullish' && o.index <= ch.index)
    .sort((a, b) => b.index - a.index)[0];
  if (bull && bull.high > bull.low) return { low: bull.low, high: bull.high };
  const fvgs = (eng.fvg ?? []).filter((f) => f.bias === 'bullish' && f.valid && f.index <= ch.index);
  const f = fvgs.sort((a, b) => b.index - a.index)[0];
  if (f && f.high > f.low) return { low: f.low, high: f.high };
  return null;
}

export function targetForShort(analysis: AnalyzeResponse, lastClose: number): number | null {
  const sl = analysis.supportLevel?.price;
  if (typeof sl === 'number' && Number.isFinite(sl) && sl < lastClose) return sl;
  const ts = numTargets(analysis).filter((t) => t < lastClose);
  return ts.length ? Math.max(...ts) : null;
}

export function targetForLong(analysis: AnalyzeResponse, lastClose: number): number | null {
  const rl = analysis.resistanceLevel?.price;
  if (typeof rl === 'number' && Number.isFinite(rl) && rl > lastClose) return rl;
  const ts = numTargets(analysis).filter((t) => t > lastClose);
  return ts.length ? Math.min(...ts) : null;
}

function dedupePriceLevels(sorted: number[], ref: number): number[] {
  const eps = Math.max(1e-8, ref * 1e-9);
  const out: number[] = [];
  for (const p of sorted) {
    if (!out.some((u) => Math.abs(u - p) <= eps * Math.max(1, Math.abs(p)))) out.push(p);
  }
  return out;
}

/**
 * 롱: 현재가 위쪽 목표 후보를 가까운 순 TP1~3 (분석 targets + 저항 후보).
 * 비어 있으면 `targetForLong` 단일값으로 TP1만 채움.
 */
export function tieredTargetsLong(
  analysis: AnalyzeResponse,
  lastClose: number
): { levels: [number | null, number | null, number | null]; sourceNote: string } {
  const raw: number[] = [];
  const rl = analysis.resistanceLevel?.price;
  if (typeof rl === 'number' && Number.isFinite(rl) && rl > lastClose) raw.push(rl);
  for (const t of numTargets(analysis)) {
    if (t > lastClose) raw.push(t);
  }
  raw.sort((a, b) => a - b);
  let uniq = dedupePriceLevels(raw, lastClose);
  if (!uniq.length) {
    const one = targetForLong(analysis, lastClose);
    if (one != null) uniq = [one];
  }
  const levels: [number | null, number | null, number | null] = [
    uniq[0] ?? null,
    uniq[1] ?? null,
    uniq[2] ?? null,
  ];
  const sourceNote =
    uniq.length > 1
      ? '플레이북 TP1~3: 분석 targets·저항 후보를 현재가 위로 가까운 순. 차트 ls-plan(C/SL/TP)은 시그널·computeTradePlan 별도.'
      : uniq.length === 1
        ? '플레이북 TP1: 분석 목표·저항 근사. ls-plan 라벨과 숫자가 다를 수 있음(별도 엔진).'
        : '목표 후보 없음.';
  return { levels, sourceNote };
}

/**
 * 숏: 현재가 아래쪽 목표 후보를 가까운 순 TP1~3.
 */
export function tieredTargetsShort(
  analysis: AnalyzeResponse,
  lastClose: number
): { levels: [number | null, number | null, number | null]; sourceNote: string } {
  const raw: number[] = [];
  const sl = analysis.supportLevel?.price;
  if (typeof sl === 'number' && Number.isFinite(sl) && sl < lastClose) raw.push(sl);
  for (const t of numTargets(analysis)) {
    if (t < lastClose) raw.push(t);
  }
  raw.sort((a, b) => b - a);
  let uniq = dedupePriceLevels(raw, lastClose);
  if (!uniq.length) {
    const one = targetForShort(analysis, lastClose);
    if (one != null) uniq = [one];
  }
  const levels: [number | null, number | null, number | null] = [
    uniq[0] ?? null,
    uniq[1] ?? null,
    uniq[2] ?? null,
  ];
  const sourceNote =
    uniq.length > 1
      ? '플레이북 TP1~3: 분석 targets·지지 후보를 현재가 아래로 가까운 순. ls-plan은 별도.'
      : uniq.length === 1
        ? '플레이북 TP1: 분석 목표·지지 근사. ls-plan과 다를 수 있음.'
        : '목표 후보 없음.';
  return { levels, sourceNote };
}

export function mitigationInZone(last: Candle, z: { low: number; high: number } | null): boolean {
  if (!z || z.high <= z.low) return false;
  return last.low <= z.high && last.high >= z.low;
}

/** 타점 OB/FVG 밴드 중앙 — 진입 참고 가격(교육용) */
export function zoneMid(zone: { low: number; high: number } | null): number | null {
  if (!zone || zone.high <= zone.low) return null;
  return (zone.low + zone.high) / 2;
}

/** 숏: 존 상단·스윕 고점 위 + 패딩 — 시나리오 무효화 근사(교육용) */
export function approxStopShort(
  zone: { low: number; high: number } | null,
  sweep: { price: number } | null,
  atr: number
): number | null {
  if (!zone || zone.high <= zone.low) return null;
  const pad = Math.max(atr * 0.22, (zone.high - zone.low) * 0.12);
  const structural = Math.max(zone.high, sweep?.price ?? zone.high);
  return structural + pad;
}

/** 롱: 존 하단·스윕 저점 아래 — 시나리오 무효화 근사(교육용) */
export function approxStopLong(
  zone: { low: number; high: number } | null,
  sweep: { price: number } | null,
  atr: number
): number | null {
  if (!zone || zone.high <= zone.low) return null;
  const pad = Math.max(atr * 0.22, (zone.high - zone.low) * 0.12);
  const structural = Math.min(zone.low, sweep?.price ?? zone.low);
  return structural - pad;
}
