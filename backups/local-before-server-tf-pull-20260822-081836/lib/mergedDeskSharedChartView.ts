/**
 * 통합·분석 — 4h에서 맞춘 화면 비율을 분·시·일·주·월에 공동 적용.
 * 본체는 barSpacing(봉 픽셀 폭). visibleBars는 폴백.
 */
import { isMergedDeskChartTimeframe } from '@/lib/mergedDesk4hReference';
import { visibleLimit } from '@/lib/constants';

const STORAGE_KEY = 'ailongshort-merged-desk-shared-view-v3';
/** 구버전 — 한 번 읽어 barSpacing 없이 승격 */
const STORAGE_KEY_V2 = 'ailongshort-merged-desk-shared-view-v2';

export const MERGED_DESK_VIEW_SYNC_EVENT = 'ailongshort-merged-desk-view-sync';

export type MergedDeskSharedChartView = {
  /** 화면에 보이는 논리 봉 수 (폴백) */
  visibleBars: number;
  /** 봉 1개 픽셀 폭 — 전 TF 동일 화면 비율 */
  barSpacing: number;
  sourceTf: string;
  capturedAt: number;
};

export const MERGED_DESK_DEFAULT_VISIBLE_BARS = 96;
export const MERGED_DESK_DEFAULT_BAR_SPACING = 7;
/**
 * 통합·분석 — 마지막 캔들 우측 빈 축(예측 여백) 봉 수.
 * timeScale.rightOffset + zone/라벨 우측 앵커에 공동 사용.
 * 사용자 요청: 가격축에서 40캔들 간격.
 */
export const MERGED_DESK_RIGHT_FUTURE_BARS = 40;
/** 파랑빨강띠·게이트 면 — 마지막 봉에서 우측 20봉 연장(통합 예측여백과 동일) */
export const MERGED_DESK_RB_FUTURE_BARS = MERGED_DESK_RIGHT_FUTURE_BARS;

const MIN_BARS = 24;
const MAX_BARS = 180;
const MIN_SPACING = 3;
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
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = normalizeView(JSON.parse(raw) as Partial<MergedDeskSharedChartView>);
      if (parsed) return parsed;
    }
    /** v2 → v3 승격 (barSpacing 기본값 부여) */
    const raw2 = window.localStorage.getItem(STORAGE_KEY_V2);
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

export function writeMergedDeskSharedChartView(view: MergedDeskSharedChartView): void {
  if (typeof window === 'undefined') return;
  try {
    const payload = normalizeView(view);
    if (!payload) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(MERGED_DESK_VIEW_SYNC_EVENT));
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
 * 분·시·일·주·월 **동일** — 저장된 visibleBars / 기본 96.
 * (과거 1d=220·1w=160·1M=120 강제는 1D만 확대·축소 체감이 달랐음 → 제거)
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
  return Math.min(MERGED_DESK_DEFAULT_VISIBLE_BARS, n);
}

/** 전 TF 동일 barSpacing (미저장 시 기본값 — null 금지로 1d HTF 분기 제거) */
export function resolveMergedDeskBarSpacing(timeframe: string): number | null {
  if (!isMergedDeskChartTimeframe(timeframe)) return null;
  const shared = readMergedDeskSharedChartView();
  if (shared?.barSpacing) return shared.barSpacing;
  return MERGED_DESK_DEFAULT_BAR_SPACING;
}

export function ensureMergedDeskDefaultSharedView(sourceTf = '4h'): MergedDeskSharedChartView {
  const existing = readMergedDeskSharedChartView();
  if (existing) return existing;
  const fresh: MergedDeskSharedChartView = {
    visibleBars: MERGED_DESK_DEFAULT_VISIBLE_BARS,
    barSpacing: MERGED_DESK_DEFAULT_BAR_SPACING,
    sourceTf,
    capturedAt: Date.now(),
  };
  writeMergedDeskSharedChartView(fresh);
  return fresh;
}
