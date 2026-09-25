/**
 * 통합·분석 가로 점선 시각 정리 — 삭제·숨김 없이 읽기 쉽게.
 * primary(E/SL/TP1/무효)는 전폭 유지, secondary는 우측 꼬리(+20)만 가능.
 */
import type { Candle } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';
import { mergedDeskRbFutureTime2 } from '@/lib/mergedDeskBlueRedChannels';
import { MERGED_DESK_RIGHT_FUTURE_BARS } from '@/lib/mergedDeskSharedChartView';
import { softenMergedDeskChartColor } from '@/lib/mergedAnalysisDeskVisualCleanup';

export type MergedDeskHLineCleanMode = 'classic' | 'soft' | 'tail';
export type MergedDeskHLineRole = 'primary' | 'secondary';

const PRIMARY_RE =
  /(?:^|[^\w])(?:E|진입|Entry|SL|손절|Stop|TP1|익절1|무효|Invalid|INV)(?:$|[^\w])|▲진입|▼진입|▲손절|▼손절|▲익절TP1|▼익절TP1/i;

export function normalizeMergedDeskHLineCleanMode(v: unknown): MergedDeskHLineCleanMode {
  if (v === 'classic' || v === 'soft' || v === 'tail') return v;
  return 'tail';
}

export function classifyMergedDeskHLineRole(title: string): MergedDeskHLineRole {
  const t = String(title || '').trim();
  if (!t) return 'secondary';
  if (PRIMARY_RE.test(t)) return 'primary';
  if (/^TP1\b/i.test(t) || /\bTP1\b/i.test(t)) return 'primary';
  return 'secondary';
}

/** 색을 더 연하게 — 캔들 위 격자감 완화 */
export function polishMergedDeskHLineColor(
  color: string,
  role: MergedDeskHLineRole,
  mode: MergedDeskHLineCleanMode
): string {
  const base = softenMergedDeskChartColor(color);
  if (mode === 'classic') return base;
  const m = base.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!m) return base;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  const a0 = m[4] != null ? Number(m[4]) : 0.82;
  const a =
    role === 'primary'
      ? Math.min(a0, mode === 'soft' ? 0.55 : 0.62)
      : Math.min(a0, mode === 'soft' ? 0.32 : 0.38);
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

export function polishMergedDeskHLineWidth(
  width: number,
  role: MergedDeskHLineRole,
  mode: MergedDeskHLineCleanMode,
  isGate = false
): 1 | 2 | 3 | 4 {
  if (mode === 'classic') {
    const w = isGate ? Math.max(width, 2) : width || 1;
    return Math.max(1, Math.min(4, Math.round(w))) as 1 | 2 | 3 | 4;
  }
  if (role === 'primary') return isGate ? 2 : 1;
  return 1;
}

/**
 * classic/soft → 전구간.
 * tail → primary 전구간, secondary는 마지막봉~+20봉(우측 꼬리).
 */
export function resolveMergedDeskHLineSpan(
  candles: Candle[],
  role: MergedDeskHLineRole,
  mode: MergedDeskHLineCleanMode
): { t0: UTCTimestamp; tN: UTCTimestamp } | null {
  if (candles.length < 2) return null;
  const n = candles.length;
  const tLast = Number(candles[n - 1]!.time);
  const tEnd = mergedDeskRbFutureTime2(candles, tLast, n - 1, MERGED_DESK_RIGHT_FUTURE_BARS);
  if (mode !== 'tail' || role === 'primary') {
    return {
      t0: Number(candles[0]!.time) as UTCTimestamp,
      tN: tEnd as UTCTimestamp,
    };
  }
  /** 보조선: 최근 몇 봉만 살짝 남기고 우측+20으로 — 좌측 격자 제거 */
  const tailBars = Math.min(6, n - 1);
  const i0 = Math.max(0, n - 1 - tailBars);
  return {
    t0: Number(candles[i0]!.time) as UTCTimestamp,
    tN: tEnd as UTCTimestamp,
  };
}

/** 거의 같은 가격의 중복 가로선 — 1개만 유지(primary 우선) */
export function dedupeMergedDeskHLinesByPrice<T extends { price: number; title?: string }>(
  rows: ReadonlyArray<T>,
  atrHint = 0
): T[] {
  if (rows.length <= 1) return [...rows];
  const tol = Math.max(atrHint * 0.04, Math.abs(Number(rows[0]?.price) || 1) * 0.00012, 1e-6);
  const sorted = [...rows].sort((a, b) => {
    const ra = classifyMergedDeskHLineRole(String(a.title || ''));
    const rb = classifyMergedDeskHLineRole(String(b.title || ''));
    if (ra !== rb) return ra === 'primary' ? -1 : 1;
    return a.price - b.price;
  });
  const out: T[] = [];
  for (const row of sorted) {
    const hit = out.find((x) => Math.abs(x.price - row.price) <= tol);
    if (hit) continue;
    out.push(row);
  }
  return out.sort((a, b) => a.price - b.price);
}
