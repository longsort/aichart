import {
  defaultPageLayout,
  defaultSettings,
  mergePageLayout,
  coerceInstitutionalBandTouchTierMask,
  type UserSettings,
} from './settings';

/** `data/user-settings.json`에 저장된 부분 객채 → 전역 `defaultSettings` 병합 */
export function mergeUserSettingsFromServerJson(
  partial: Record<string, unknown> | null | undefined
): UserSettings {
  if (!partial || typeof partial !== 'object') {
    const d = { ...defaultSettings };
    coerceInstitutionalBandTouchTierMask(d);
    return d;
  }
  const merged = { ...defaultSettings, ...partial } as UserSettings;
  const pl = (partial as Partial<UserSettings>).pageLayout;
  merged.pageLayout = mergePageLayout({
    ...defaultPageLayout,
    ...(pl && typeof pl === 'object' ? (pl as object) : {}),
  });
  coerceInstitutionalBandTouchTierMask(merged);
  return merged;
}
