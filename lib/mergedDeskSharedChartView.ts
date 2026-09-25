/**
 * 통합·분석 — 4h에서 맞춘 화면 비율을 분·시·일·주·월에 공동 적용.
 * 본체는 barSpacing(봉 픽셀 폭). visibleBars는 폴백.
 */
import { isMergedDeskChartTimeframe } from '@/lib/mergedDesk4hReference';
import { visibleLimit } from '@/lib/constants';
import { sessionScopedStorageKey } from '@/lib/settings';

const STORAGE_KEY_BASE = 'ailongshort-merged-desk-shared-view-v3';
/** 구버전 — 한 번 읽어 barSpacing 없이 승격 */
const STORAGE_KEY_V2_BASE = 'ailongshort-merged-desk-shared-view-v2';

function storageKeyV3(): string {
  return sessionScopedStorageKey(STORAGE_KEY_BASE);
}
function storageKeyV2(): string {
  return sessionScopedStorageKey(STORAGE_KEY_V2_BASE);
}

export const MERGED_DESK_VIEW_SYNC_EVENT = 'ailongshort-merged-desk-view-sync';
/** 툴바·데스크 칩 → ChartView 뷰저장 (ref 미연결 시 폴백) */
export const MERGED_DESK_SAVE_VIEW_EVENT = 'ailongshort-merged-desk-save-view';
/** 툴바·데스크 칩 → ChartView 뷰복원 */
export const MERGED_DESK_RESTORE_VIEW_EVENT = 'ailongshort-merged-desk-restore-view';

export type MergedDeskSharedChartView = {
  /** 화면에 보이는 논리 봉 수 (폴백) */
  visibleBars: number;
  /** 봉 1개 픽셀 폭 — 전 TF 동일 화면 비율 */
  barSpacing: number;
  sourceTf: string;
  capturedAt: number;
};

export const MERGED_DESK_DEFAULT_VISIBLE_BARS = 96;
/** 거래소·TV형 기본 봉폭(px) — 너무 작으면 캔들이 실선처럼 보임 */
export const MERGED_DESK_DEFAULT_BAR_SPACING = 8;
/**
 * 통합·분석 — 마지막 캔들 우측 빈 축(예측 여백) 봉 수.
 * timeScale.rightOffset + zone/라벨 우측 앵커에 공동 사용.
 * 파랑빨강 테두리 tip은 +10봉 정지(mergedDeskRbWaveDrawEnd pad=10).
 */
export const MERGED_DESK_RIGHT_FUTURE_BARS = 20;
/**
 * 존·라벨 — 마지막 캔들 기준 우측 연장 봉 수.
 */
export const MERGED_DESK_ZONE_EXTEND_PAST_LAST_BARS = 10;
/** 기능 라벨 우측 안착 = 마지막 캔들 +10봉 */
export const MERGED_DESK_LABEL_EXTEND_PAST_LAST_BARS = 10;
/**
 * @deprecated 파랑빨강띠는 미래 빈축 연장 대신 `mergedDeskRbWaveDrawEnd`(마지막 파동·실봉) 사용.
 * 차트 우측 여백(timeScale)용으로만 유지.
 */
export const MERGED_DESK_RB_FUTURE_BARS = MERGED_DESK_RIGHT_FUTURE_BARS;

const MIN_BARS = 24;
const MAX_BARS = 140;
const MIN_SPACING = 5;
const MAX_SPACING = 28;

export function clampMergedDeskVisibleBars(n: number): number {
  if (!Number.isFinite(n)) return MERGED_DESK_DEFAULT_VISIBLE_BARS;
  return Math.max(MIN_BARS, Math.min(MAX_BARS, Math.round(n)));
}

export function clampMergedDeskBarSpacing(n: number): number {
  if (!Number.isFinite(n)) return MERGED_DESK_DEFAULT_BAR_SPACING;
  return Math.max(MIN_SPACING, Math.min(MAX_SPACING, Math.round(n * 10) / 10));
}

function normalizeView(o: Partial<MergedDeskSharedChartView>): MergedDeskSharedChartView | null {
  const visibleBars = clampMergedDeskVisibleBars(Number(o.visibleBars));
  const barSpacing = clampMergedDeskBarSpacing(
    Number(o.barSpacing) > 0 ? Number(o.barSpacing) : MERGED_DESK_DEFAULT_BAR_SPACING
  );
  if (!Number.isFinite(visibleBars) || visibleBars < MIN_BARS) return null;
  return {
    visibleBars,
    barSpacing,
    sourceTf: String(o.sourceTf || ''),
    capturedAt: Number(o.capturedAt) || Date.now(),
  };
}

