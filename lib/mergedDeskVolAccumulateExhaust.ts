/**
 * 통합모드 빅롱/빅숏 — 거래량 모집·소진 게이트.
 * 모집 후 상승 → 빅롱 / 클라이맥스 후 소진 → 빅숏.
 * TF별 모집·소진 창 + WATCH(조용한 축적) 프로브.
 */
import type { Candle } from '@/types';
import { normalizeChartTimeframe } from '@/lib/constants';
import { smaTotalVolumeAt } from '@/lib/volumeHistogramIntelligence';
import { estimateBarBuySell } from '@/lib/volumeDirectionStats';

function avgVol(rows: Candle[], from: number, to: number): number {
  let s = 0;
  let c = 0;
  for (let i = from; i <= to; i++) {
    const v = Math.max(0, Number(rows[i]?.volume) || 0);
    if (v > 0) {
      s += v;
      c += 1;
    }
  }
  return c > 0 ? s / c : 0;
}

function rvolAt(rows: Candle[], i: number, period: number): number | null {
  if (i < period - 1) return null;
  const sma = smaTotalVolumeAt(rows, i, period);
  const v = Math.max(0, Number(rows[i]?.volume) || 0);
  if (!(sma > 0)) return null;
  return v / sma;
}

function closePosInRange(c: Candle): number | null {
  const hi = Number(c.high);
  const lo = Number(c.low);
  const cl = Number(c.close);
  if (![hi, lo, cl].every(Number.isFinite) || hi <= lo) return null;
  return (cl - lo) / (hi - lo);
}

function bodyRatio(c: Candle): number | null {
  const hi = Number(c.high);
  const lo = Number(c.low);
  const o = Number(c.open);
  const cl = Number(c.close);
  if (![hi, lo, o, cl].every(Number.isFinite) || hi <= lo) return null;
  return Math.abs(cl - o) / (hi - lo);
}

/** TF별 모집(축적) 창 — 확정 기준 봉 수 */
export function volAccumulateWindowBars(timeframe?: string, early?: boolean): number {
  const tf = normalizeChartTimeframe(timeframe ?? '15m');
  const confirmed: Record<string, number> = {
    '1m': 20,
    '3m': 16,
    '5m': 18,
    '15m': 20,
    '1h': 24,
    '4h': 22,
    '1d': 20,
    '1w': 14,
    '1M': 10,
  };
  const base = confirmed[tf] ?? 16;
  const n = early ? Math.round(base * 0.75) : base;
  return Math.max(8, Math.min(36, n));
}

/** TF별 소진(클라이맥스→마름) 창 */
export function volExhaustWindowBars(timeframe?: string, early?: boolean): number {
  const tf = normalizeChartTimeframe(timeframe ?? '15m');
  const confirmed: Record<string, number> = {
    '1m': 22,
    '3m': 18,
    '5m': 20,
    '15m': 22,
    '1h': 26,
    '4h': 24,
    '1d': 22,
    '1w': 16,
    '1M': 12,
  };
  const base = confirmed[tf] ?? 18;
  const n = early ? Math.round(base * 0.75) : base;
  return Math.max(8, Math.min(40, n));
}

/** 추세 확인 창 */
export function volTrendConfirmBars(timeframe?: string, early?: boolean): number {
  const win = volAccumulateWindowBars(timeframe, early);
  return Math.max(4, Math.min(16, Math.round(win * 0.45)));
}

function buildLowInWindow(
  rows: Candle[],
  from: number,
  to: number
): { idx: number; price: number } {
  let idx = from;
  let price = Number(rows[from]?.low) || 0;
  for (let k = from; k <= to; k++) {
    const lv = Number(rows[k]?.low);
    if (Number.isFinite(lv) && lv < price) {
      price = lv;
      idx = k;
    }
  }
  return { idx, price };
}

function buildHighInWindow(
  rows: Candle[],
  from: number,
  to: number
): { idx: number; price: number } {
  let idx = from;
  let price = Number(rows[from]?.high) || 0;
  for (let k = from; k <= to; k++) {
    const hv = Number(rows[k]?.high);
    if (Number.isFinite(hv) && hv > price) {
      price = hv;
      idx = k;
    }
  }
  return { idx, price };
}

/** 거래량 모집(축적) 후 확장 */
export function volumeAccumulationOk(
  rows: Candle[],
  i: number,
  period: number,
  early: boolean,
  timeframe?: string
): { ok: boolean; buildAvg: number; expandRatio: number; from: number; buildLow: number; buildLowIdx: number } {
  const win = volAccumulateWindowBars(timeframe, early);
  const from = Math.max(0, i - win);
  const empty = { ok: false, buildAvg: 0, expandRatio: 0, from, buildLow: 0, buildLowIdx: from };
  if (i - from < Math.max(4, Math.floor(win * 0.35))) return empty;
  const buildEnd = i - 1;
  const buildAvg = avgVol(rows, from, buildEnd);
  const cur = Math.max(0, Number(rows[i]?.volume) || 0);
  if (!(buildAvg > 0) || !(cur > 0)) return empty;
  const expandRatio = cur / buildAvg;
  const sma = smaTotalVolumeAt(rows, i, period);
  const quietBuild = !(sma > 0) || buildAvg <= sma * (early ? 1.18 : 1.08);
  const expandMin = early ? 1.4 : 1.7;
  let risingStack = 0;
  for (let k = from + 1; k <= buildEnd; k++) {
    if ((Number(rows[k]?.volume) || 0) >= (Number(rows[k - 1]?.volume) || 0) * 0.92) risingStack += 1;
  }
  const stacking = risingStack >= Math.floor((buildEnd - from) * 0.35);
  const ok = quietBuild && expandRatio >= expandMin && (stacking || expandRatio >= expandMin + 0.3);
  const lo = buildLowInWindow(rows, from, buildEnd);
  return {
    ok,
    buildAvg,
    expandRatio,
    from,
    buildLow: lo.price,
    buildLowIdx: lo.idx,
  };
}

