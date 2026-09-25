/**
 * 파랑빨강띠용 경량 패턴기억 기울기 — 데스크 캔들만으로 유사창 투표.
 * 서버 pattern-memory API 없이 동작. 미래 누수 금지(asOf 이전만).
 * 확정 수익·승률 아님.
 */
import type { Candle } from '@/types';

export type MergedDeskRbPatternLean = {
  lean: 'LONG' | 'SHORT' | 'WAIT';
  score: number;
  pLong: number | null;
  sample: number;
  tagKo: string;
  detailKo: string;
};

function feat(c: Candle): number[] {
  const r = Math.max(1e-9, c.high - c.low);
  const body = (c.close - c.open) / r;
  const uw = (c.high - Math.max(c.open, c.close)) / r;
  const lw = (Math.min(c.open, c.close) - c.low) / r;
  const vol = Number(c.volume) || 0;
  return [body, uw, lw, Math.tanh(vol / Math.max(1, vol + 1))];
}

function cos(a: number[], b: number[]): number {
  let d = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    d += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den > 1e-12 ? d / den : 0;
}

function windowVec(candles: Candle[], end: number, win: number): number[] | null {
  if (end < win - 1 || end >= candles.length) return null;
  const out: number[] = [];
  for (let i = end - win + 1; i <= end; i++) {
    out.push(...feat(candles[i]!));
  }
  /** 창 수익률 정규화 */
  const a = candles[end - win + 1]!.close;
  const b = candles[end]!.close;
  if (a > 0) out.push(Math.tanh(((b - a) / a) * 12));
  return out;
}

/**
 * 최근 닫힌 창과 비슷한 과거 창을 찾아 +3봉 방향 투표.
 */
export function computeMergedDeskRbPatternLean(
  candles: Candle[],
  opts?: { window?: number; topK?: number; minCos?: number }
): MergedDeskRbPatternLean {
  const empty: MergedDeskRbPatternLean = {
    lean: 'WAIT',
    score: 0,
    pLong: null,
    sample: 0,
    tagKo: '패턴·표본부족',
    detailKo: '유사구간 부족 · 참고 불가',
  };
  const n = candles.length;
  if (n < 40) return empty;
  const win = Math.max(5, Math.min(20, opts?.window ?? 10));
  const topK = opts?.topK ?? 40;
  const minCos = opts?.minCos ?? 0.72;
  const asOf = n - 2; // 형성봉 제외
  if (asOf < win + 8) return empty;
  const query = windowVec(candles, asOf, win);
  if (!query) return empty;

  type Hit = { i: number; cos: number };
  const scored: Hit[] = [];
  const step = n > 800 ? 3 : n > 400 ? 2 : 1;
  for (let i = win - 1; i <= asOf - 6; i += step) {
    const v = windowVec(candles, i, win);
    if (!v || v.length !== query.length) continue;
    const c = cos(query, v);
    if (c < minCos) continue;
    scored.push({ i, cos: c });
  }
  scored.sort((a, b) => b.cos - a.cos);
  const hits = scored.slice(0, topK);
  let up = 0;
  let down = 0;
  let wUp = 0;
  let wDown = 0;
  for (const h of hits) {
    const a = candles[h.i]!;
    const b = candles[h.i + 3];
    if (!b || !(a.close > 0)) continue;
    const r = (b.close - a.close) / a.close;
    const w = Math.max(0.05, h.cos);
    if (r > 0.0008) {
      up += 1;
      wUp += w;
    } else if (r < -0.0008) {
      down += 1;
      wDown += w;
    }
  }
  const sample = up + down;
  if (sample < 6) {
    return {
      ...empty,
      sample,
      tagKo: `패턴·n${sample}`,
      detailKo: `유사 ${hits.length} · 방향표본 ${sample} · 부족`,
    };
  }
  const pLong = wUp + wDown > 0 ? wUp / (wUp + wDown) : up / sample;
  let lean: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT';
  if (pLong >= 0.56) lean = 'LONG';
  else if (pLong <= 0.44) lean = 'SHORT';
  const score = Math.round((pLong - 0.5) * 200); // -100~+100
  const tagKo =
    lean === 'LONG'
      ? `패턴롱${(pLong * 100).toFixed(0)}%`
      : lean === 'SHORT'
        ? `패턴숏${((1 - pLong) * 100).toFixed(0)}%`
        : `패턴갈림${(pLong * 100).toFixed(0)}%`;
  return {
    lean,
    score,
    pLong,
    sample,
    tagKo,
    detailKo: `유사창 ${sample} · ↑${up}/↓${down} · 가중${(pLong * 100).toFixed(0)}%↑ · 확정아님`,
  };
}
