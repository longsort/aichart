/**
 * 통합·분석 차트 표시 설정 — 글자·위치·존색·레이어 ON/OFF 초기화·기본값.
 * 확정 수익·승률 보장 아님.
 */
import {
  defaultSettings,
  loadSettings,
  saveSettings,
  type UserSettings,
} from '@/lib/settings';
import { SETTINGS_CHANGED_EVENT } from '@/lib/useSettingsChangeTick';

/** 차트 레이아웃·라벨 위치 전용 localStorage (UserSettings 밖) */
export const MERGED_DESK_CHART_LAYOUT_LS_KEYS = [
  'ailongshort-overlay-offsets',
  'ailongshort-overlay-font-sizes',
  'ailongshort-overlay-font-family',
  'ailongshort-overlay-label-align',
  'ailongshort-overlay-label-h-shift',
  'ailongshort-overlay-hidden-ids',
  'ailongshort-overlay-chart-text-hidden-ids',
  'ailongshort-overlay-price-position',
  'ailongshort-overlay-price-h-shift',
  'ailongshort-close-strip-position',
  'ailongshort-close-strip-h-shift',
  'ailongshort-zone-label-position',
  'ailongshort-zone-label-h-shift',
  'ailongshort-label-settings-ui-v1',
  'ailongshort-merged-desk-swing-draw',
  'ailongshort-chart-section-visibility-v2',
] as const;

export const MERGED_DESK_CHART_LAYOUT_RESET_EVENT = 'ailongshort-merged-desk-chart-layout-reset';
/** 통합모드 전용 차트설정 열기 */
export const OPEN_MERGED_DESK_CHART_SETTINGS_EVENT = 'ailongshort-open-merged-desk-chart-settings';
/** 글자 위치·존색 등 레이아웃 즉시 반영 */
export const MERGED_DESK_CHART_DISPLAY_TICK_EVENT = 'ailongshort-merged-desk-chart-display-tick';

/** 한 번만 자동 초기화 — 사용자 요청「차트설정 전부 초기화」반영 */
const MERGED_DESK_DISPLAY_RESET_ONCE_KEY = 'ailongshort-merged-desk-display-reset-v2026-08-08';

/**
 * 통합모드 진입 시 레이아웃·표시 설정을 1회 기본값으로 맞춤.
 * 이후에는「전부 초기화」버튼으로만 다시 리셋.
 */
export function maybeAutoResetMergedDeskChartDisplayOnce(): UserSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    if (window.localStorage.getItem(MERGED_DESK_DISPLAY_RESET_ONCE_KEY) === '1') return null;
  } catch {
    return null;
  }
  const next = resetMergedDeskChartDisplayAll();
  try {
    window.localStorage.setItem(MERGED_DESK_DISPLAY_RESET_ONCE_KEY, '1');
  } catch {
    /* ignore */
  }
  return next;
}