/**
 * WATCH — 확장 전 “조용한 모집” 진행 중 (선반영 예고).
 * 확정 신호 아님. 무효화 = 모집 저점 이탈.
 */
export function volumeQuietBuildProbe(
  rows: Candle[],
  i: number,
  period: number,
  timeframe?: string
): {
  ok: boolean;
  buildAvg: number;
  from: number;
  buildLow: number;
  buildLowIdx: number;
  stacking: boolean;
} {
  const win = volAccumulateWindowBars(timeframe, true);
  const from = Math.max(0, i - win);
  const empty = {
    ok: false,
    buildAvg: 0,
    from,
    buildLow: 0,
    buildLowIdx: from,
    stacking: false,
  };
  if (i - from < Math.max(5, Math.floor(win * 0.4))) return empty;
  const buildEnd = i;
  const buildAvg = avgVol(rows, from, buildEnd);
  const sma = smaTotalVolumeAt(rows, i, period);
  if (!(buildAvg > 0)) return empty;
  const quiet = !(sma > 0) || buildAvg <= sma * 1.12;
  let risingStack = 0;
  for (let k = from + 1; k <= buildEnd; k++) {
    if ((Number(rows[k]?.volume) || 0) >= (Number(rows[k - 1]?.volume) || 0) * 0.9) risingStack += 1;
  }
  const stacking = risingStack >= Math.floor((buildEnd - from) * 0.3);
  const lo = buildLowInWindow(rows, from, buildEnd);
  /** 가격이 모집 저점 근처~중간 (이미 폭등 중이면 WATCH 아님) */
  const mid = (Number(rows[i]!.high) + lo.price) / 2;
  const nearBase = Number(rows[i]!.close) <= mid * 1.015 || Number(rows[i]!.close) <= lo.price * 1.04;
  /** 폭락·고점소진 직후 마른 거래량을 모집으로 오인 금지 */
  if (ladderLongBlockedByDump(rows, i, period)) {
    return { ok: false, buildAvg, from, buildLow: lo.price, buildLowIdx: lo.idx, stacking };
  }
  const ok = quiet && stacking && nearBase;
  return { ok, buildAvg, from, buildLow: lo.price, buildLowIdx: lo.idx, stacking };
}

/**
 * WATCH 숏 — 클라이맥스 직후 거래량 마름 진행 (확장/확정 전).
 */
export function volumeQuietExhaustProbe(
  rows: Candle[],
  i: number,
  period: number,
  timeframe?: string
): {
  ok: boolean;
  peakVol: number;
  peakIdx: number;
  dryRatio: number;
  from: number;
  buildHigh: number;
  buildHighIdx: number;
} {
  const win = volExhaustWindowBars(timeframe, true);
  const from = Math.max(0, i - win);
  const empty = {
    ok: false,
    peakVol: 0,
    peakIdx: from,
    dryRatio: 1,
    from,
    buildHigh: 0,
    buildHighIdx: from,
  };
  if (i - from < Math.max(5, Math.floor(win * 0.35))) return empty;
  let peakVol = 0;
  let peakIdx = from;
  for (let k = from; k <= i; k++) {
    const v = Math.max(0, Number(rows[k]?.volume) || 0);
    if (v >= peakVol) {
      peakVol = v;
      peakIdx = k;
    }
  }
  const cur = Math.max(0, Number(rows[i]?.volume) || 0);
  if (!(peakVol > 0)) return empty;
  const dryRatio = cur / peakVol;
  const peakRv = rvolAt(rows, peakIdx, period) ?? 1;
  const hadClimax = peakRv >= 1.25 || peakVol >= avgVol(rows, from, i) * 1.45;
  const drying = dryRatio <= 0.88 && peakIdx < i;
  const hi = buildHighInWindow(rows, from, i);
  const nearTop = Number(rows[i]!.close) >= hi.price * 0.97;
  const ok = hadClimax && drying && nearTop;
  return {
    ok,
    peakVol,
    peakIdx,
    dryRatio,
    from,
    buildHigh: hi.price,
    buildHighIdx: hi.idx,
  };
}

/** SETUP 롱 — 모집 + 저점유지·수급 정렬 (확장 직전) */
export function volumeSetupLongOk(
  rows: Candle[],
  i: number,
  period: number,
  timeframe?: string
): { ok: boolean; buildLow: number; buildLowIdx: number; from: number } {
  const probe = volumeQuietBuildProbe(rows, i, period, timeframe);
  if (!probe.ok) return { ok: false, buildLow: 0, buildLowIdx: i, from: i };
  const look = volTrendConfirmBars(timeframe, true);
  const from = Math.max(probe.from, i - look);
  let hl = 0;
  for (let k = from + 1; k <= i; k++) {
    if (Number(rows[k]!.low) >= Number(rows[k - 1]!.low) * 0.998) hl += 1;
  }
  const sp = Number(rows[i]!.close) >= Number(rows[i]!.open) * 0.999;
  const pos = closePosInRange(rows[i]!);
  const buyish = sp || (pos != null && pos >= 0.45);
  /** 아직 풀확장 전 — TRIGGER와 구분 */
  const acc = volumeAccumulationOk(rows, i, period, true, timeframe);
  const notTriggered = !acc.ok || acc.expandRatio < 1.55;
  const holdLow = Number(rows[i]!.close) > probe.buildLow * 0.999;
  const ok = buyish && holdLow && notTriggered && hl >= Math.ceil(look * 0.35);
  return { ok, buildLow: probe.buildLow, buildLowIdx: probe.buildLowIdx, from: probe.from };
}

