const KEY = 'ailongshort-settings';

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
  /** 가로줄(키레벨 등) 굵기 */
  overlayLineThickness: 'thin' | 'normal' | 'thick';
  webhookEnabled: boolean;
  webhookMinConfidence: number;
  favoriteSymbols: string[];
};

export const defaultSettings: UserSettings = {
  theme: 'dark',
  showStructure: false,
  showZones: false,
  showLabels: false,
  showScenario: false,
  showFib: false,
  showRsi: false,
  showHarmonic: false,
  showPo3: false,
  showCandle: false,
  showBpr: false,
  showRsiPanel: false,
  showMacdPanel: false,
  showBbPanel: false,
  showVision: false,
  showVisionTriangle: false,
  showVisionFlag: false,
  showVisionWedge: false,
  showVisionReversal: false,
  showVisionRange: false,
  showReactionZone: false,
  showWhaleZone: false,
  overlayLabelEditMode: false,
  overlayLabelFontSize: 11,
  overlayLineThickness: 'normal',
  webhookEnabled: false,
  webhookMinConfidence: 70,
  favoriteSymbols: [],
};

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