/** 통합모드에서 사용자가 조절하는 표시 기본값 (전부 초기화 시) */
export function mergedDeskChartDisplayDefaultsPatch(): Partial<UserSettings> {
  return {
    overlayLabelFontSize: defaultSettings.overlayLabelFontSize,
    chartScaleFontSize: defaultSettings.chartScaleFontSize,
    overlayPriceStripFontSize: defaultSettings.overlayPriceStripFontSize,
    chartBulkHideLabels: false,
    chartBulkHideHLines: false,
    chartBulkHideZones: false,
    zoneFillSupplyHex: defaultSettings.zoneFillSupplyHex,
    zoneFillDemandHex: defaultSettings.zoneFillDemandHex,
    zoneFillNeutralHex: defaultSettings.zoneFillNeutralHex,
    zoneFillWarningHex: defaultSettings.zoneFillWarningHex,
    chartMirageZoneFaceCompact: true,
    chartMirageZoneFaceLang: 'ko',
    chartMirageZoneFaceReveal: 'progressive',
    chartMergedInstitutionalBandEnabled: true,
    chartMonthDeskFusionDeskBandEnabled: true,
    chartMergedDeskActionablePatternEnabled: true,
    chartMergedDeskPatternSilhouetteEnabled: true,
    chartMergedDeskAssetsChartAiEnabled: true,
    chartMergedDeskSuperAiEnabled: true,
    chartMergedDeskAiAnalysisZoneEnabled: false,
    chartMergedDeskZoneBattleHudEnabled: true,
    chartMergedDeskUnifiedCloudEnabled: true,
    chartMergedDeskBtccionDrawEnabled: true,
    chartMergedDeskBlueRedChannelsEnabled: true,
    chartMergedDeskRbVolumeSyncEnabled: true,
    chartMergedDeskRbShowShort: true,
    chartMergedDeskRbShowLong: true,
    chartMergedDeskRbShowConfluence: true,
    chartMergedDeskRbShowEdges: true,
    chartMergedDeskRbShowMid: true,
    chartMergedDeskRbShowLabels: true,
    chartMergedDeskRbBullHex: defaultSettings.chartMergedDeskRbBullHex,
    chartMergedDeskRbBearHex: defaultSettings.chartMergedDeskRbBearHex,
    chartMergedDeskRbConfluenceHex: defaultSettings.chartMergedDeskRbConfluenceHex,
    chartMergedDeskRbFillOpacity: defaultSettings.chartMergedDeskRbFillOpacity,
    chartMergedDeskRbLineWidth: defaultSettings.chartMergedDeskRbLineWidth,
    chartMergedDeskRbWidthScale: defaultSettings.chartMergedDeskRbWidthScale,
    chartMergedDeskRbMinQuality: defaultSettings.chartMergedDeskRbMinQuality,
    chartMergedDeskRbPullbackEntryEnabled: true,
    chartMergedDeskRbPullbackLinesEnabled: true,
    chartMergedDeskRbPullbackMinScore: defaultSettings.chartMergedDeskRbPullbackMinScore,
    chartMergedDeskRbPullbackCounterTrend: true,
    chartLabelIndividualMove: false,
    chartMergedDeskRbAnchorMode: 'auto',
    chartMergedDeskRbLabelFontSize: defaultSettings.chartMergedDeskRbLabelFontSize,
    chartMergedDeskRbLabelShiftX: 0,
    chartMergedDeskRbLabelShiftY: 0,
    chartMergedDeskRbCoreZonesEnabled: true,
    chartMergedDeskRbAiZoneFaceEnabled: true,
    chartMergedDeskRbCoreMarkersEnabled: false,
    chartMergedDeskRbCoreCandlePaintEnabled: true,
    chartMergedDeskSwingDrawEnabled: true,
    chartMergedDeskOverlayLabelsEnabled: true,
    chartMergedDeskLabelAlignDefault: 'right',
    chartMergedDeskEuromap: {},
    chartMergedDeskZoneFillOpacity: 46,
    chartMonthDeskBitgetCandles: true,
    chartTfCloseSettlementLines: true,
    chartPrimeTrendChannelsTopHex: defaultSettings.chartPrimeTrendChannelsTopHex,
    chartPrimeTrendChannelsCenterHex: defaultSettings.chartPrimeTrendChannelsCenterHex,
    chartPrimeTrendChannelsBottomHex: defaultSettings.chartPrimeTrendChannelsBottomHex,
  };
}

export function clearMergedDeskChartLayoutLocalStorage(): void {
  if (typeof window === 'undefined') return;
  for (const key of MERGED_DESK_CHART_LAYOUT_LS_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  try {
    window.localStorage.setItem('ailongshort-zone-label-position', 'right');
    window.localStorage.setItem('ailongshort-overlay-price-position', 'left');
    window.localStorage.setItem('ailongshort-close-strip-position', 'left');
    window.localStorage.setItem('ailongshort-merged-desk-swing-draw', '1');
  } catch {
    /* ignore */
  }
}

/**
 * 통합모드 차트 설정 전부 초기화 — 표시 기본값 + 레이아웃 LS 클리어.
 * 분석 엔진·기능 자체는 삭제하지 않음.
 */
export function resetMergedDeskChartDisplayAll(): UserSettings {
  const prev = loadSettings();
  const modeOverrides = { ...(prev.modeFeatureOverrides || {}) };
  delete modeOverrides.MERGED_ANALYSIS_DESK;
  const next = saveSettings({
    ...prev,
    ...mergedDeskChartDisplayDefaultsPatch(),
    modeFeatureOverrides: modeOverrides,
  });
  clearMergedDeskChartLayoutLocalStorage();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(MERGED_DESK_CHART_LAYOUT_RESET_EVENT));
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  }
  return next;
}