/** SETUP 숏 — 소진 + 고점거부 정렬 */
export function volumeSetupShortOk(
  rows: Candle[],
  i: number,
  period: number,
  timeframe?: string
): { ok: boolean; buildHigh: number; buildHighIdx: number; from: number } {
  const probe = volumeQuietExhaustProbe(rows, i, period, timeframe);
  if (!probe.ok) return { ok: false, buildHigh: 0, buildHighIdx: i, from: i };
  const c = rows[i]!;
  const pos = closePosInRange(c);
  const bearish = Number(c.close) <= Number(c.open) * 1.002 || (pos != null && pos <= 0.55);
  const holdHigh = Number(c.close) < probe.buildHigh * 1.001;
  const ex = volumeExhaustionOk(rows, i, period, true, timeframe);
  const notTriggered = !ex.ok || ex.dryRatio > 0.72;
  const ok = bearish && holdHigh && notTriggered && probe.dryRatio <= 0.85;
  return { ok, buildHigh: probe.buildHigh, buildHighIdx: probe.buildHighIdx, from: probe.from };
}

/** 모집 이후 상승추세 */
export function uptrendAfterBuildOk(
  rows: Candle[],
  i: number,
  early: boolean,
  timeframe?: string
): boolean {
  const look = volTrendConfirmBars(timeframe, early);
  const from = Math.max(0, i - look);
  const c = rows[i]!;
  const a = rows[from]!;
  if (!(a.close > 0)) return false;
  const slope = ((Number(c.close) - Number(a.close)) / Number(a.close)) * 100;
  if (slope < (early ? 0.08 : 0.15)) return false;
  let hl = 0;
  for (let k = from + 1; k <= i; k++) {
    if (Number(rows[k]!.low) >= Number(rows[k - 1]!.low) * 0.9985) hl += 1;
  }
  const bullBar = Number(c.close) >= Number(c.open) * 0.999;
  return bullBar && (hl >= Math.ceil(look * 0.4) || slope >= (early ? 0.25 : 0.4));
}

/** 클라이맥스 후 거래량 소진 */
export function volumeExhaustionOk(
  rows: Candle[],
  i: number,
  period: number,
  early: boolean,
  timeframe?: string
): { ok: boolean; peakVol: number; dryRatio: number; from: number; buildHigh: number; buildHighIdx: number } {
  const win = volExhaustWindowBars(timeframe, early);
  const from = Math.max(0, i - win);
  const empty = { ok: false, peakVol: 0, dryRatio: 0, from, buildHigh: 0, buildHighIdx: from };
  if (i - from < Math.max(4, Math.floor(win * 0.3))) return empty;
  let peakVol = 0;
  let peakIdx = from;
  for (let k = from; k < i; k++) {
    const v = Math.max(0, Number(rows[k]?.volume) || 0);
    if (v >= peakVol) {
      peakVol = v;
      peakIdx = k;
    }
  }
  const cur = Math.max(0, Number(rows[i]?.volume) || 0);
  if (!(peakVol > 0)) return empty;
  const dryRatio = cur / peakVol;
  const peakRv = rvolAt(rows, peakIdx, period) ?? 1;
  const hadClimax = peakRv >= (early ? 1.35 : 1.55) || peakVol >= avgVol(rows, from, i) * 1.6;
  const drying = dryRatio <= (early ? 0.78 : 0.65) || (i - peakIdx <= 2 && dryRatio <= 0.9);
  const c = rows[i]!;
  const pos = closePosInRange(c);
  const bearish = Number(c.close) <= Number(c.open) * 1.002 || (pos != null && pos <= 0.45);
  const hi = buildHighInWindow(rows, from, i);
  return {
    ok: hadClimax && drying && bearish,
    peakVol,
    dryRatio,
    from,
    buildHigh: hi.price,
    buildHighIdx: hi.idx,
  };
}

export function downtrendOrRejectOk(
  rows: Candle[],
  i: number,
  early: boolean,
  timeframe?: string
): boolean {
  const look = Math.max(3, Math.min(10, Math.round(volTrendConfirmBars(timeframe, early) * 0.7)));
  const from = Math.max(0, i - look);
  const c = rows[i]!;
  const a = rows[from]!;
  if (!(a.close > 0)) return false;
  const slope = ((Number(c.close) - Number(a.close)) / Number(a.close)) * 100;
  const rng = Math.max(1e-9, Number(c.high) - Number(c.low));
  const upper = Number(c.high) - Math.max(Number(c.open), Number(c.close));
  const reject = upper / rng >= 0.28;
  return slope <= (early ? 0.05 : -0.05) || reject;
}

/** 로컬 구조 바이어스 (상위TF 없을 때 선반영 필터) */
export function localStructureBias(
  rows: Candle[],
  i: number,
  timeframe?: string
): 'bull' | 'bear' | 'neutral' {
  const look = Math.max(12, Math.min(40, volAccumulateWindowBars(timeframe, false)));
  const from = Math.max(0, i - look);
  const a = rows[from]!;
  const c = rows[i]!;
  if (!(a.close > 0)) return 'neutral';
  const slope = ((Number(c.close) - Number(a.close)) / Number(a.close)) * 100;
  let hh = 0;
  let ll = 0;
  for (let k = from + 2; k <= i; k++) {
    if (Number(rows[k]!.high) >= Number(rows[k - 2]!.high)) hh += 1;
    if (Number(rows[k]!.low) <= Number(rows[k - 2]!.low)) ll += 1;
  }
  if (slope >= 0.35 && hh >= ll) return 'bull';
  if (slope <= -0.35 && ll >= hh) return 'bear';
  return 'neutral';
}

/**
 * 최근 테이프 — 폭락/급락 중이면 롱 예고·준비를 막기 위한 짧은 창 바이어스.
 * (긴 lookback이 상승 잔상을 남기는 문제 보정)
 */