export function readMergedDeskSharedChartView(): MergedDeskSharedChartView | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      window.localStorage.getItem(storageKeyV3()) ||
      window.localStorage.getItem(STORAGE_KEY_BASE);
    if (raw) {
      const parsed = normalizeView(JSON.parse(raw) as Partial<MergedDeskSharedChartView>);
      if (parsed) return parsed;
    }
    /** v2 → v3 승격 (barSpacing 기본값 부여) */
    const raw2 = window.localStorage.getItem(storageKeyV2());
    if (raw2) {
      const parsed = normalizeView(JSON.parse(raw2) as Partial<MergedDeskSharedChartView>);
      if (parsed) {
        writeMergedDeskSharedChartView(parsed);
        return parsed;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function writeMergedDeskSharedChartView(
  view: MergedDeskSharedChartView,
  opts?: { silent?: boolean }
): void {
  if (typeof window === 'undefined') return;
  try {
    const payload = normalizeView(view);
    if (!payload) return;
    window.localStorage.setItem(storageKeyV3(), JSON.stringify(payload));
    /** silent: 휠 줌 저장 시 sync→우측 리셋 방지 */
    if (!opts?.silent) {
      window.dispatchEvent(new CustomEvent(MERGED_DESK_VIEW_SYNC_EVENT));
    }
  } catch {
    /* ignore */
  }
}

/** logical range → 가시 봉 수. 전체 fit처럼 보이면 null */
export function visibleBarsFromLogicalRange(
  from: number,
  to: number,
  seriesBarCount?: number
): number | null {
  const span = Math.abs(Number(to) - Number(from));
  if (!Number.isFinite(span) || span < MIN_BARS * 0.5) return null;
  const bars = Math.round(span);
  if (seriesBarCount != null && seriesBarCount > 40 && bars > seriesBarCount * 0.72) {
    return null;
  }
  if (bars > MAX_BARS * 1.35) return null;
  return clampMergedDeskVisibleBars(bars);
}

/**
 * 분·시·일·주·월 — 저장 줌 공동 적용하되, HTF 기본값은 TF별(일≠주≠월 체감).
 */
export function resolveMergedDeskVisibleBars(
  timeframe: string,
  seriesBarCount: number
): number {
  const n = Math.max(1, seriesBarCount);
  if (!isMergedDeskChartTimeframe(timeframe)) {
    return Math.min(visibleLimit(timeframe), n);
  }
  const shared = readMergedDeskSharedChartView();
  if (shared?.visibleBars) {
    return Math.min(shared.visibleBars, n);
  }
  const tf = String(timeframe || '');
  const htfDefault =
    tf === '1M' ? 48 : tf === '1w' ? 72 : tf === '1d' ? 120 : MERGED_DESK_DEFAULT_VISIBLE_BARS;
  return Math.min(htfDefault, n);
}

/** 전 TF 동일 barSpacing (미저장 시 기본값 — null 금지로 1d HTF 분기 제거) */
export function resolveMergedDeskBarSpacing(timeframe: string): number | null {
  if (!isMergedDeskChartTimeframe(timeframe)) return null;
  const shared = readMergedDeskSharedChartView();
  if (shared?.barSpacing) {
    /** 저장된 줌이 너무 촘촘하면 거래소 기본으로 (캔들=실선 방지) */
    return shared.barSpacing >= 6
      ? shared.barSpacing
      : MERGED_DESK_DEFAULT_BAR_SPACING;
  }
  return MERGED_DESK_DEFAULT_BAR_SPACING;
}

export function ensureMergedDeskDefaultSharedView(sourceTf = '4h'): MergedDeskSharedChartView {
  const existing = readMergedDeskSharedChartView();
  if (existing && existing.barSpacing >= 6 && existing.visibleBars <= 140) {
    return existing;
  }
  const fresh: MergedDeskSharedChartView = {
    visibleBars: MERGED_DESK_DEFAULT_VISIBLE_BARS,
    barSpacing: MERGED_DESK_DEFAULT_BAR_SPACING,
    sourceTf: existing?.sourceTf || sourceTf,
    capturedAt: Date.now(),
  };
  writeMergedDeskSharedChartView(fresh);
  return fresh;
}
