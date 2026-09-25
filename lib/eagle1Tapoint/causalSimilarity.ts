/**
 * §13 HISTORICAL SIMILARITY — 가격 절대값 금지 · 정규화 피처.
 * 인과: asOf = n-1(형성봉 제외 시 n-2)까지만 매칭, 미래봉으로 결과 측정.
 * 확정 승률 아님 · 표본 부족 시 null.
 */
import type { Eagle1Bar } from '@/lib/eagle1/structureEngine';
import type { TapHistoricalSnap } from './types';

/** 지시서 창 10/20/30/50 · 같은 TF만 합침 */
const WINDOWS = [10, 20, 30, 50] as const;
const TOP_K = 80;
const MIN_N = 16;
const DEDUP_GAP = 6;
/** 10배 · ROE5%/7% → 필요 가격변동률 */
const ROE_LEV = 10;
const ROE5_PRICE = 5 / ROE_LEV / 100; // 0.005
const ROE7_PRICE = 7 / ROE_LEV / 100; // 0.007
const ROE_HORIZON = 10;

function emptyHist(noteKo: string, n = 0): TapHistoricalSnap {
  return {
    n,
    similarity: null,
    up3: null,
    up5: null,
    up10: null,
    mfe: null,
    mae: null,
    netEv: null,
    noteKo,
    roeHit5at10x: null,
    roeHit7at10x: null,
    roeStatHorizon: null,
    queryDirection: null,
    biasKo: null,
    extraByTf: [],
    windowsUsed: [],
  };
}

function asBars(
  rows: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }> | null | undefined
): Eagle1Bar[] {
  if (!rows?.length) return [];
  return rows.map((c) => ({
    time: Number(c.time) || 0,
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: Number(c.volume) || 0,
  }));
}

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

type Hit = { i: number; d: number; w: number };

function pickSimilar(params: {
  bars: Eagle1Bar[];
  direction: 'LONG' | 'SHORT';
  asOfIndex?: number;
}): { snap: TapHistoricalSnap; windowsUsed: number[] } {
  const bars = params.bars;
  const n = bars.length;
  const minW = WINDOWS[0]!;
  const asOf = params.asOfIndex ?? Math.max(minW, n - 2);
  if (asOf < minW + 15 || asOf >= n) {
    return { snap: emptyHist('통계 부족 · 캔들부족'), windowsUsed: [] };
  }

  const maxMatch = asOf - 12;
  const hits: Hit[] = [];
  const used: number[] = [];
  for (const w of WINDOWS) {
    if (asOf < w) continue;
    const q = featAt(bars, asOf, w);
    if (!q) continue;
    used.push(w);
    for (let i = w; i <= maxMatch; i += 1) {
      const f = featAt(bars, i, w);
      if (!f) continue;
      hits.push({ i, d: dist(q, f), w });
    }
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
      snap: emptyHist(`통계 부족 · 유사 ${picked.length}<${MIN_N}`, picked.length),
      windowsUsed: used,
    };
  }

  const avgDist = picked.reduce((s, h) => s + h.d, 0) / Math.max(picked.length, 1);
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

  const roeRows = picked
    .map((p) => forwardStats(bars, p.i, ROE_HORIZON, params.direction))
    .filter((x): x is NonNullable<typeof x> => !!x);
  let roeHit5at10x: number | null = null;
  let roeHit7at10x: number | null = null;
  if (roeRows.length >= MIN_N) {
    roeHit5at10x = roeRows.filter((r) => r.mfe >= ROE5_PRICE).length / roeRows.length;
    roeHit7at10x = roeRows.filter((r) => r.mfe >= ROE7_PRICE).length / roeRows.length;
  }

  const dirKo = params.direction === 'LONG' ? '롱' : '숏';
  const roeNote =
    roeHit5at10x != null && roeHit7at10x != null
      ? ` · 10x ROE5%도달${(roeHit5at10x * 100).toFixed(0)}%·7%${(roeHit7at10x * 100).toFixed(0)}%(${ROE_HORIZON}봉MFE)`
      : '';
  const hitPct =
    c5.up != null ? ` · ${dirKo}유리${(c5.up * 100).toFixed(0)}%(5봉)` : '';
  const winKo = used.length ? ` · 창${used.join('/')}` : '';

  return {
    snap: {
      n: picked.length,
      similarity,
      up3: c3.up,
      up5: c5.up,
      up10: c10.up,
      mfe: c5.mfe,
      mae: c5.mae,
      netEv,
      roeHit5at10x,
      roeHit7at10x,
      roeStatHorizon: ROE_HORIZON,
      queryDirection: params.direction,
      biasKo: `${dirKo}유사`,
      extraByTf: [],
      windowsUsed: used,
      noteKo: `${dirKo}유사 · 표본N=${picked.length}${winKo} · sim${similarity}${hitPct}${roeNote} · 확정아님`,
    },
    windowsUsed: used,
  };
}

export function runTapCausalSimilarity(params: {
  bars: Eagle1Bar[];
  direction: 'LONG' | 'SHORT';
  /** 마감봉 인덱스(기본 n-2) */
  asOfIndex?: number;
  /** 같은 심볼 다른 TF — 본 통계에 합치지 않고 extraByTf만 */
  extraSeries?: Array<{
    tf: string;
    bars: Array<{
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume?: number;
    }>;
  }>;
}): TapHistoricalSnap {
  const main = pickSimilar({
    bars: params.bars,
    direction: params.direction,
    asOfIndex: params.asOfIndex,
  });
  const extraByTf: NonNullable<TapHistoricalSnap['extraByTf']> = [];
  for (const ser of params.extraSeries || []) {
    const tf = String(ser.tf || '').trim();
    if (!tf) continue;
    const rows = asBars(ser.bars);
    const capped = rows.length > 500 ? rows.slice(-500) : rows;
    if (capped.length < 80) continue;
    const sub = pickSimilar({
      bars: capped,
      direction: params.direction,
      asOfIndex: Math.max(0, rows.length - 2),
    });
    extraByTf.push({
      tf,
      n: sub.snap.n,
      similarity: sub.snap.similarity,
      up5: sub.snap.up5,
      noteKo: `${tf} 추가 ${sub.snap.noteKo}`,
    });
  }
  const snap = main.snap;
  snap.extraByTf = extraByTf;
  snap.windowsUsed = main.windowsUsed;
  if (extraByTf.length) {
    const extraKo = extraByTf.map((e) => `${e.tf}N=${e.n}`).join(' · ');
    snap.noteKo = `${snap.noteKo} · 추가 ${extraKo}`;
  }
  return snap;
}

export function historicalScoreFromSnap(h: TapHistoricalSnap): number {
  if (h.n < MIN_N || h.netEv == null) return 32;
  const up = h.up5 ?? 0.5;
  const ev = h.netEv;
  const base = 40 + up * 35 + Math.max(-15, Math.min(20, ev * 2000));
  return Math.max(0, Math.min(100, Math.round(base)));
}
