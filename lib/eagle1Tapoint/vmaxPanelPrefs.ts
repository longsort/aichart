/**
 * 독수리1호 VMAX — 타점엔진 고유 화면 패널 펴기/접기/OFF.
 * v7: 우측 신호감지 생동 브리핑 카드.
 */
export type VmaxPanelId =
  | 'headerStats'
  | 'ticker'
  | 'news'
  | 'leftSignals'
  | 'leftGauge'
  | 'leftRegime'
  | 'leftSession'
  | 'centerChart'
  | 'centerSynth'
  | 'centerFactors'
  | 'centerHistory'
  | 'centerProfit'
  | 'rightSet'
  | 'rightLevels'
  | 'rightCalc'
  | 'rightPositions'
  | 'rightLog'
  | 'rightBrief'
  | 'rightHist'
  | 'rightSignalLive'
  | 'footer';

export type VmaxPanelMode = 'open' | 'fold' | 'off';

export type VmaxPanelPrefs = Record<VmaxPanelId, VmaxPanelMode>;

const KEY = 'ailongshort.eagle1.vmax.panelPrefs.v8';

export const DEFAULT_VMAX_PANEL_PREFS: VmaxPanelPrefs = {
  headerStats: 'open',
  ticker: 'open',
  news: 'fold',
  leftSignals: 'open',
  leftGauge: 'open',
  leftRegime: 'open',
  leftSession: 'fold',
  centerChart: 'open',
  centerSynth: 'open',
  centerFactors: 'open',
  centerHistory: 'fold',
  centerProfit: 'fold',
  rightSet: 'open',
  rightLevels: 'open',
  rightCalc: 'open',
  rightPositions: 'open',
  rightLog: 'fold',
  rightBrief: 'open',
  rightHist: 'open',
  rightSignalLive: 'open',
  footer: 'open',
};

export function readVmaxPanelPrefs(): VmaxPanelPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_VMAX_PANEL_PREFS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_VMAX_PANEL_PREFS };
    const j = JSON.parse(raw) as Partial<VmaxPanelPrefs>;
    return { ...DEFAULT_VMAX_PANEL_PREFS, ...j };
  } catch {
    return { ...DEFAULT_VMAX_PANEL_PREFS };
  }
}

export function writeVmaxPanelPrefs(patch: Partial<VmaxPanelPrefs>): VmaxPanelPrefs {
  const next = { ...readVmaxPanelPrefs(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/** 카드 버튼: 열기 ↔ 접기. OFF는 패널설정에서만 */
export function cycleVmaxPanelMode(cur: VmaxPanelMode): VmaxPanelMode {
  if (cur === 'open') return 'fold';
  return 'open';
}

export const VMAX_PANEL_LABEL_KO: Record<VmaxPanelId, string> = {
  headerStats: '상단성과',
  ticker: '시세줄',
  news: '속보',
  leftSignals: '코인신호',
  leftGauge: '시장게이지',
  leftRegime: '레짐',
  leftSession: '세션',
  centerChart: '타점엔진차트',
  centerSynth: 'AI합성신호',
  centerFactors: '팩터체크',
  centerHistory: '체결이력',
  centerProfit: '수익통계',
  rightSet: '우측트레이딩세트',
  rightLevels: '핵심가격',
  rightCalc: '포지션계산',
  rightPositions: '실시간포지션',
  rightLog: '알림로그',
  rightBrief: '타점브리핑',
  rightHist: '유사표본',
  rightSignalLive: '신호감지',
  footer: '하단상태',
};