export function recentTapeBias(rows: Candle[], i: number, bars = 6): 'bull' | 'bear' | 'neutral' {
  const from = Math.max(0, i - Math.max(3, bars));
  const a = rows[from]!;
  const c = rows[i]!;
  if (!(a.close > 0)) return 'neutral';
  const slope = ((Number(c.close) - Number(a.close)) / Number(a.close)) * 100;
  let downBars = 0;
  let upBars = 0;
  for (let k = from; k <= i; k++) {
    if (Number(rows[k]!.close) < Number(rows[k]!.open)) downBars += 1;
    else if (Number(rows[k]!.close) > Number(rows[k]!.open)) upBars += 1;
  }
  if (slope <= -0.12 || (slope < 0 && downBars >= upBars + 1)) return 'bear';
  if (slope >= 0.12 || (slope > 0 && upBars >= downBars + 1)) return 'bull';
  return 'neutral';
}

/** 고점소진·스윕·급락 직후 — 롱 레더 금지 */
export function ladderLongBlockedByDump(
  rows: Candle[],
  i: number,
  period: number
): boolean {
  if (recentTapeBias(rows, i, 6) === 'bear') return true;
  const from = Math.max(0, i - 10);
  let peakRv = 0;
  let peakIdx = from;
  let peakHi = 0;
  for (let k = from; k <= i; k++) {
    const rv = rvolAt(rows, k, period) ?? 0;
    if (rv >= peakRv) {
      peakRv = rv;
      peakIdx = k;
    }
    peakHi = Math.max(peakHi, Number(rows[k]!.high));
  }
  const cur = rows[i]!;
  const dumped =
    peakRv >= 1.45 &&
    Number(cur.close) < peakHi * 0.997 &&
    (Number(cur.close) < Number(rows[peakIdx]!.close) || recentTapeBias(rows, i, 4) === 'bear');
  if (dumped) return true;
  /** 연속 LL */
  let ll = 0;
  for (let k = Math.max(1, i - 4); k <= i; k++) {
    if (Number(rows[k]!.low) < Number(rows[k - 1]!.low) * 0.9995) ll += 1;
  }
  return ll >= 3;
}

export function candleConfluenceBoost(
  c: Candle,
  side: 'long' | 'short'
): { boost: number; noteKo: string } {
  const body = bodyRatio(c);
  const pos = closePosInRange(c);
  const rng = Math.max(1e-9, Number(c.high) - Number(c.low));
  const upper = Number(c.high) - Math.max(Number(c.open), Number(c.close));
  const lower = Math.min(Number(c.open), Number(c.close)) - Number(c.low);
  if (side === 'long') {
    if (lower / rng >= 0.45 && Number(c.close) >= Number(c.open)) {
      return { boost: 6, noteKo: '핀바반등' };
    }
    if (body != null && body >= 0.55 && Number(c.close) > Number(c.open) && (pos == null || pos >= 0.6)) {
      return { boost: 5, noteKo: '장악양봉' };
    }
    return { boost: 0, noteKo: '' };
  }
  if (upper / rng >= 0.45 && Number(c.close) <= Number(c.open)) {
    return { boost: 6, noteKo: '슈팅스타' };
  }
  if (body != null && body >= 0.55 && Number(c.close) < Number(c.open) && (pos == null || pos <= 0.4)) {
    return { boost: 5, noteKo: '장악음봉' };
  }
  return { boost: 0, noteKo: '' };
}

/** 모집/소진 구간 라벨용 피크 인덱스 */
export function findVolumeBuildAndExhaustSpans(
  candles: Candle[],
  opts?: { lookback?: number; rvolPeriod?: number; timeframe?: string }
): Array<{
  kind: 'vol-build' | 'vol-exhaust' | 'wave-up' | 'candle-pin' | 'candle-shoot';
  displayKo: string;
  labelKo: string;
  peakIdx: number;
  startIdx: number;
  endIdx: number;
  color: string;
}> {
  const n = candles.length;
  if (n < 30) return [];
  const lookback = Math.max(40, Math.min(120, opts?.lookback ?? 80));
  const period = Math.max(8, Math.min(40, opts?.rvolPeriod ?? 20));
  const tf = opts?.timeframe;
  const buildWin = volAccumulateWindowBars(tf, false);
  const from = Math.max(period, n - lookback);
  const out: Array<{
    kind: 'vol-build' | 'vol-exhaust' | 'wave-up' | 'candle-pin' | 'candle-shoot';
    displayKo: string;
    labelKo: string;
    peakIdx: number;
    startIdx: number;
    endIdx: number;
    color: string;
  }> = [];

  for (let i = Math.min(n - 2, from + buildWin); i <= n - 2; i++) {
    const acc = volumeAccumulationOk(candles, i, period, false, tf);
    if (!acc.ok) continue;
    const start = Math.max(from, acc.from);
    out.push({
      kind: 'vol-build',
      displayKo: '거래량모집',
      labelKo: '거래량 모집(축적) 후 확장',
      peakIdx: Math.floor((start + i - 1) / 2),
      startIdx: start,
      endIdx: i - 1,
      color: 'rgba(148,163,184,0.95)',
    });
    break;
  }

  for (let i = n - 2; i >= Math.max(from + 8, n - 48); i--) {
    const ex = volumeExhaustionOk(candles, i, period, false, tf);
    if (!ex.ok) continue;
    out.push({
      kind: 'vol-exhaust',
      displayKo: '거래량소진',
      labelKo: '클라이맥스 후 거래량 소진',
      peakIdx: i,
      startIdx: Math.max(from, ex.from),
      endIdx: i,
      color: 'rgba(251,146,60,0.95)',
    });
    break;
  }

  {
    let hl = 0;
    const end = n - 2;
    const start = Math.max(from, end - Math.max(8, Math.round(buildWin * 0.5)));
    for (let k = start + 1; k <= end; k++) {
      if (Number(candles[k]!.low) >= Number(candles[k - 1]!.low) * 0.999) hl += 1;
    }
    if (hl >= 5 && Number(candles[end]!.close) > Number(candles[start]!.close)) {
      out.push({
        kind: 'wave-up',
        displayKo: '파동상승',
        labelKo: '저점 상향 파동',
        peakIdx: peakVolIdx(candles, start, end),
        startIdx: start,
        endIdx: end,
        color: 'rgba(56,189,248,0.9)',
      });
    }
  }

  for (let i = n - 2; i >= Math.max(from, n - 24); i--) {
    const pin = candleConfluenceBoost(candles[i]!, 'long');
    if (pin.noteKo === '핀바반등') {
      out.push({
        kind: 'candle-pin',
        displayKo: '핀바반등',
        labelKo: '하단 핀바 반등 캔들',
        peakIdx: i,
        startIdx: i,
        endIdx: i,
        color: 'rgba(52,211,153,0.95)',
      });
      break;
    }
  }
  for (let i = n - 2; i >= Math.max(from, n - 24); i--) {
    const sh = candleConfluenceBoost(candles[i]!, 'short');
    if (sh.noteKo === '슈팅스타') {
      out.push({
        kind: 'candle-shoot',
        displayKo: '슈팅스타',
        labelKo: '고점 슈팅스타 캔들',
        peakIdx: i,
        startIdx: i,
        endIdx: i,
        color: 'rgba(248,113,113,0.95)',
      });
      break;
    }
  }

  return out.slice(0, 4);
}

