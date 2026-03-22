const KEY = 'ailongshort-settings';

export type UIMode = 'FULL' | 'FOCUS' | 'EXECUTION' | 'TAPPOINT';

/** 모드별 기능 ON/OFF 오버라이드. 없으면 전역 show* 사용 */
export type ModeFeatureOverrides = Partial<Record<UIMode, Partial<{
  showStructure: boolean;
  showZones: boolean;
  showLabels: boolean;
  showScenario: boolean;
  showFib: boolean;
  showRsi: boolean;
  showHarmonic: boolean;
  showPo3: boolean;
  showCandle: boolean;
  showBpr: boolean;
  showVision: boolean;
  showVisionTriangle: boolean;
  showVisionFlag: boolean;
  showVisionWedge: boolean;
  showVisionReversal: boolean;
  showVisionRange: boolean;
  showReactionZone: boolean;
  showWhaleZone: boolean;
}>>>;

export type UserSettings = {
  theme: 'dark' | 'light';
  showStructure: boolean;
  showZones: boolean;
  showLabels: boolean;
  showScenario: boolean;
  showFib: boolean;
  showRsi: boolean;
  showHarmonic: boolean;
  showPo3: boolean;
  showCandle: boolean;
  showBpr: boolean;
  showRsiPanel: boolean;
  showMacdPanel: boolean;
  showBbPanel: boolean;
  showVision: boolean;
  showVisionTriangle: boolean;
  showVisionFlag: boolean;
  showVisionWedge: boolean;
  showVisionReversal: boolean;
  showVisionRange: boolean;
  showReactionZone: boolean;
  /** 세력/고래 매수·매도 구간 (거래소 API 기반 zone 확률) — 실행 화면 기본 표시 */
  showWhaleZone: boolean;
  /** 레이블 위치 조정 모드 (겹친 레이블 드래그/버튼으로 이동) */
  overlayLabelEditMode: boolean;
  /** 전체 라벨 기본 글자 크기 (8~24) */
  overlayLabelFontSize: number;
  /** 우측 축·시간축 등 차트 스케일 글자 크기 (lightweight-charts layout.fontSize, 10~18) */
  chartScaleFontSize: number;
  /** 존/줄 옆 오버레이 가격 표시 글자 크기 (8~18) */
  overlayPriceStripFontSize: number;
  /** 가로줄(키레벨 등) 굵기 */
  overlayLineThickness: 'thin' | 'normal' | 'thick';
  webhookEnabled: boolean;
  webhookMinConfidence: number;
  favoriteSymbols: string[];
  /** 스윙 타점 레버리지 계산용 시드(USDT). 사용자 입력. */
  swingSeedUsdt: number;
  /** 가상매매 시드(USDT). 사용자 입력. 이 시드로 자동 가상매매 시도. */
  virtualTradeSeedUsdt: number;
  /** 가상매매 백그라운드 켜기 — 차트 무관하게 각 TF별 자동 분석·진입 */
  virtualTradeEnabled: boolean;
  /** 가상매매 추적 심볼 (백그라운드에서 분석할 심볼 목록) */
  virtualTradeSymbols: string[];
  /** 가상매매 추적 타임프레임 (분/시/일/주/달) */
  virtualTradeTimeframes: string[];
  /** 영어 라벨을 한글로 번역 (차트 오버레이) */
  translateLabelsToKo: boolean;
  /** 모드별 기능 ON/OFF. 선택한 모드에서 개별 토글 */
  modeFeatureOverrides?: ModeFeatureOverrides;
};

/** 차트 캔들 분석 기능 기본값 — 전부 활성화 */
export const defaultSettings: UserSettings = {
  theme: 'dark',
  showStructure: true,
  showZones: true,
  showLabels: true,
  showScenario: true,
  showFib: true,
  showRsi: true,
  showHarmonic: true,
  showPo3: true,
  showCandle: true,
  showBpr: true,
  showRsiPanel: true,
  showMacdPanel: true,
  showBbPanel: true,
  showVision: true,
  showVisionTriangle: true,
  showVisionFlag: true,
  showVisionWedge: true,
  showVisionReversal: true,
  showVisionRange: true,
  showReactionZone: true,
  showWhaleZone: true,
  overlayLabelEditMode: false,
  overlayLabelFontSize: 11,
  chartScaleFontSize: 12,
  overlayPriceStripFontSize: 10,
  overlayLineThickness: 'normal',
  webhookEnabled: false,
  webhookMinConfidence: 70,
  favoriteSymbols: [],
  swingSeedUsdt: 3000,
  virtualTradeSeedUsdt: 1000,
  virtualTradeEnabled: true,
  virtualTradeSymbols: ['BTCUSDT'],
  virtualTradeTimeframes: ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'],
  translateLabelsToKo: false,
  modeFeatureOverrides: {},
};

/** 현재 모드에서 적용되는 기능 설정 (전역 + 모드별 오버라이드) */
export function getEffectiveFeatureToggles(settings: UserSettings, uiMode: UIMode) {
  const base = {
    showStructure: (uiMode === 'EXECUTION' || uiMode === 'TAPPOINT') ? true : settings.showStructure,
    showZones: (uiMode === 'EXECUTION' || uiMode === 'TAPPOINT') ? true : settings.showZones,
    showLabels: settings.showLabels,
    showScenario: settings.showScenario,
    showFib: settings.showFib,
    showRsi: (uiMode === 'EXECUTION' || uiMode === 'TAPPOINT') ? true : settings.showRsi,
    showHarmonic: settings.showHarmonic,
    showPo3: settings.showPo3,
    showCandle: settings.showCandle,
    showBpr: settings.showBpr,
    showVision: settings.showVision,
    showVisionTriangle: settings.showVisionTriangle,
    showVisionFlag: settings.showVisionFlag,
    showVisionWedge: settings.showVisionWedge,
    showVisionReversal: settings.showVisionReversal,
    showVisionRange: settings.showVisionRange,
    showReactionZone: settings.showReactionZone,
    showWhaleZone: settings.showWhaleZone,
  };
  const overrides = settings.modeFeatureOverrides?.[uiMode];
  if (!overrides) return base;
  return { ...base, ...overrides };
}

export function loadSettings(): UserSettings {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {}
  return { ...defaultSettings };
}

export function saveSettings(s: Partial<UserSettings>) {
  try {
    const curr = loadSettings();
    const next = { ...defaultSettings, ...curr, ...s };
    if (typeof window !== 'undefined') window.localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {}
  return loadSettings();
}
