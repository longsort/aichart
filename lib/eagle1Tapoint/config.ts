/**
 * 타점엔진 모드 설정 — 기존 자동매매 칩/ARM과 병행.
 * tapOnly=true 이면 구 Dual/AIZONE 등 자동주문 OFF · 타점만.
 */
import { sessionScopedStorageKey } from '@/lib/settings';

export type TapointModeConfig = {
  enabled: boolean;
  autoExecute: boolean;
  /** 구신호 자동주문 전부 OFF · 타점엔진만 */
  tapOnly: boolean;
  /**
   * 확정롱/숏 전환 알림 — TG·반짝임·OS알림·진동.
   * false면 전부 OFF (주문과 별개).
   */
  confirmAlertOn: boolean;
  /** 차트 위 타점결정 확정 카드. false면 카드만 끔 · 텔레그램은 확정알림을 따름 */
  chartConfirmCardOn: boolean;
  chartTf: string;
  updatedAt: number;
};

const KEY_BASE = 'ailongshort.eagle1Tapoint.modeCfg.v2';

function cfgKey(): string {
  return sessionScopedStorageKey(KEY_BASE);
}

export const DEFAULT_TAPOINT_MODE_CFG: TapointModeConfig = {
  enabled: true,
  autoExecute: true,
  tapOnly: true,
  confirmAlertOn: true,
  chartConfirmCardOn: true,
  chartTf: '15m',
  updatedAt: 0,
};

export function readTapointModeConfig(): TapointModeConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_TAPOINT_MODE_CFG };
  try {
    const raw = window.localStorage.getItem(cfgKey()) || window.localStorage.getItem(KEY_BASE);
    if (!raw) {
      /** v1 → v2 이전 */
      const legacy = window.localStorage.getItem('ailongshort.eagle1Tapoint.modeCfg.v1');
      if (legacy) {
        const j = JSON.parse(legacy) as Partial<TapointModeConfig>;
        return {
          enabled: j.enabled !== false,
          autoExecute: j.autoExecute !== false,
          tapOnly: true,
          confirmAlertOn: j.confirmAlertOn !== false,
          chartConfirmCardOn: j.chartConfirmCardOn !== false,
          chartTf: String(j.chartTf || '15m'),
          updatedAt: Number(j.updatedAt) || 0,
        };
      }
      return { ...DEFAULT_TAPOINT_MODE_CFG };
    }
    const j = JSON.parse(raw) as Partial<TapointModeConfig>;
    return {
      enabled: j.enabled !== false,
      autoExecute: j.autoExecute !== false,
      tapOnly: j.tapOnly !== false,
      confirmAlertOn: j.confirmAlertOn !== false,
      chartConfirmCardOn: j.chartConfirmCardOn !== false,
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
    window.localStorage.setItem(cfgKey(), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function isTapointTapOnly(): boolean {
  return readTapointModeConfig().tapOnly !== false;
}

export function isTapointConfirmAlertOn(): boolean {
  return readTapointModeConfig().confirmAlertOn !== false;
}

export function tapOnlyStatusKo(): string {
  return '15분밴드자동 · 전코인 15m · Paper · LIVE금지';
}

export function tapOnlyArmHintKo(liveArmed: boolean): string {
  return liveArmed
    ? '15분밴드자동 ARM · Paper만 · 구스킬 주문금지'
    : '15분밴드자동 ARM OFF · 신규진입 중지';
}