function peakVolIdx(rows: Candle[], from: number, to: number): number {
  let best = from;
  let bestV = -1;
  for (let i = from; i <= to; i++) {
    const v = Math.max(0, Number(rows[i]?.volume) || 0);
    if (v >= bestV) {
      bestV = v;
      best = i;
    }
  }
  return best;
}

/** 거래량 패널용 모집/소진/폭락/폭등 존 — TF 창 길이 기준. 기존 막대·라벨과 별도 추가 */
export type VolumePhaseFlowSide = 'buy' | 'sell' | 'neutral';

export type VolumePhaseZone = {
  kind: 'accumulate' | 'exhaust' | 'climax' | 'dump' | 'surge';
  displayKo: string;
  labelKo: string;
  startIdx: number;
  endIdx: number;
  startTime: number;
  endTime: number;
  color: string;
  borderColor: string;
  score: number;
  /** 모집 직후 확장·폭등 연결 시 */
  afterAccumulate?: boolean;
  peakRvol?: number;
  /** 매수/매도 방향 (모집·확장 zone 자체는 유지, 방향만 추가) */
  flowSide?: VolumePhaseFlowSide;
  buyPct?: number;
  /** 분석용 부가 라벨 — displayKo(모집/확장)는 바꾸지 않음 */
  directionKo?: string;
};

/** 존 박스·마커 표시: 모집/확장 유지 + 방향만 붙임 (모집·매수) */
export function volumePhaseZoneLabel(z: VolumePhaseZone): string {
  const base = String(z.displayKo || '').trim() || (z.kind === 'accumulate' ? '모집' : z.kind === 'climax' ? '확장' : '');
  if (!base) return String(z.displayKo || '');
  if (z.kind !== 'accumulate' && z.kind !== 'climax') return base;
  if (z.flowSide === 'buy') return `${base}·매수`;
  if (z.flowSide === 'sell') return `${base}·매도`;
  return base;
}

/** 구간 수급·가격으로 매수/매도 방향 */
export function analyzeZoneFlowSide(
  rows: Candle[],
  from: number,
  to: number
): { side: VolumePhaseFlowSide; buyPct: number; slopePct: number } {
  const a = Math.max(0, from);
  const b = Math.min(rows.length - 1, to);
  if (b < a) return { side: 'neutral', buyPct: 0.5, slopePct: 0 };
  let buy = 0;
  let sell = 0;
  let upBars = 0;
  let dnBars = 0;
  for (let i = a; i <= b; i++) {
    const sp = estimateBarBuySell(rows[i]!);
    buy += Math.max(0, sp.buyVol);
    sell += Math.max(0, sp.sellVol);
    if (Number(rows[i]!.close) >= Number(rows[i]!.open)) upBars += 1;
    else dnBars += 1;
  }
  const tot = buy + sell;
  const buyPct = tot > 0 ? buy / tot : 0.5;
  const c0 = Number(rows[a]!.close);
  const c1 = Number(rows[b]!.close);
  const slopePct = c0 > 0 ? ((c1 - c0) / c0) * 100 : 0;
  let side: VolumePhaseFlowSide = 'neutral';
  if (buyPct >= 0.55 || (buyPct >= 0.52 && slopePct >= 0.08) || (slopePct >= 0.25 && upBars >= dnBars)) {
    side = 'buy';
  } else if (
    buyPct <= 0.45 ||
    (buyPct <= 0.48 && slopePct <= -0.08) ||
    (slopePct <= -0.25 && dnBars >= upBars)
  ) {
    side = 'sell';
  }
  return { side, buyPct, slopePct };
}

/**
 * 모집/확장 zone의 displayKo·색·점수는 그대로 두고,
 * flowSide·directionKo·label 상세만 추가.
 */
