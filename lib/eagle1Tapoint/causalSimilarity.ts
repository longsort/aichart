/**
 * §13 HISTORICAL SIMILARITY — 가격 절대값 금지 · 정규화 피처.
 * 인과: asOf = n-1(형성봉 제외 시 n-2)까지만 매칭, 미래봉으로 결과 측정.
 * 확정 승률 아님 · 표본 부족 시 null.
 */
import type { Eagle1Bar } from '@/lib/eagle1/structureEngine';
import type { TapHistoricalSnap } from './types';

const WINDOW = 20;
const TOP_K = 24;
const MIN_N = 20;
const DEDUP_GAP = 8;

function featAt(bars: Eagle1Bar[], i: number, w: number): number[] | null {
  if (i < w || i >= bars.length) return null;
  const slice = bars.slice(i - w + 1, i + 1);
  const last = slice[slice.length - 1]!;
  const px = last.close;
  if (!(px > 0)) return null;
  const rets: number[] = [];
  const ranges: number[] = [];
  const bodies: number[] = [];
  const vols: number[] = [];
  for (let k = 1; k < slice.length; k++) {
    const a = slice[k - 1]!;
    const b = slice[k]!;
    rets.push((b.close - a.close) / Math.max(a.close, 1e-9));
    ranges.push((b.high - b.low) / Math.max(b.close, 1e-9));
    bodies.push(Math.abs(b.close - b.open) / Math.max(b.high - b.low, 1e-9));
    vols.push(Number(b.volume) || 0);
  }
  const meanVol = vols.reduce((s, v) => s + v, 0) / Math.max(vols.length, 1);
  const volZ =
    meanVol > 0
      ? ((Number(last.volume) || 0) - meanVol) /
        Math.max(
          Math.sqrt(
            vols.reduce((s, v) => s + (v - meanVol) ** 2, 0) / Math.max(vols.length, 1)
          ),
          1e-9
        )
      : 0;
  const rMean = rets.reduce((s, v) => s + v, 0) / rets.length;
  const rLast = rets[rets.length - 1] ?? 0;
  const rng = ranges[ranges.length - 1] ?? 0;
  const body = bodies[bodies.length - 1] ?? 0;
  return [rMean, rLast, rng, body, Math.max(-3, Math.min(3, volZ))];
}

function dist(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    s += d * d;
  }
  return Math.sqrt(s);
}

function forwardStats(
  bars: Eagle1Bar[],
  i: number,
  horizon: number,
  direction: 'LONG' | 'SHORT'
): { up: boolean; mfe: number; mae: number; ret: number } | null {
  if (i + horizon >= bars.length) return null;
  const entry = bars[i]!.close;
  if (!(entry > 0)) return null;
  let mfe = 0;
  let mae = 0;
  for (let h = 1; h <= horizon; h++) {
    const b = bars[i + h]!;
    const upMove = (b.high - entry) / entry;
    const dnMove = (entry - b.low) / entry;
    if (direction === 'LONG') {
      mfe = Math.max(mfe, upMove);
      mae = Math.max(mae, dnMove);
    } else {
      mfe = Math.max(mfe, dnMove);
      mae = Math.max(mae, upMove);
    }
  }
  const end = bars[i + horizon]!.close;
  const ret = direction === 'LONG' ? (end - entry) / entry : (entry - end) / entry;
  return { up: ret > 0, mfe, mae, ret };
}

export function runTapCausalSimilarity(params: {
  bars: Eagle1Bar[];
  direction: 'LONG' | 'SHORT';
  /** 마감봉 인덱스(기본 n-2) */
  asOfIndex?: number;
}): TapHistoricalSnap {
  const bars = params.bars;
  const n = bars.length;
  const asOf = params.asOfIndex ?? Math.max(WINDOW, n - 2);
  if (asOf < WINDOW + 15 || asOf >= n) {
    return {
      n: 0,
      similarity: null,
      up3: null,
      up5: null,
      up10: null,
      mfe: null,
      mae: null,
      netEv: null,
      noteKo: '통계 부족 · 캔들부족',
    };
  }

  const q = featAt(bars, asOf, WINDOW);
  if (!q) {
    return {
      n: 0,
      similarity: null,
      up3: null,
      up5: null,
      up10: null,
      mfe: null,
      mae: null,
      netEv: null,
      noteKo: '통계 부족 · 피처불가',
    };
  }

  type Hit = { i: number; d: number };
  const hits: Hit[] = [];
  /** 미래 유출 방지: 매칭 지점 +10봉이 asOf 이전이어야 함 */
  const maxMatch = asOf - 12;
  for (let i = WINDOW; i <= maxMatch; i += 2) {
    const f = featAt(bars, i, WINDOW);
    if (!f) continue;
    hits.push({ i, d: dist(q, f) });
  }
  hits.sort((a, b) => a.d - b.d);

  const picked: Hit[] = [];
  for (const h of hits) {
    if (picked.length >= TOP_K) break;
    if (picked.some((p) => Math.abs(p.i - h.i) < DEDUP_GAP)) continue;
    picked.push(h);
  }

  if (picked.length < MIN_N) {
    return {
      n: picked.length,
      similarity: null,
      up3: null,
      up5: null,
      up10: null,
      mfe: null,
      mae: null,
      netEv: null,
      noteKo: `통계 부족 · 유사 ${picked.length}<${MIN_N}`,
    };
  }

  const avgDist =
    picked.reduce((s, h) => s + h.d, 0) / Math.max(picked.length, 1);
  const similarity = Math.max(0, Math.min(100, Math.round(100 * (1 - avgDist / 2))));

  const collect = (h: number) => {
    const rows = picked
      .map((p) => forwardStats(bars, p.i, h, params.direction))
      .filter((x): x is NonNullable<typeof x> => !!x);
    if (rows.length < MIN_N) return { up: null as number | null, mfe: null, mae: null, ev: null };
    const up = rows.filter((r) => r.up).length / rows.length;
    const mfe = rows.reduce((s, r) => s + r.mfe, 0) / rows.length;
    const mae = rows.reduce((s, r) => s + r.mae, 0) / rows.length;
    const ev = rows.reduce((s, r) => s + r.ret, 0) / rows.length;
    return { up, mfe, mae, ev };
  };

  const c3 = collect(3);
  const c5 = collect(5);
  const c10 = collect(10);
  const netEv = c5.ev;

  return {
    n: picked.length,
    similarity,
    up3: c3.up,
    up5: c5.up,
    up10: c10.up,
    mfe: c5.mfe,
    mae: c5.mae,
    netEv,
    noteKo: `유사Top${picked.length} · sim${similarity} · 인과윈도우${WINDOW} · 확정아님`,
  };
}

export function historicalScoreFromSnap(h: TapHistoricalSnap): number {
  if (h.n < MIN_N || h.netEv == null) return 32;
  const up = h.up5 ?? 0.5;
  const ev = h.netEv;
  const base = 40 + up * 35 + Math.max(-15, Math.min(20, ev * 2000));
  return Math.max(0, Math.min(100, Math.round(base)));
}
