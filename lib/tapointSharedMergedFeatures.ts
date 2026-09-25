/**
 * 타점엔진 ↔ 통합·분석 공동 표시 칩.
 * 설정 id는 UserSettings — 저장 버튼 없이 ON/OFF 유지.
 * 기존 타점 전용 기능은 그대로 · 여기 칩만 공동 레이어 추가/OFF.
 */
import { loadSettings, saveSettings, type UserSettings } from '@/lib/settings';
import { SETTINGS_CHANGED_EVENT } from '@/lib/useSettingsChangeTick';

export type TapointSharedMergedFeatureId =
  | 'institutionalBand'
  | 'institutionalBand2'
  | 'mtfDumpZone'
  | 'structureRocket'
  | 'cartBasket'
  | 'sfp'
  | 'parallelChannel';

export const TAPOINT_SHARED_MERGED_FEATURE_CHIPS: ReadonlyArray<{
  id: TapointSharedMergedFeatureId;
  labelKo: string;
  hintKo: string;
  /** UserSettings 키 */
  settingsKey: keyof UserSettings;
}> = [
  {
    id: 'institutionalBand',
    labelKo: '기관밴드',
    hintKo: 'ST 존상·존하 쌍선(채널형) + LH/SH 터치 · 기존 유지',
    settingsKey: 'chartMergedInstitutionalBandEnabled',
  },
  {
    id: 'institutionalBand2',
    labelKo: '기관밴드2',
    hintKo: '통합분석 SuperTrend · 롱=초록 / 숏=빨강 전환선',
    settingsKey: 'tapointSharedInstitutionalBand2Enabled',
  },
  {
    id: 'mtfDumpZone',
    labelKo: '폭락존',
    hintKo: 'MTF 폭락구간 면 · 통합·분석과 동일 설정',
    settingsKey: 'chartMergedDeskMtfDumpZoneEnabled',
  },
  {
    id: 'structureRocket',
    labelKo: '로켓·하락',
    hintKo: '구조 로켓🚀 / 하락그래프📉 · 뜬 봉에 고정',
    settingsKey: 'chartMarkerLayerRocket',
  },
  {
    id: 'cartBasket',
    labelKo: '장바구니',
    hintKo: '장바구니세트 🛒/⚡ 선반영·확정 마커 · 타점 OFF 가능',
    settingsKey: 'tapointSharedCartBasketEnabled',
  },
  {
    id: 'sfp',
    labelKo: 'SFP',
    hintKo: '스윕→회수 SFP 마커 · 타점 OFF 가능',
    settingsKey: 'tapointSharedSfpEnabled',
  },
  {
    id: 'parallelChannel',
    labelKo: '평행채널',
    hintKo: '독수리1호 Parallel Channel · 점수1위만 · 상·하 1쌍 · 통합분석과 동일 · OFF 가능',
    settingsKey: 'chartMergedDeskParallelChannelEngineEnabled',
  },
];

export type TapointSharedMergedFeatureFlags = {
  institutionalBand: boolean;
  institutionalBand2: boolean;
  mtfDumpZone: boolean;
  structureRocket: boolean;
  cartBasket: boolean;
  sfp: boolean;
  parallelChannel: boolean;
};

export function readTapointSharedMergedFeatureFlags(
  s: UserSettings = loadSettings()
): TapointSharedMergedFeatureFlags {
  return {
    institutionalBand: s.chartMergedInstitutionalBandEnabled !== false,
    institutionalBand2: s.tapointSharedInstitutionalBand2Enabled !== false,
    mtfDumpZone: s.chartMergedDeskMtfDumpZoneEnabled !== false,
    structureRocket: s.chartMarkerLayerRocket !== false,
    cartBasket: s.tapointSharedCartBasketEnabled !== false,
    sfp: s.tapointSharedSfpEnabled !== false,
    parallelChannel: s.chartMergedDeskParallelChannelEngineEnabled !== false,
  };
}

const FLAG_TO_KEY: Record<TapointSharedMergedFeatureId, keyof UserSettings> = {
  institutionalBand: 'chartMergedInstitutionalBandEnabled',
  institutionalBand2: 'tapointSharedInstitutionalBand2Enabled',
  mtfDumpZone: 'chartMergedDeskMtfDumpZoneEnabled',
  structureRocket: 'chartMarkerLayerRocket',
  cartBasket: 'tapointSharedCartBasketEnabled',
  sfp: 'tapointSharedSfpEnabled',
  parallelChannel: 'chartMergedDeskParallelChannelEngineEnabled',
};

export function toggleTapointSharedMergedFeature(
  id: TapointSharedMergedFeatureId
): TapointSharedMergedFeatureFlags {
  const s = loadSettings();
  const cur = readTapointSharedMergedFeatureFlags(s);
  const nextOn = !cur[id];
  const key = FLAG_TO_KEY[id];
  saveSettings({ [key]: nextOn } as Partial<UserSettings>);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  }
  return readTapointSharedMergedFeatureFlags();
}