function applyFlowSideToZone(
  z: VolumePhaseZone,
  rows: Candle[],
  kind: 'accumulate' | 'climax'
): VolumePhaseZone {
  const flow = analyzeZoneFlowSide(rows, z.startIdx, z.endIdx);
  const bp = Math.round(flow.buyPct * 100);
  const baseLabel = String(z.labelKo || '').trim();
  const sideDetail =
    flow.side === 'buy'
      ? `방향 매수 · 매수비중 ${bp}% · 기울기 ${flow.slopePct.toFixed(2)}%`
      : flow.side === 'sell'
        ? `방향 매도 · 매수비중 ${bp}% · 기울기 ${flow.slopePct.toFixed(2)}%`
        : `방향 중립 · 매수비중 ${bp}%`;

  if (kind === 'accumulate') {
    const directionKo =
      flow.side === 'buy' ? '매수모집' : flow.side === 'sell' ? '매도모집' : undefined;
    return {
      ...z,
      displayKo: z.displayKo || '모집',
      flowSide: flow.side,
      buyPct: flow.buyPct,
      directionKo,
      labelKo: baseLabel ? `${baseLabel} · ${sideDetail}` : `모집 · ${sideDetail}`,
    };
  }

  const directionKo =
    flow.side === 'buy' ? '매수확장' : flow.side === 'sell' ? '매도확장' : undefined;
  return {
    ...z,
    displayKo: z.displayKo || '확장',
    flowSide: flow.side,
    buyPct: flow.buyPct,
    directionKo,
    labelKo: baseLabel ? `${baseLabel} · ${sideDetail}` : `확장 · ${sideDetail}`,
  };
}

/**
 * 보이는 거래량 구간에서 TF별 모집·확장·폭등·폭락 존을 여러 개 탐지.
 * 모집 후 롱빔(고RVOL 상승) = 폭등 우선.
 */
