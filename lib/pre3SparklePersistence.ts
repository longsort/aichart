import type { AnalyzeResponse, Candle } from '@/types';
import { collectPre3SparkleDirections } from '@/lib/chartSparkleCandles';

const STORAGE_KEY = 'ailongshort-pre3-sparkle-v1';
/** 심볼|TF당 최대 보관 행(봉 time) — 오래된 것부터 잘라 최신 위주 */
const MAX_ROWS_PER_KEY = 3500;

export type Pre3SparklePersistRow = { time: number; direction: 'LONG' | 'SHORT'; similarity?: number };

function persistKey(symbol: string, tf: string) {
  return `${symbol.toUpperCase()}|${tf}`;
}

function loadAll(): Record<string, Pre3SparklePersistRow[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw) as Record<string, Pre3SparklePersistRow[]>;
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

function saveAll(all: Record<string, Pre3SparklePersistRow[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* quota 등 무시 */
  }
}

/** 차트에 칠할 반짝 봉 (저장된 누적) */
export function loadPre3SparklePersistMap(symbol: string, timeframe: string): Map<number, 'LONG' | 'SHORT'> {
  const m = new Map<number, 'LONG' | 'SHORT'>();
  if (typeof window === 'undefined') return m;
  const rows = loadAll()[persistKey(symbol, timeframe)] ?? [];
  for (const r of rows) {
    if ((r.direction === 'LONG' || r.direction === 'SHORT') && !m.has(r.time)) m.set(r.time, r.direction);
  }
  return m;
}

/**
 * 분석 응답의 pre3 히스토리·라이브 반짝을 localStorage에 병합 저장.
 * 새로고침·재방문 후에도 과거 반짝 캔들이 유지됩니다.
 */
export function mergePre3SparklePersistFromAnalysis(
  symbol: string,
  timeframe: string,
  analysis: AnalyzeResponse | null,
  candles: Candle[]
): void {
  if (typeof window === 'undefined') return;
  const fresh = collectPre3SparkleDirections(analysis, symbol, timeframe, candles);
  if (fresh.size === 0) return;
  const hasPersistable = [...fresh.values()].some((c) => !c.preview);
  if (!hasPersistable) return;

  const all = loadAll();
  const key = persistKey(symbol, timeframe);
  const byTime = new Map<number, { direction: 'LONG' | 'SHORT'; similarity: number }>();
  for (const r of all[key] ?? []) {
    if (r.direction === 'LONG' || r.direction === 'SHORT') {
      byTime.set(r.time, {
        direction: r.direction,
        similarity: Number.isFinite(r.similarity) ? Number(r.similarity) : 0,
      });
    }
  }
  const scoreFromHistory = new Map<number, number>();
  if (analysis && analysis.symbol === symbol && analysis.timeframe === timeframe) {
    for (const h of analysis.pre3SparkleHistory ?? []) {
      if (h.direction === 'LONG' || h.direction === 'SHORT') {
        scoreFromHistory.set(h.time, Number.isFinite(h.similarity) ? Number(h.similarity) : 0);
      }
    }
  }
  for (const [t, cell] of fresh) {
    if (cell.preview) continue;
    /** 한번 확정된 반짝은 고정: 기존 time은 절대 덮어쓰지 않음 */
    if (byTime.has(t)) continue;
    const s =
      scoreFromHistory.get(t) ??
      (analysis?.pre3Sparkle?.matched ? Number(analysis.pre3Sparkle.similarity || 0) : 0);
    byTime.set(t, { direction: cell.direction, similarity: s });
  }

  let merged = [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, row]) => ({ time, direction: row.direction, similarity: row.similarity }));
  if (merged.length > MAX_ROWS_PER_KEY) merged = merged.slice(-MAX_ROWS_PER_KEY);
  all[key] = merged;
  saveAll(all);
}

export function hasPre3SparkleOnCandles(
  symbol: string,
  timeframe: string,
  candles: Candle[],
  analysis?: AnalyzeResponse | null
): boolean {
  if (typeof window === 'undefined' || candles.length === 0) return false;
  const map = loadPre3SparklePersistMap(symbol, timeframe);
  if (candles.some((c) => map.has(c.time as number))) return true;
  if (analysis && analysis.symbol === symbol && analysis.timeframe === timeframe) {
    const live = collectPre3SparkleDirections(analysis, symbol, timeframe, candles);
    return candles.some((c) => live.has(c.time as number));
  }
  return false;
}
