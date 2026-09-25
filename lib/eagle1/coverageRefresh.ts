/**
 * Coverage sidecar 운영 — CSV → manifest JSON.
 * 빈 봉 날조 없음. collect=1 / CLI 공용.
 * fs 직접 호출 없음 (Turbopack TP1004 방지) — coverageManifest / historicalDatabase 위임.
 */
import {
  buildCoverageManifest,
  writeCoverageManifest,
  readCoverageManifestLite,
} from './coverageManifest';
import { loadEagle1RawCandles } from './historicalDatabase';

export const COVERAGE_REFRESH_TFS = ['1M', '1W', '1D', '12H', '4H', '1H', '15m', '5m', '1m'] as const;

export type CoverageRefreshRow = {
  tf: string;
  ok: boolean;
  rows: number;
  gaps: number;
  wrote: boolean;
  skipped: boolean;
  note: string;
};

export type CoverageRefreshReport = {
  symbol: string;
  rows: CoverageRefreshRow[];
  wroteCount: number;
  summaryKo: string;
};

/**
 * @param force  true면 CSV 없어도 스킵만, 있으면 무조건 재작성
 * @param staleMs sidecar downloaded_at 기준 (기본 5분)
 */
export function refreshCoverageSidecars(params: {
  symbol?: string;
  timeframes?: readonly string[];
  force?: boolean;
  staleMs?: number;
}): CoverageRefreshReport {
  const symbol = String(params.symbol || 'BTCUSDT').toUpperCase();
  const tfs = params.timeframes?.length ? [...params.timeframes] : [...COVERAGE_REFRESH_TFS];
  const staleMs = params.staleMs ?? 5 * 60_000;
  const force = Boolean(params.force);
  const rows: CoverageRefreshRow[] = [];
  let wroteCount = 0;
  const now = Date.now();

  for (const tf of tfs) {
    const lite = readCoverageManifestLite(symbol, tf);
    if (!force && lite && lite.downloaded_at > 0 && now - lite.downloaded_at < staleMs) {
      rows.push({
        tf,
        ok: true,
        rows: lite.row_count,
        gaps: lite.gap_count,
        wrote: false,
        skipped: true,
        note: 'sidecar 최신 · skip',
      });
      continue;
    }

    let raw;
    try {
      raw = loadEagle1RawCandles(symbol, tf);
    } catch {
      rows.push({
        tf,
        ok: false,
        rows: 0,
        gaps: 0,
        wrote: false,
        skipped: true,
        note: 'CSV 없음',
      });
      continue;
    }
    if (!raw.length) {
      rows.push({
        tf,
        ok: false,
        rows: 0,
        gaps: 0,
        wrote: false,
        skipped: true,
        note: 'CSV 없음',
      });
      continue;
    }

    try {
      const m = buildCoverageManifest(raw, { symbol, timeframe: tf });
      writeCoverageManifest(m);
      wroteCount += 1;
      rows.push({
        tf,
        ok: true,
        rows: m.row_count,
        gaps: m.gap_count,
        wrote: true,
        skipped: false,
        note: `봉 ${m.row_count} · gap ${m.gap_count}`,
      });
    } catch (e) {
      rows.push({
        tf,
        ok: false,
        rows: 0,
        gaps: 0,
        wrote: false,
        skipped: false,
        note: e instanceof Error ? e.message : '갱신 실패',
      });
    }
  }

  return {
    symbol,
    rows,
    wroteCount,
    summaryKo: wroteCount
      ? `커버리지 갱신 ${wroteCount}/${tfs.length}`
      : `커버리지 skip · CSV/최신 sidecar`,
  };
}

/** collect=1 경로 — HTF 우선, 강제 없이 stale만 */
export function refreshCoverageOnCollect(symbol: string): CoverageRefreshReport {
  return refreshCoverageSidecars({
    symbol,
    timeframes: ['1M', '1W', '1D', '12H', '4H', '1H', '15m'],
    force: false,
    staleMs: 15 * 60_000,
  });
}