export function detectVolumePhaseZones(
  candles: Candle[],
  opts?: { lookback?: number; rvolPeriod?: number; timeframe?: string; maxZones?: number }
): VolumePhaseZone[] {
  const n = candles.length;
  if (n < 24) return [];
  const tf = opts?.timeframe;
  const period = Math.max(8, Math.min(40, opts?.rvolPeriod ?? 20));
  const buildWin = volAccumulateWindowBars(tf, false);
  const lookback = Math.max(
    buildWin * 3,
    Math.min(260, opts?.lookback ?? Math.max(120, buildWin * 6))
  );
  const maxZones = Math.max(4, Math.min(8, opts?.maxZones ?? 6));
  const from = Math.max(period, n - lookback);
  const minAcc = Math.max(8, Math.floor(buildWin * 0.75));
  const minHot = 2;

  const quiet: boolean[] = new Array(n).fill(false);
  const hot: boolean[] = new Array(n).fill(false);
  const rvolArr: number[] = new Array(n).fill(0);
  for (let i = from; i < n; i++) {
    const sma = smaTotalVolumeAt(candles, i, period);
    const v = Math.max(0, Number(candles[i]?.volume) || 0);
    if (!(sma > 0) || !(v > 0)) continue;
    const rv = v / sma;
    rvolArr[i] = rv;
    quiet[i] = rv <= 1.12;
    /** 고거래량·RVOL 상승 — 짧은 롱빔도 잡기 */
    hot[i] = rv >= 1.35;
  }

  const coalesce = (
    mask: boolean[],
    minLen: number,
    kind: VolumePhaseZone['kind'],
    displayKo: string,
    labelKo: string,
    color: string,
    borderColor: string
  ): VolumePhaseZone[] => {
    const spans: VolumePhaseZone[] = [];
    let s = -1;
    for (let i = from; i <= n; i++) {
      const on = i < n && mask[i];
      if (on && s < 0) s = i;
      if ((!on || i === n) && s >= 0) {
        const e = i - 1;
        const peak = peakVolIdx(candles, s, e);
        const peakRv = rvolArr[peak] || (rvolAt(candles, peak, period) ?? 1);
        /** 극단 RVOL은 2봉만 있어도 구간으로 인정 */
        const lenOk = e - s + 1 >= minLen || (peakRv >= 2 && e - s + 1 >= 2) || peakRv >= 2.4;
        if (lenOk) {
          const st = Number(candles[s]!.time);
          const et = Number(candles[e]!.time);
          const avg = avgVol(candles, s, e);
          const sma = smaTotalVolumeAt(candles, e, period) || avg;
          const score =
            (e - s + 1) * 2 +
            (kind === 'accumulate' ? Math.max(0, 12 - (avg / Math.max(1e-9, sma)) * 8) : 0) +
            (kind !== 'accumulate' ? peakRv * 8 : 0);
          spans.push({
            kind,
            displayKo,
            labelKo,
            startIdx: s,
            endIdx: e,
            startTime: st,
            endTime: et,
            color,
            borderColor,
            score,
            peakRvol: peakRv,
          });
        }
        s = -1;
      }
    }
    return spans;
  };

  const classifyHotZone = (z: VolumePhaseZone): VolumePhaseZone => {
    const s = z.startIdx;
    const e = z.endIdx;
    const startPx = Number(candles[s]!.close);
    const endPx = Number(candles[e]!.close);
    const peak = peakVolIdx(candles, s, e);
    const peakRv = z.peakRvol ?? rvolArr[peak] ?? 1;
    if (!(startPx > 0)) return z;
    const slope = ((endPx - startPx) / startPx) * 100;
    let hi = -Infinity;
    let lo = Infinity;
    let rvFirst = 0;
    let rvFirstN = 0;
    let rvLast = 0;
    let rvLastN = 0;
    const mid = s + Math.floor((e - s) / 2);
    for (let k = s; k <= e; k++) {
      hi = Math.max(hi, Number(candles[k]!.high));
      lo = Math.min(lo, Number(candles[k]!.low));
      const rv = rvolArr[k] || 0;
      if (k <= mid) {
        rvFirst += rv;
        rvFirstN += 1;
      } else {
        rvLast += rv;
        rvLastN += 1;
      }
    }
    const rangePct = lo > 0 ? ((hi - lo) / lo) * 100 : 0;
    const rvolRising =
      rvFirstN > 0 &&
      rvLastN > 0 &&
      rvLast / rvLastN >= (rvFirst / rvFirstN) * 1.08;
    const tape = recentTapeBias(candles, e, Math.min(6, Math.max(3, e - s + 1)));
    const bullBar =
      Number(candles[peak]!.close) >= Number(candles[peak]!.open) * 0.999 ||
      Number(candles[e]!.close) > Number(candles[e]!.open);

    /** 폭등 = 고RVOL + 강한 상승 (롱빔) */
    const surge =
      peakRv >= 1.55 &&
      (slope >= 0.35 || rangePct >= 0.8) &&
      (tape !== 'bear' || slope >= 0.6) &&
      (bullBar || slope >= 0.5);

    /** 폭락 = 고RVOL + 강한 하락 */
    const dump =
      peakRv >= 1.55 &&
      (slope <= -0.35 || (rangePct >= 0.8 && tape === 'bear')) &&
      !surge;

    if (surge) {
      return {
        ...z,
        kind: 'surge',
        displayKo: '폭등',
        labelKo: `고RVOL 폭등·롱빔 · RVOL ${peakRv.toFixed(1)}`,
        color: 'rgba(52,211,153,0.18)',
        borderColor: 'rgba(52,211,153,0.98)',
        score: z.score + 18 + Math.min(20, peakRv * 4) + Math.min(12, slope),
        peakRvol: peakRv,
      };
    }
    if (dump) {
      return {
        ...z,
        kind: 'dump',
        displayKo: '폭락',
        labelKo: `고RVOL 폭락 · RVOL ${peakRv.toFixed(1)}`,
        color: 'rgba(248,113,113,0.18)',
        borderColor: 'rgba(254,202,202,0.98)',
        score: z.score + 16 + Math.min(20, peakRv * 4),
        peakRvol: peakRv,
      };
    }
    /** 확장 = 고거래량·RVOL 상승(방향 중립) */
    return {
      ...z,
      kind: 'climax',
      displayKo: '확장',
      labelKo: `고거래량·RVOL${rvolRising ? '상승' : ''} 확장 · RVOL ${peakRv.toFixed(1)}`,
      color: 'rgba(251,146,60,0.18)',
      borderColor: 'rgba(251,146,60,0.98)',
      score: z.score + 8 + Math.min(12, peakRv * 3) + (rvolRising ? 6 : 0),
      peakRvol: peakRv,
    };
  };

  /** 모집: 조용한 거래량 연속 구간 + 매수/매도 방향 */
  const accZones = coalesce(
    quiet,
    minAcc,
    'accumulate',
    '모집',
    `거래량 모집 구간(${buildWin}봉 기준)`,
    'rgba(148,163,184,0.18)',
    'rgba(226,232,240,0.95)'
  ).map((z) => applyFlowSideToZone(z, candles, 'accumulate'));

  /** 고RVOL 연속 → 폭등/폭락/확장(+매수·매도) 분류 */
  const hotZones = coalesce(
    hot,
    minHot,
    'climax',
    '확장',
    '거래량 확장',
    'rgba(251,146,60,0.18)',
    'rgba(251,146,60,0.98)'
  )
    .map(classifyHotZone)
    .map((z) => (z.kind === 'climax' ? applyFlowSideToZone(z, candles, 'climax') : z));

  /** 모집 직후 고RVOL 상승 = 폭등 보강 (롱빔) */
  const linkedSurge: VolumePhaseZone[] = [];
  for (const acc of accZones) {
    const scanTo = Math.min(n - 1, acc.endIdx + Math.max(8, Math.floor(buildWin * 0.8)));
    let bestI = -1;
    let bestRv = 0;
    for (let i = acc.endIdx + 1; i <= scanTo; i++) {
      const rv = rvolArr[i] || 0;
      const chg =
        Number(candles[acc.endIdx]!.close) > 0
          ? ((Number(candles[i]!.close) - Number(candles[acc.endIdx]!.close)) /
              Number(candles[acc.endIdx]!.close)) *
            100
          : 0;
      if (rv >= 1.5 && chg >= 0.2 && rv >= bestRv) {
        bestRv = rv;
        bestI = i;
      }
    }
    if (bestI < 0) continue;
    const s0 = Math.max(acc.endIdx + 1, bestI - 1);
    const e0 = Math.min(n - 1, bestI + 2);
    /** 이미 hotZones에 폭등으로 있으면 afterAccumulate만 표시용 점수 보강 */
    const exist = hotZones.find((z) => z.startIdx <= bestI && z.endIdx >= bestI);
    if (exist) {
      exist.afterAccumulate = true;
      exist.score += 14;
      if (exist.kind !== 'surge' && exist.kind !== 'dump') {
        const reclass = classifyHotZone({ ...exist, startIdx: s0, endIdx: e0 });
        Object.assign(exist, reclass);
        exist.afterAccumulate = true;
        if (exist.kind === 'surge') {
          exist.displayKo = '폭등';
          exist.labelKo = `모집→폭등(롱빔) · RVOL ${bestRv.toFixed(1)}`;
          exist.flowSide = 'buy';
        } else if (exist.kind === 'climax') {
          Object.assign(exist, applyFlowSideToZone(exist, candles, 'climax'));
          exist.afterAccumulate = true;
        }
      } else if (exist.kind === 'surge') {
        exist.labelKo = `모집→폭등(롱빔) · RVOL ${bestRv.toFixed(1)}`;
        exist.displayKo = '폭등';
        exist.flowSide = 'buy';
      }
      continue;
    }
    linkedSurge.push({
      kind: 'surge',
      displayKo: '폭등',
      labelKo: `모집→폭등(롱빔) · RVOL ${bestRv.toFixed(1)}`,
      startIdx: s0,
      endIdx: e0,
      startTime: Number(candles[s0]!.time),
      endTime: Number(candles[e0]!.time),
      color: 'rgba(52,211,153,0.14)',
      borderColor: 'rgba(16,185,129,0.98)',
      score: 40 + bestRv * 6,
      afterAccumulate: true,
      peakRvol: bestRv,
      flowSide: 'buy',
    });
  }

  /** 소진 존은 확장거래량 분석에서 제외(기존 스토리·빅롱 라벨은 유지) */

  const kindPri = (k: VolumePhaseZone['kind']) =>
    k === 'surge' || k === 'dump' ? 4 : k === 'climax' ? 3 : 1;

  /** 확장 거래량: 폭등·확장·폭락 + (그 직전) 모집 */
  const expandOnly = [...hotZones, ...linkedSurge].filter(
    (z) => z.kind === 'surge' || z.kind === 'dump' || z.kind === 'climax'
  );
  const merged = [...expandOnly].sort(
    (a, b) => b.score - a.score || kindPri(b.kind) - kindPri(a.kind)
  );
  const picked: VolumePhaseZone[] = [];
  for (const z of merged) {
    if (picked.length >= maxZones) break;
    const rival = picked.find((p) => !(z.endIdx < p.startIdx - 1 || z.startIdx > p.endIdx + 1));
    if (!rival) {
      picked.push(z);
      continue;
    }
    if (kindPri(z.kind) > kindPri(rival.kind) || z.score > rival.score + 4) {
      const ix = picked.indexOf(rival);
      if (ix >= 0) picked.splice(ix, 1, z);
    }
  }

  /** 폭등/확장 직전 모집 존은 항상 표시 */
  const attachAccumulateBefore = (s: VolumePhaseZone) => {
    if (s.kind !== 'surge' && s.kind !== 'climax') return;
    const hasAcc = picked.some(
      (a) => a.kind === 'accumulate' && a.endIdx <= s.startIdx && s.startIdx - a.endIdx <= buildWin + 2
    );
    if (hasAcc) return;
    const prev = accZones
      .filter((a) => a.endIdx <= s.startIdx && s.startIdx - a.endIdx <= buildWin + 2)
      .sort((a, b) => b.endIdx - a.endIdx)[0];
    if (!prev) return;
    if (picked.length >= maxZones) {
      const drop = picked.findIndex((p) => p.kind === 'climax' && p !== s && !p.afterAccumulate);
      if (drop >= 0) picked.splice(drop, 1);
    }
    if (picked.length < maxZones) {
      const directed = applyFlowSideToZone(
        {
          ...prev,
          labelKo: s.kind === 'surge' ? '모집→폭등 직전 축적' : '모집→확장 직전 축적',
        },
        candles,
        'accumulate'
      );
      picked.push(directed);
    }
    if (s.kind === 'surge') {
      s.afterAccumulate = true;
      s.displayKo = '폭등';
      s.labelKo = `모집→폭등(롱빔) · RVOL ${(s.peakRvol ?? 0).toFixed(1)}`;
    }
  };
  for (const s of [...picked]) attachAccumulateBefore(s);

  /** 최근 모집이 있는데 확장/폭등이 아직 없으면 모집만이라도 표시 */
  if (!picked.some((z) => z.kind === 'accumulate') && accZones.length) {
    const recentAcc = [...accZones].sort((a, b) => b.endIdx - a.endIdx)[0]!;
    if (recentAcc.endIdx >= n - Math.max(12, buildWin) && picked.length < maxZones) {
      picked.push(recentAcc);
    }
  }

  return picked.sort((a, b) => a.startIdx - b.startIdx);
}

