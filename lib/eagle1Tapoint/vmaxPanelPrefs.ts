/**
 * 독수리1호 VMAX — 패널 펴기/접기/OFF 사용자 설정.
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
  | 'rightLevels'
  | 'rightCalc'
  | 'rightPositions'
  | 'rightLog'
  | 'footer';

export type VmaxPanelMode = 'open' | 'fold' | 'off';

export type VmaxPanelPrefs = Record<VmaxPanelId, VmaxPanelMode>;

const KEY = 'ailongshort.eagle1.vmax.panelPrefs.v1';

export const DEFAULT_VMAX_PANEL_PREFS: VmaxPanelPrefs = {
  headerStats: 'open',
  ticker: 'open',
  news: 'open',
  leftSignals: 'open',
  leftGauge: 'open',
  leftRegime: 'open',
  leftSession: 'fold',
  centerChart: 'open',
  centerSynth: 'open',
  centerFactors: 'open',
  centerHistory: 'fold',
  centerProfit: 'fold',
  rightLevels: 'open',
  rightCalc: 'open',
  rightPositions: 'open',
  rightLog: 'fold',
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

export function cycleVmaxPanelMode(cur: VmaxPanelMode): VmaxPanelMode {
  if (cur === 'open') return 'fold';
  if (cur === 'fold') return 'off';
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
  centerChart: '메인차트',
  centerSynth: 'AI합성',
  centerFactors: '팩터체크',
  centerHistory: '체결이력',
  centerProfit: '수익통계',
  rightLevels: '핵심가격',
  rightCalc: '포지션계산',
  rightPositions: '실시간포지션',
  rightLog: '알림로그',
  footer: '하단상태',
};
