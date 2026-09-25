'use client';

import type { ReactNode } from 'react';
import type { UIMode } from '@/lib/settings';
import UIModeSwitcher from '@/app/components/UIModeSwitcher';
import { ZONE_LINE_PRO_MODE_LABEL } from '@/lib/zoneLineProMode';

type Props = {
  uiMode: UIMode;
  onUiModeChange: (mode: UIMode) => void;
  symbol: string;
  timeframe: string;
  theme: 'dark' | 'light';
  chartSlot: () => ReactNode;
};

/** 존·라인 — 차트만. 보드·카드 없음 */
export default function ZoneLineProShell({
  uiMode,
  onUiModeChange,
  symbol,
  timeframe,
  theme,
  chartSlot,
}: Props) {
  return (
    <div className="zone-line-pro-shell" data-theme={theme}>
      <div className="zone-line-pro-shell__head">
        <div>
          <div className="zone-line-pro-shell__title">{ZONE_LINE_PRO_MODE_LABEL} · 개선</div>
          <div className="zone-line-pro-shell__sub">
            {symbol} · {timeframe} — LinReg · CP · HotZone · Strike E/SL/TP
          </div>
        </div>
        <UIModeSwitcher uiMode={uiMode} setUiMode={onUiModeChange} compact />
      </div>
      <div className="zone-line-pro-shell__chart">{chartSlot()}</div>
    </div>
  );
}
