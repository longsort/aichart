'use client';

import { useEffect, useState } from 'react';

/** ChartView `apply`가 설정을 바꿀 때 디스패치 — 퓨전 프로필이 RSI 등과 동기화되도록 */
export const SETTINGS_CHANGED_EVENT = 'ailongshort-settings-changed';

export function useSettingsChangeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fn = () => setTick((t) => t + 1);
    window.addEventListener(SETTINGS_CHANGED_EVENT, fn);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, fn);
  }, []);
  return tick;
}