/** 현재 구간 — 확장거래량 + 매수/매도 방향 */
export function resolveCurrentVolumeSection(params: {
  zones?: VolumePhaseZone[];
  storyKinds?: string[];
  lastBarIdx: number;
}): { ko: string; detailKo: string; tone: 'bear' | 'bull' | 'neutral' } {
  const last = Math.max(0, params.lastBarIdx);
  const near = (z: VolumePhaseZone) =>
    z.endIdx >= last - 8 || (z.startIdx <= last && z.endIdx >= last - 3);
  const nearZones = [...(params.zones ?? [])]
    .filter((z) => z.kind === 'surge' || z.kind === 'dump' || z.kind === 'climax' || z.kind === 'accumulate')
    .filter(near)
    .sort((a, b) => b.endIdx - a.endIdx);

  const surgeZ = nearZones.find((x) => x.kind === 'surge');
  const dumpZ = nearZones.find((x) => x.kind === 'dump');
  const climaxZ = nearZones.find((x) => x.kind === 'climax');
  const accZ = nearZones.find((x) => x.kind === 'accumulate');

  if (surgeZ) {
    return {
      ko: surgeZ.afterAccumulate ? '현재·모집→폭등' : '현재·폭등',
      detailKo: surgeZ.afterAccumulate
        ? '매수 모집 후 고RVOL 롱빔 · 참고·확정 아님'
        : '고RVOL + 강한 상승 · 참고·확정 아님',
      tone: 'bull',
    };
  }
  if (dumpZ) {
    return { ko: '현재·폭락', detailKo: '고RVOL + 강한 하락 · 참고·확정 아님', tone: 'bear' };
  }
  if (climaxZ) {
    const side = climaxZ.flowSide ?? 'neutral';
    const ko =
      side === 'buy' ? '현재·확장·매수' : side === 'sell' ? '현재·확장·매도' : '현재·확장';
    return {
      ko,
      detailKo: climaxZ.labelKo || '고거래량·RVOL 확장 · 종가 확인',
      tone: side === 'buy' ? 'bull' : side === 'sell' ? 'bear' : 'neutral',
    };
  }
  if (accZ) {
    const side = accZ.flowSide ?? 'neutral';
    const ko =
      side === 'buy' ? '현재·모집·매수' : side === 'sell' ? '현재·모집·매도' : '현재·모집';
    return {
      ko,
      detailKo: accZ.labelKo || '축적 중 · 폭등/확장 대기',
      tone: side === 'buy' ? 'bull' : side === 'sell' ? 'bear' : 'neutral',
    };
  }
  return { ko: '현재·관망', detailKo: '확장거래량(폭등·확장·폭락) 없음', tone: 'neutral' };
}
