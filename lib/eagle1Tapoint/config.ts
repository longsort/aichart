/**
 * 타점엔진 모드 설정 — 기존 자동매매 칩/ARM과 병행.
 */
export type TapointModeConfig = {
  enabled: boolean;
  autoExecute: boolean;
  chartTf: string;
  updatedAt: number;
};

const KEY = 'ailongshort.eagle1Tapoint.modeCfg.v1';

export const DEFAULT_TAPOINT_MODE_CFG: TapointModeConfig = {
  enabled: true,
  autoExecute: true,
  chartTf: '15m',
  updatedAt: 0,
};

export function readTapointModeConfig(): TapointModeConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_TAPOINT_MODE_CFG };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_TAPOINT_MODE_CFG };
    const j = JSON.parse(raw) as Partial<TapointModeConfig>;
    return {
      enabled: j.enabled !== false,
      autoExecute: j.autoExecute !== false,
      chartTf: String(j.chartTf || '15m'),
      updatedAt: Number(j.updatedAt) || 0,
    };
  } catch {
    return { ...DEFAULT_TAPOINT_MODE_CFG };
  }
}

export function writeTapointModeConfig(
  patch: Partial<TapointModeConfig>
): TapointModeConfig {
  const prev = readTapointModeConfig();
  const next = { ...prev, ...patch, updatedAt: Date.now() };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
