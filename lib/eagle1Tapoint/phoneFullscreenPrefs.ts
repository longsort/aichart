/**
 * 타점엔진 — 폰 전용 전체화면 모드 A/B.
 * 새로고침/첫 진입 = 항상 전뷰(off). A/B는 칩 클릭 세션에서만.
 * A=팩터접힘 · B=팩터펼침 · 게이지 대기=노랑/롱=초록/숏=빨강.
 */
export type TapointPhoneFsMode = 'off' | 'A' | 'B';

export type TapointPhoneFsPrefs = {
  mode: TapointPhoneFsMode;
  factorExpanded: boolean;
};

const KEY = 'ailongshort.eagle1.tapoint.phoneFs.v3';
const LEGACY_KEYS = [
  'ailongshort.eagle1.tapoint.phoneFs.v1',
  'ailongshort.eagle1.tapoint.phoneFs.v2',
] as const;

export const DEFAULT_PHONE_FS_PREFS: TapointPhoneFsPrefs = {
  mode: 'off',
  factorExpanded: false,
};

/** 탭 세션 중 A/B 유지 · 새로고침 시 전뷰 */
let sessionMode: TapointPhoneFsMode = 'off';
let sessionFactor = false;
let hydrated = false;

function clearLegacy(): void {
  if (typeof window === 'undefined') return;
  for (const k of LEGACY_KEYS) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

function readFactorFromStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return false;
    const j = JSON.parse(raw) as { factorExpanded?: boolean };
    return j.factorExpanded === true;
  } catch {
    return false;
  }
}

function persistFactor(factorExpanded: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ factorExpanded }));
  } catch {
    /* ignore */
  }
}

export function readTapointPhoneFsPrefs(): TapointPhoneFsPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_PHONE_FS_PREFS };
  clearLegacy();
  if (!hydrated) {
    /** 첫 로드만 — 전뷰 강제 (구버전 A/B 저장 무시) */
    sessionMode = 'off';
    sessionFactor = readFactorFromStorage();
    hydrated = true;
    persistFactor(sessionFactor);
  }
  return { mode: sessionMode, factorExpanded: sessionFactor };
}

export function writeTapointPhoneFsPrefs(
  patch: Partial<TapointPhoneFsPrefs>
): TapointPhoneFsPrefs {
  if (!hydrated) {
    readTapointPhoneFsPrefs();
  }
  if (patch.mode !== undefined) sessionMode = patch.mode;
  if (patch.factorExpanded !== undefined) {
    sessionFactor = patch.factorExpanded;
    persistFactor(sessionFactor);
  }
  return { mode: sessionMode, factorExpanded: sessionFactor };
}

/** matchMedia 기준 — DeskView CSS @media (max-width: 700px) 와 동일 */
export const TAPOINT_PHONE_MQ = '(max-width: 700px)';

export function isTapointPhoneViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(TAPOINT_PHONE_MQ).matches;
}
